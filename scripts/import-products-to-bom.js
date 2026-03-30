'use strict';
/**
 * import-products-to-bom.js
 * ──────────────────────────────────────────────────────────────────────────────
 * One-time (re-runnable) migration: reads data/Products.xlsx (cost-dashboard
 * source) and imports each product as a bom_records + bom_record_materials row.
 *
 * Logic is documented in /memories/repo/products-to-bom-migration.md
 *
 * Duplicate detection:
 *   - SAP ID present → skip if same SAP ID + Line already in bom_records
 *   - SAP ID absent  → skip if same PD ID already in bom_records
 *
 * All material names are trimmed; use scripts/products-to-bom-material-mapping.csv
 * for xlsx_name → db_name mapping.
 */

const path = require('path');
const fs   = require('fs');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DB_PATH          = path.join(__dirname, '..', 'data', 'mini_erp.db');
const PRODUCTS_PATH    = path.join(__dirname, '..', 'data', 'Products.xlsx');
const LINE_PARAMS_PATH = path.join(__dirname, '..', 'data', 'Line_parameters.xlsx');
const MAPPING_CSV_PATH = path.join(__dirname, 'products-to-bom-material-mapping.csv');

/** ID of the "created_by" user (PD_testuser@pfnonwovens.com — from src/data/mini_erp.db) */
const IMPORT_USER_ID = 'b1145c16b0c3f89e616b1224b38cfcb8';

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); })
  );
}
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); })
  );
}

/** Parse a numeric value from any xlsx cell; returns null for empty/invalid */
function num(val) {
  if (val === '' || val === null || val === undefined) return null;
  const v = parseFloat(val);
  return isNaN(v) ? null : v;
}

function toPercentMaybeFraction(val) {
  const v = num(val);
  if (v === null) return null;
  return v <= 1 ? v * 100 : v;
}

/** Generate integer ID same as server.js pattern */
function generateId() {
  return (Date.now() * 1000) + Math.floor(Math.random() * 1000);
}

// ─── CSV PARSER (handles quoted fields with commas) ───────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"')                   { inQ = !inQ; }
    else if (c === ',' && !inQ)      { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !inQ) {
      row.push(field); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else                           { field += c; }
  }
  if (row.length && row.some(x => x !== '')) rows.push(row);
  return rows;
}

// ─── LOAD MATERIAL NAME MAPPING ───────────────────────────────────────────────
/** Returns Map<xlsxName → dbName>; SKIP-action entries are excluded. */
function loadMaterialMapping() {
  const text = fs.readFileSync(MAPPING_CSV_PATH, 'utf8');
  const rows = parseCsv(text);
  const map  = new Map();
  for (const row of rows.slice(1)) {          // skip header
    const xlsxName = (row[0] || '').trim();
    const dbName   = (row[1] || '').trim();
    const action   = (row[2] || '').trim().toUpperCase();
    if (xlsxName && action !== 'SKIP') {
      map.set(xlsxName, dbName);              // dbName may be '' for SKIP
    }
  }
  return map;
}

// ─── LOAD LINE PARAMETERS ─────────────────────────────────────────────────────
/**
 * Line_parameters.xlsx is row-oriented:
 *   Row 0  : line IDs              (col 0 = "Line")
 *   Row 2  : Width (m)             → max_usable_width
 *   Row 3  : SB - effective width  → usable_width
 *   Row 7  : Spin belt max speed   → belt_speed
 *   Row 9  : S Beams               → s_beams
 *   Row 10 : M Bearms (typo)       → m_beams
 */
function loadLineParams() {
  const wb  = xlsx.readFile(LINE_PARAMS_PATH);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false });

  const [lineRow,,widthRow, sbWidthRow,,,, beltSpeedRow,, sBeamsRow, mBeamsRow] = raw;
  const map = new Map();
  for (let col = 1; col < lineRow.length; col++) {
    const lineId = (lineRow[col] || '').trim();
    if (!lineId) continue;
    map.set(lineId, {
      max_usable_width: num(widthRow[col]),
      usable_width:     num(sbWidthRow[col]),
      belt_speed:       num(beltSpeedRow[col]),
      s_beams:          num(sBeamsRow[col]) !== null ? parseInt(sBeamsRow[col], 10) : null,
      m_beams:          num(mBeamsRow[col]) !== null ? parseInt(mBeamsRow[col], 10) : null,
    });
  }
  return map;
}

/**
 * Resolve line ID to params, with fallback: strip trailing letters
 * (e.g. "CZ12s" → "CZ12", "CZ12a" → "CZ12").
 */
function getLineParams(lineParamsMap, rawLineId) {
  if (!rawLineId) return {};
  const lineId = rawLineId.trim();
  if (lineParamsMap.has(lineId)) return lineParamsMap.get(lineId);
  const normalized = lineId.replace(/[a-zA-Z]+$/, '');
  if (lineParamsMap.has(normalized)) return lineParamsMap.get(normalized);
  return {};
}

// ─── MATERIAL LABEL FROM DB NAME ─────────────────────────────────────────────
/**
 * Derive bom_record_materials.material_label from the db_name prefix.
 * Returns null for unknown prefixes (will be logged as a warning).
 */
