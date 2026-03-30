'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

const DB_PATH = path.join(__dirname, '..', 'data', 'mini_erp.db');
const PRODUCTS_PATH = path.join(__dirname, '..', 'data', 'Products.xlsx');
const IMPORT_USER_ID = 'b1145c16b0c3f89e616b1224b38cfcb8';

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  }));
}

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

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  await dbRun(db, 'PRAGMA foreign_keys = ON');

  try {
    await dbRun(db, 'ALTER TABLE bom_records ADD COLUMN overconsumption REAL');
    console.log('[MIGRATION] Added overconsumption column to bom_records');
  } catch (err) {
    if (!String(err.message || '').includes('duplicate column name')) throw err;
  }

  const wb = xlsx.readFile(PRODUCTS_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '', raw: true });

  await dbRun(db, 'BEGIN');
  try {
    let updated = 0;
    let missingKey = 0;

    for (const row of rows) {
      const sapId = String(row['SAP ID'] || '').trim();
      const pdId = String(row['PD ID'] || '').trim();
      const lineVal = String(row['Line'] || '').trim();
      const overcons = toPercentMaybeFraction(row['Overconsumption']);

      if (overcons === null) continue;

      if (sapId) {
        const result = await dbRun(
          db,
          'UPDATE bom_records SET overconsumption=? WHERE created_by=? AND sap_id=? AND line=?',
          [overcons, IMPORT_USER_ID, sapId, lineVal || null]
        );
        updated += result.changes || 0;
      } else if (/^\d+$/.test(pdId)) {
        const result = await dbRun(
          db,
          'UPDATE bom_records SET overconsumption=? WHERE created_by=? AND pd_id=?',
          [overcons, IMPORT_USER_ID, pdId]
        );
        updated += result.changes || 0;
      } else {
        missingKey++;
      }
    }

    await dbRun(db, 'COMMIT');
    console.log('Backfill done.');
    console.log('Updated rows: ' + updated);
    console.log('Rows skipped (no usable key): ' + missingKey);
  } catch (err) {
    await dbRun(db, 'ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