function getLabelFromDbName(dbName) {
  if (!dbName) return null;
  if (/^(PPSB|PPMF|PE|PET|PLA)\s*-/.test(dbName)) return 'Spunbond polymer';
  if (/^PPMB\s*-/.test(dbName))                    return 'Meltblown polymer';
  if (/^Pig\s*-/.test(dbName))                     return 'Pigment';
  if (/^Add\s*-/.test(dbName))                     return 'Additive';
  if (/^Surf\s*-/.test(dbName))                    return 'Surfactant';
  return null;
}

// ─── MATERIAL COLUMN PAIRS (xlsx name column → xlsx percentage column) ────────
// For SB1 the "Adj. SB1%" adjusted value is used instead of raw "SB1%".
const MATERIAL_COLS = [
  { nameCol: 'SB1',       pctCol: 'Adj. SB1%' },
  { nameCol: 'SB2',       pctCol: 'SB2%' },
  { nameCol: 'SB3',       pctCol: 'SB3%' },
  { nameCol: 'MB1',       pctCol: 'MB1%' },
  { nameCol: 'MB2',       pctCol: 'MB2%' },
  { nameCol: 'PE1',       pctCol: 'PE1%' },
  { nameCol: 'PE2',       pctCol: 'PE2%' },
  { nameCol: 'Softener1', pctCol: 'Softener1%' },
  { nameCol: 'Softener2', pctCol: 'Softener2%' },
  { nameCol: 'Softener3', pctCol: 'Softener3%' },
  { nameCol: 'Color1',    pctCol: 'Color1%' },
  { nameCol: 'Color2',    pctCol: 'Color2%' },
  { nameCol: 'Color3',    pctCol: 'Color3%' },
  { nameCol: 'Additive1', pctCol: 'Additive1%' },
  { nameCol: 'Additive2', pctCol: 'Additive2%' },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== import-products-to-bom.js ===\n');

  const materialMapping = loadMaterialMapping();
  console.log(`Material mapping entries loaded: ${materialMapping.size}`);

  const lineParamsMap = loadLineParams();
  console.log(`Line parameters loaded for: ${[...lineParamsMap.keys()].join(', ')}`);

  const wb   = xlsx.readFile(PRODUCTS_PATH);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '', raw: true });
  console.log(`Products.xlsx rows: ${rows.length}\n`);

  const db = new sqlite3.Database(DB_PATH);
  await dbRun(db, 'PRAGMA foreign_keys = ON');

  try {
    await dbRun(db, 'ALTER TABLE bom_records ADD COLUMN overconsumption REAL');
    console.log('[MIGRATION] Added overconsumption column to bom_records');
  } catch (err) {
    if (!String(err.message || '').includes('duplicate column name')) throw err;
  }

  let inserted = 0, skippedDup = 0, skippedEmpty = 0;
  const warnings = [];

  await dbRun(db, 'BEGIN');
  try {
    for (const row of rows) {
      const sapId   = String(row['SAP ID']  || '').trim();
      const pdId    = String(row['PD ID'] || '').trim();
      const lineVal = String(row['Line']    || '').trim();

      // Skip blank rows
      const customer = String(row['Customer'] || '').trim();
      if (!pdId && !sapId && !customer) {
        skippedEmpty++;
        continue;
      }

      // Skip rows where PD ID is present but not purely numeric (test/draft rows)
      if (pdId && !/^\d+$/.test(pdId)) {
        console.log(`  SKIP (non-numeric PD): PD="${pdId}" SAP="${sapId}" Customer="${customer}"`);
        skippedEmpty++;
        continue;
      }

      // ── Duplicate check ──────────────────────────────────────────────────
      let isDup = false;
      if (sapId) {
        const ex = await dbGet(db,
          'SELECT id FROM bom_records WHERE sap_id = ? AND line = ?',
          [sapId, lineVal || null]);
        if (ex) isDup = true;
      } else if (pdId) {
        const ex = await dbGet(db,
          'SELECT id FROM bom_records WHERE pd_id = ?', [pdId]);
        if (ex) isDup = true;
      }
      if (isDup) {
        console.log(`  SKIP (dup):      PD=${pdId || '-'} SAP=${sapId || '-'} Line=${lineVal || '-'}`);
        skippedDup++;
        continue;
      }

      // ── Resolve ID ───────────────────────────────────────────────────────
      let recordId = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateId();
        const ex = await dbGet(db, 'SELECT id FROM bom_records WHERE id = ?', [candidate]);
        if (!ex) { recordId = candidate; break; }
        await new Promise(r => setTimeout(r, 1));  // ensure next ms
      }
      if (!recordId) throw new Error('Unable to allocate BOM record ID after 5 attempts');

      // ── Numeric fields ───────────────────────────────────────────────────
      const grossYieldFrac = num(row['Gross Yield']);   // 0–1 fraction
      const sikoFrac       = num(row['Siko%']);          // 0–1 fraction
      const reproFrac      = num(row['Repro%']);         // 0–1 fraction
      const throughput     = num(row['Throughput']);
      const prodTime       = num(row['Production_Time_(t)']);
      const customerBw     = num(row['Basis weight']);
      const slitWidth      = num(row['Slit width']);
      const overconsPct    = toPercentMaybeFraction(row['Overconsumption']);

      const grossYieldPct  = grossYieldFrac !== null ? grossYieldFrac * 100 : null;
      const totalScrapPct  = grossYieldFrac !== null ? (1 - grossYieldFrac) * 100 : null;
      const sikoPct        = sikoFrac  !== null ? sikoFrac  * 100 : null;
      const reproPct       = reproFrac !== null ? reproFrac * 100 : null;

      // ── Line parameters from Line_parameters.xlsx ────────────────────────
      const lp = getLineParams(lineParamsMap, lineVal);

      // ── Author from Products.xlsx column ─────────────────────────────────
      const author = String(row['Author'] || '').trim() || null;

      // ── Insert bom_records ───────────────────────────────────────────────
      await dbRun(db, `
        INSERT INTO bom_records (
          id, sap_id, pd_id, customer, market_segment, application, smms, mono_bico,
          treatment, color, bonding, customer_bw, slit_width, line,
          belt_speed, siko_percent, repro_percent,
          max_usable_width, usable_width,
          total_scrap_percent, gross_yield_percent,
          s_beams, m_beams, total_throughput, production_time,
          main_raw_mat, overconsumption, author, created_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        recordId,
        sapId || null,
        pdId || null,
        customer || null,
        String(row['Market segment'] || '').trim() || null,
        String(row['Application']   || '').trim() || null,
        String(row['S/SMS']         || '').trim() || null,
        String(row['Mono/Bico']     || '').trim() || null,
        String(row['Treatment']     || '').trim() || null,
        String(row['Color']         || '').trim() || null,
        String(row['Bonding']       || '').trim() || null,
        customerBw,
        slitWidth,
        lineVal || null,
        lp.belt_speed        !== undefined ? lp.belt_speed        : null,
        sikoPct,
        reproPct,
        lp.max_usable_width  !== undefined ? lp.max_usable_width  : null,
        lp.usable_width      !== undefined ? lp.usable_width      : null,
        totalScrapPct,
        grossYieldPct,
        lp.s_beams           !== undefined ? lp.s_beams           : null,
        lp.m_beams           !== undefined ? lp.m_beams           : null,
        throughput,
        prodTime,
        null,           // main_raw_mat intentionally NULL
        overconsPct,
        author,
        IMPORT_USER_ID,
      ]);

      // ── Build materials list ──────────────────────────────────────────────
      const materials = [];

      for (const { nameCol, pctCol } of MATERIAL_COLS) {
        const xlsxName = String(row[nameCol] || '').trim();
        const pctFrac  = num(row[pctCol]);

        if (!xlsxName || pctFrac === null || pctFrac === 0) continue;

        if (!materialMapping.has(xlsxName)) {
          warnings.push(`NO MAPPING — PD=${pdId} col=${nameCol}: "${xlsxName}"`);
          continue;
        }
        const dbName = materialMapping.get(xlsxName);
        if (!dbName) continue;   // empty db_name = SKIP action

        const label = getLabelFromDbName(dbName);
        if (!label) {
          warnings.push(`UNKNOWN PREFIX — PD=${pdId} col=${nameCol}: "${dbName}"`);
          continue;
        }

        materials.push({ label, name: dbName.trim(), pct: pctFrac * 100 });
      }

      // Siko → Recyclate
      if (sikoFrac !== null && sikoFrac > 0) {
        materials.push({ label: 'Recyclate',   name: 'Siko',  pct: sikoFrac * 100 });
      }
      // Repro → Regranulate
      if (reproFrac !== null && reproFrac > 0) {
        materials.push({ label: 'Regranulate', name: 'Repro', pct: reproFrac * 100 });
      }

      // ── Insert bom_record_materials ──────────────────────────────────────
      for (let i = 0; i < materials.length; i++) {
        const m = materials[i];
        await dbRun(db, `
          INSERT INTO bom_record_materials (record_id, sort_order, material_label, material_name, percentage)
          VALUES (?, ?, ?, ?, ?)
        `, [recordId, i, m.label, m.name, m.pct]);
      }

      console.log(`  INSERTED: PD=${pdId || '-'} SAP=${sapId || '-'} Line=${lineVal || '-'} ` +
                  `Customer=${customer || '-'} BW=${customerBw !== null ? customerBw : '-'} ` +
                  `→ ${materials.length} material rows`);
      inserted++;
    }

    await dbRun(db, 'COMMIT');
  } catch (err) {
    await dbRun(db, 'ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.close();
  }

  console.log('\n=== WARNINGS ===');
  if (warnings.length === 0) {
    console.log('  (none)');
  } else {
    warnings.forEach(w => console.log('  ⚠ ' + w));
  }

  console.log('\n=== SUMMARY ===');
  console.log(`  Inserted:         ${inserted}`);
  console.log(`  Skipped (dup):    ${skippedDup}`);
  console.log(`  Skipped (blank):  ${skippedEmpty}`);
  console.log(`  Warnings:         ${warnings.length}`);
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  process.exit(1);
});
