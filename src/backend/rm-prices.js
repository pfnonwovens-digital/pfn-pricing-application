const db = require('./db/connection');

const VALID_PLANTS = ['CZ', 'EG', 'ZA'];
const VALID_MATERIAL_KEYS = ['list_sb', 'list_mb', 'list_pigment', 'list_additive', 'list_surfactant'];
const POLYMER_MATERIAL_KEYS = ['list_sb', 'list_mb'];
const VALID_FORMULA_TYPES = ['direct', 'coefficient', 'additive', 'combined'];

let initPromise = null;

function normalizePlant(plant) {
  const normalized = String(plant || '').trim().toUpperCase();
  return VALID_PLANTS.includes(normalized) ? normalized : null;
}

function normalizeMaterialKey(listKey) {
  const normalized = String(listKey || '').trim().toLowerCase();
  return VALID_MATERIAL_KEYS.includes(normalized) ? normalized : null;
}

function normalizeMonth(month) {
  const num = Number(month);
  if (!Number.isInteger(num) || num < 1 || num > 12) return null;
  return num;
}

function normalizeYear(year) {
  const num = Number(year);
  if (!Number.isInteger(num) || num < 2000 || num > 2100) return null;
  return num;
}

function yearMonthValue(year, month) {
  return Number(year) * 100 + Number(month);
}

function getPlantFromLine(lineId) {
  const line = String(lineId || '').trim().toUpperCase();
  if (line.startsWith('CZ')) return 'CZ';
  if (line.startsWith('EG')) return 'EG';
  if (line.startsWith('ZA')) return 'ZA';
  return null;
}

async function ensureReady() {
  if (!initPromise) {
    initPromise = (async () => {
      await db.init();

      await db.run(`
        CREATE TABLE IF NOT EXISTS rm_prices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          material_list_key TEXT NOT NULL,
          material_name TEXT NOT NULL COLLATE NOCASE,
          plant TEXT NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          price REAL NOT NULL,
          currency TEXT NOT NULL,
          price_source TEXT NOT NULL DEFAULT 'manual',
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(material_list_key, material_name, plant, year, month)
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS rm_polymer_formulas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          material_list_key TEXT NOT NULL,
          material_name TEXT NOT NULL COLLATE NOCASE,
          plant TEXT NOT NULL,
          index_id TEXT NOT NULL,
          index_variant TEXT,
          formula_type TEXT NOT NULL DEFAULT 'combined',
          coefficient REAL NOT NULL DEFAULT 1.0,
          fixed_addition REAL NOT NULL DEFAULT 0.0,
          output_currency TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(material_list_key, material_name, plant)
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS rm_plant_materials (
          material_list_key TEXT NOT NULL,
          material_name TEXT NOT NULL COLLATE NOCASE,
          plant TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(material_list_key, material_name, plant)
        )
      `);

      await db.run('CREATE INDEX IF NOT EXISTS idx_rm_prices_plant_period ON rm_prices(plant, year, month)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_rm_prices_material ON rm_prices(material_list_key, material_name, plant)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_rm_plant_materials_plant ON rm_plant_materials(plant, active)');

      await seedPlantMaterialsFromBomLists();
    })();
  }

  return initPromise;
}

async function getAllBomMaterials() {
  return db.all(
    `SELECT l.list_key AS material_list_key, i.value AS material_name
     FROM bom_dropdown_lists l
     JOIN bom_dropdown_list_items i ON i.list_id = l.id
     WHERE l.list_group = 'material' AND i.value IS NOT NULL AND TRIM(i.value) != ''
     ORDER BY l.list_key, lower(i.value)`
  );
}

let _seedLockPromise = null;

async function seedPlantMaterialsFromBomLists() {
  // Prevent concurrent calls from starting overlapping SQLite transactions.
  if (_seedLockPromise) return _seedLockPromise;

  _seedLockPromise = (async () => {
    try {
      const materials = await getAllBomMaterials();
      if (!materials.length) return;

      await db.run('BEGIN IMMEDIATE TRANSACTION');
      try {
        for (const material of materials) {
          for (const plant of VALID_PLANTS) {
            await db.run(
              `INSERT INTO rm_plant_materials (material_list_key, material_name, plant, active)
               VALUES (?, ?, ?, 1)
               ON CONFLICT(material_list_key, material_name, plant) DO NOTHING`,
              [material.material_list_key, material.material_name, plant]
            );
          }
        }
        await db.run('COMMIT');
      } catch (err) {
        await db.run('ROLLBACK').catch(() => {});
        throw err;
      }
    } finally {
      _seedLockPromise = null;
    }
  })();

  return _seedLockPromise;
}

function applyFormula(formula, indexValue) {
  const coefficient = Number.isFinite(Number(formula.coefficient)) ? Number(formula.coefficient) : 1;
  const fixedAddition = Number.isFinite(Number(formula.fixed_addition)) ? Number(formula.fixed_addition) : 0;
  const base = Number(indexValue);
  if (!Number.isFinite(base)) return null;

  switch (formula.formula_type) {
    case 'direct':
      return base;
    case 'coefficient':
      return base * coefficient;
    case 'additive':
      return base + fixedAddition;
    case 'combined':
    default:
      return (base * coefficient) + fixedAddition;
  }
}

async function upsertManualPrice({ materialListKey, materialName, plant, year, month, price, currency, userId }) {
  await ensureReady();

  const listKey = normalizeMaterialKey(materialListKey);
  const normalizedPlant = normalizePlant(plant);
  const normalizedYear = normalizeYear(year);
  const normalizedMonth = normalizeMonth(month);
  const normalizedName = String(materialName || '').trim();
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  const numericPrice = Number(price);

  if (!listKey) throw new Error('Invalid material_list_key');
  if (!normalizedName) throw new Error('Material name is required');
  if (!normalizedPlant) throw new Error('Invalid plant');
  if (!normalizedYear || !normalizedMonth) throw new Error('Invalid year/month');
  if (!Number.isFinite(numericPrice)) throw new Error('Invalid price');
  if (!normalizedCurrency) throw new Error('Currency is required');

  await db.run(
    `INSERT INTO rm_prices (
      material_list_key, material_name, plant, year, month, price, currency, price_source, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)
    ON CONFLICT(material_list_key, material_name, plant, year, month)
    DO UPDATE SET
      price = excluded.price,
      currency = excluded.currency,
      price_source = 'manual',
      created_by = excluded.created_by,
      updated_at = CURRENT_TIMESTAMP`,
    [listKey, normalizedName, normalizedPlant, normalizedYear, normalizedMonth, numericPrice, normalizedCurrency, userId || null]
  );

  await db.run(
    `INSERT INTO rm_plant_materials (material_list_key, material_name, plant, active)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(material_list_key, material_name, plant)
     DO UPDATE SET active = 1, updated_at = CURRENT_TIMESTAMP`,
    [listKey, normalizedName, normalizedPlant]
  );

  return { success: true };
}

async function importPrices(rows, userId) {
  await ensureReady();
  if (!Array.isArray(rows)) throw new Error('rows must be an array');

  const errors = [];
  let upserted = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    try {
      await upsertManualPrice({
        materialListKey: row.material_list_key || row.listKey || row.category,
        materialName: row.material_name || row.material || row.name,
        plant: row.plant || row.country,
        year: row.year,
        month: row.month,
        price: row.price,
        currency: row.currency,
        userId
      });
      upserted += 1;
    } catch (err) {
      errors.push({ row: i + 1, message: err.message });
    }
  }

  return { totalRows: rows.length, upserted, errors };
}

async function importNonPolymerPrices(rows, userId) {
  await ensureReady();
  if (!Array.isArray(rows)) throw new Error('rows must be an array');

  const filteredRows = [];
  let skippedPolymer = 0;

  for (const row of rows) {
    const materialKey = normalizeMaterialKey(row?.material_list_key || row?.listKey || row?.category);
    if (materialKey && POLYMER_MATERIAL_KEYS.includes(materialKey)) {
      skippedPolymer += 1;
      continue;
    }
    filteredRows.push(row);
  }

  const result = await importPrices(filteredRows, userId);
  return {
    ...result,
    skipped_polymer: skippedPolymer,
    imported_scope: 'non_polymer_only'
  };
}

async function getLatestAvailablePrices(plant, year, month) {
  const ym = yearMonthValue(year, month);

  return db.all(
    `SELECT p.material_list_key, p.material_name, p.plant, p.year, p.month, p.price, p.currency, p.price_source
     FROM rm_prices p
     JOIN (
       SELECT material_list_key, material_name, plant, MAX((year * 100) + month) AS ym
       FROM rm_prices
       WHERE plant = ? AND ((year * 100) + month) <= ?
       GROUP BY material_list_key, material_name, plant
     ) latest
       ON latest.material_list_key = p.material_list_key
      AND latest.material_name = p.material_name
      AND latest.plant = p.plant
      AND latest.ym = ((p.year * 100) + p.month)
     WHERE p.plant = ?`,
    [plant, ym, plant]
  );
}

async function getMonthlyPlantPriceSheet({ plant, year, month }) {
  await ensureReady();

  const normalizedPlant = normalizePlant(plant);
  const normalizedYear = normalizeYear(year);
  const normalizedMonth = normalizeMonth(month);

  if (!normalizedPlant) throw new Error('Invalid plant');
  if (!normalizedYear || !normalizedMonth) throw new Error('Invalid year/month');

  await seedPlantMaterialsFromBomLists();

  const activeMaterials = await db.all(
    `SELECT material_list_key, material_name, active
     FROM rm_plant_materials
     WHERE plant = ? AND active = 1
     ORDER BY material_list_key, lower(material_name)`,
    [normalizedPlant]
  );

  const exactRows = await db.all(
    `SELECT material_list_key, material_name, plant, year, month, price, currency, price_source
     FROM rm_prices
     WHERE plant = ? AND year = ? AND month = ?`,
    [normalizedPlant, normalizedYear, normalizedMonth]
  );

  const latestRows = await getLatestAvailablePrices(normalizedPlant, normalizedYear, normalizedMonth);

  const exactMap = new Map(exactRows.map((r) => [`${r.material_list_key}:${r.material_name.toLowerCase()}`, r]));
  const latestMap = new Map(latestRows.map((r) => [`${r.material_list_key}:${r.material_name.toLowerCase()}`, r]));

  const rows = activeMaterials.map((material) => {
    const key = `${material.material_list_key}:${String(material.material_name).toLowerCase()}`;
    const exact = exactMap.get(key);
    const latest = latestMap.get(key);

    if (exact) {
      return {
        material_list_key: material.material_list_key,
        material_name: material.material_name,
        plant: normalizedPlant,
        price: exact.price,
        currency: exact.currency,
        price_source: exact.price_source,
        status: 'priced',
        origin_year: exact.year,
        origin_month: exact.month,
        missing: false
      };
    }

    if (latest) {
      return {
        material_list_key: material.material_list_key,
        material_name: material.material_name,
        plant: normalizedPlant,
        price: latest.price,
        currency: latest.currency,
        price_source: latest.price_source,
        status: 'fallback',
        origin_year: latest.year,
        origin_month: latest.month,
        missing: false
      };
    }

    return {
      material_list_key: material.material_list_key,
      material_name: material.material_name,
      plant: normalizedPlant,
      price: null,
      currency: null,
      price_source: null,
      status: 'missing',
      origin_year: null,
      origin_month: null,
      missing: true
    };
  });

  return {
    plant: normalizedPlant,
    year: normalizedYear,
    month: normalizedMonth,
    total: rows.length,
    missing_count: rows.filter((r) => r.missing).length,
    rows
  };
}

async function getCurrentPricesForLine({ line, year, month }) {
  await ensureReady();

  const plant = getPlantFromLine(line);
  if (!plant) {
    return { plant: null, price_map: {}, rows: [] };
  }

  const now = new Date();
  const normalizedYear = normalizeYear(year) || now.getFullYear();
  const normalizedMonth = normalizeMonth(month) || (now.getMonth() + 1);

  const sheet = await getMonthlyPlantPriceSheet({ plant, year: normalizedYear, month: normalizedMonth });
  const priceMap = {};

  for (const row of sheet.rows) {
    const key = `${row.material_list_key}:${row.material_name}`;
    priceMap[key] = {
      price: row.price,
      currency: row.currency,
      status: row.status,
      origin_year: row.origin_year,
      origin_month: row.origin_month
    };
  }

  return {
    plant,
    year: sheet.year,
    month: sheet.month,
    missing_count: sheet.missing_count,
    price_map: priceMap,
    rows: sheet.rows
  };
}

async function getPlantMaterials() {
  await ensureReady();
  await seedPlantMaterialsFromBomLists();
  return db.all(
    `SELECT material_list_key, material_name, plant, active
     FROM rm_plant_materials
     ORDER BY plant, material_list_key, lower(material_name)`
  );
}

async function updatePlantMaterials(assignments) {
  await ensureReady();
  if (!Array.isArray(assignments)) throw new Error('assignments must be an array');

  await db.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    for (const item of assignments) {
      const listKey = normalizeMaterialKey(item.material_list_key);
      const materialName = String(item.material_name || '').trim();
      const plant = normalizePlant(item.plant);
      const active = item.active ? 1 : 0;

      if (!listKey || !materialName || !plant) {
        throw new Error('Invalid assignment entry');
      }

      await db.run(
        `INSERT INTO rm_plant_materials (material_list_key, material_name, plant, active)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(material_list_key, material_name, plant)
         DO UPDATE SET active = excluded.active, updated_at = CURRENT_TIMESTAMP`,
        [listKey, materialName, plant, active]
      );
    }

    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK').catch(() => {});
    throw err;
  }

  return { success: true };
}

async function addMaterialToList({ materialListKey, materialName, numericValue, plants }) {
  await ensureReady();

  const listKey = normalizeMaterialKey(materialListKey);
  const name = String(materialName || '').trim();
  if (!listKey) throw new Error('Invalid material_list_key');
  if (!name) throw new Error('Material name is required');

  const list = await db.get('SELECT id FROM bom_dropdown_lists WHERE list_key = ? AND list_group = ?', [listKey, 'material']);
  if (!list) throw new Error('Material list not found');

  const maxSort = await db.get('SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM bom_dropdown_list_items WHERE list_id = ?', [list.id]);
  const nextSort = Number(maxSort?.max_sort || -1) + 1;

  await db.run(
    `INSERT INTO bom_dropdown_list_items (list_id, value, sort_order, numeric_value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(list_id, value)
     DO UPDATE SET
       numeric_value = COALESCE(excluded.numeric_value, bom_dropdown_list_items.numeric_value),
       updated_at = CURRENT_TIMESTAMP`,
    [list.id, name, nextSort, Number.isFinite(Number(numericValue)) ? Number(numericValue) : null]
  );

  const requestedPlants = Array.isArray(plants) && plants.length > 0 ? plants : VALID_PLANTS;
  for (const plantRaw of requestedPlants) {
    const plant = normalizePlant(plantRaw);
    if (!plant) continue;
    await db.run(
      `INSERT INTO rm_plant_materials (material_list_key, material_name, plant, active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(material_list_key, material_name, plant)
       DO UPDATE SET active = 1, updated_at = CURRENT_TIMESTAMP`,
      [listKey, name, plant]
    );
  }

  return { success: true, material_list_key: listKey, material_name: name };
}

async function deleteMaterialEverywhere({ materialListKey, materialName }) {
  await ensureReady();

  const listKey = normalizeMaterialKey(materialListKey);
  const name = String(materialName || '').trim();

  if (!listKey) throw new Error('Invalid material_list_key');
  if (!name) throw new Error('Material name is required');

  const deleted = {
    bom_dropdown_list_items: 0,
    rm_prices: 0,
    rm_polymer_formulas: 0,
    rm_plant_materials: 0,
    bom_record_materials: 0,
    bom_records_main_raw_mat: 0
  };

  await db.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const list = await db.get(
      'SELECT id FROM bom_dropdown_lists WHERE list_key = ? AND list_group = ?',
      [listKey, 'material']
    );

    if (list) {
      const result = await db.run(
        'DELETE FROM bom_dropdown_list_items WHERE list_id = ? AND value = ? COLLATE NOCASE',
        [list.id, name]
      );
      deleted.bom_dropdown_list_items = result.changes || 0;
    }

    deleted.rm_prices = (await db.run(
      'DELETE FROM rm_prices WHERE material_list_key = ? AND material_name = ? COLLATE NOCASE',
      [listKey, name]
    )).changes || 0;

    deleted.rm_polymer_formulas = (await db.run(
      'DELETE FROM rm_polymer_formulas WHERE material_list_key = ? AND material_name = ? COLLATE NOCASE',
      [listKey, name]
    )).changes || 0;

    deleted.rm_plant_materials = (await db.run(
      'DELETE FROM rm_plant_materials WHERE material_list_key = ? AND material_name = ? COLLATE NOCASE',
      [listKey, name]
    )).changes || 0;

    deleted.bom_record_materials = (await db.run(
      'DELETE FROM bom_record_materials WHERE material_name = ? COLLATE NOCASE',
      [name]
    )).changes || 0;

    deleted.bom_records_main_raw_mat = (await db.run(
      'UPDATE bom_records SET main_raw_mat = NULL, updated_at = CURRENT_TIMESTAMP WHERE main_raw_mat = ? COLLATE NOCASE',
      [name]
    )).changes || 0;

    const totalDeleted = Object.values(deleted).reduce((sum, value) => sum + Number(value || 0), 0);
    if (totalDeleted === 0) {
      throw new Error('Material not found in database');
    }

    await db.run('COMMIT');
    return {
      success: true,
      material_list_key: listKey,
      material_name: name,
      deleted
    };
  } catch (err) {
    await db.run('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function listFormulas() {
  await ensureReady();
  return db.all(
    `SELECT f.id, f.material_list_key, f.material_name, f.plant, f.index_id, f.index_variant,
            f.formula_type, f.coefficient, f.fixed_addition, f.output_currency, f.active,
            i.name AS index_name, i.currency AS index_currency
     FROM rm_polymer_formulas f
     LEFT JOIN polymer_indexes i ON i.id = f.index_id
     ORDER BY f.plant, f.material_list_key, lower(f.material_name)`
  );
}

async function upsertFormula(payload) {
  await ensureReady();

  const listKey = normalizeMaterialKey(payload.material_list_key);
  const materialName = String(payload.material_name || '').trim();
  const plant = normalizePlant(payload.plant);
  const indexId = String(payload.index_id || '').trim();
  const indexVariant = String(payload.index_variant || '').trim();
  const formulaType = VALID_FORMULA_TYPES.includes(String(payload.formula_type || '').trim())
    ? String(payload.formula_type || '').trim()
    : 'combined';
  const coefficient = Number.isFinite(Number(payload.coefficient)) ? Number(payload.coefficient) : 1;
  const fixedAddition = Number.isFinite(Number(payload.fixed_addition)) ? Number(payload.fixed_addition) : 0;
  const outputCurrency = String(payload.output_currency || '').trim().toUpperCase() || null;
  const active = payload.active === undefined ? 1 : (payload.active ? 1 : 0);

  if (!listKey || !['list_sb', 'list_mb'].includes(listKey)) {
    throw new Error('Formula is allowed only for SB/MB material lists');
  }
  if (!materialName) throw new Error('material_name is required');
  if (!plant) throw new Error('Invalid plant');
  if (!indexId) throw new Error('index_id is required');

  await db.run(
    `INSERT INTO rm_polymer_formulas (
      material_list_key, material_name, plant, index_id, index_variant,
      formula_type, coefficient, fixed_addition, output_currency, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(material_list_key, material_name, plant)
    DO UPDATE SET
      index_id = excluded.index_id,
      index_variant = excluded.index_variant,
      formula_type = excluded.formula_type,
      coefficient = excluded.coefficient,
      fixed_addition = excluded.fixed_addition,
      output_currency = excluded.output_currency,
      active = excluded.active,
      updated_at = CURRENT_TIMESTAMP`,
    [
      listKey,
      materialName,
      plant,
      indexId,
      indexVariant || null,
      formulaType,
      coefficient,
      fixedAddition,
      outputCurrency,
      active
    ]
  );

  return { success: true };
}

async function deleteFormula(id) {
  await ensureReady();
  await db.run('DELETE FROM rm_polymer_formulas WHERE id = ?', [id]);
  return { success: true };
}

async function calculatePolymerPrices({ plant, year, month, userId }) {
  await ensureReady();

  const normalizedPlant = normalizePlant(plant);
  const normalizedYear = normalizeYear(year);
  const normalizedMonth = normalizeMonth(month);

  if (!normalizedPlant) throw new Error('Invalid plant');
  if (!normalizedYear || !normalizedMonth) throw new Error('Invalid year/month');

  const formulas = await db.all(
    `SELECT f.*, i.currency AS index_currency
     FROM rm_polymer_formulas f
     LEFT JOIN polymer_indexes i ON i.id = f.index_id
     WHERE f.plant = ? AND f.active = 1`,
    [normalizedPlant]
  );

  let updated = 0;
  const skipped = [];

  const y = String(normalizedYear);
  const m = String(normalizedMonth).padStart(2, '0');

  for (const formula of formulas) {
    const indexValueRow = await db.get(
      `SELECT v.index_value, v.value_date
       FROM polymer_index_values v
       WHERE v.index_id = ?
         AND strftime('%Y', v.value_date) = ?
         AND strftime('%m', v.value_date) = ?
       ORDER BY v.value_date ASC
       LIMIT 1`,
      [formula.index_id, y, m]
    );

    if (!indexValueRow) {
      skipped.push({ material_name: formula.material_name, reason: 'No index value in month' });
      continue;
    }

    const calculatedPrice = applyFormula(formula, indexValueRow.index_value);
    if (!Number.isFinite(calculatedPrice)) {
      skipped.push({ material_name: formula.material_name, reason: 'Invalid formula result' });
      continue;
    }

    const currency = formula.output_currency || formula.index_currency || 'EUR';

    await db.run(
      `INSERT INTO rm_prices (
        material_list_key, material_name, plant, year, month, price, currency, price_source, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'index_calculated', ?)
      ON CONFLICT(material_list_key, material_name, plant, year, month)
      DO UPDATE SET
        price = excluded.price,
        currency = excluded.currency,
        price_source = 'index_calculated',
        created_by = excluded.created_by,
        updated_at = CURRENT_TIMESTAMP`,
      [
        formula.material_list_key,
        formula.material_name,
        normalizedPlant,
        normalizedYear,
        normalizedMonth,
        calculatedPrice,
        currency,
        userId || null
      ]
    );

    updated += 1;
  }

  return { updated, skipped, total_formulas: formulas.length };
}

async function rollPrices({ fromYear, fromMonth, toYear, toMonth, plant, materialListKey, overwrite, userId }) {
  await ensureReady();

  const normalizedPlant = normalizePlant(plant);
  const normalizedFromYear = normalizeYear(fromYear);
  const normalizedFromMonth = normalizeMonth(fromMonth);
  const normalizedToYear = normalizeYear(toYear);
  const normalizedToMonth = normalizeMonth(toMonth);

  if (!normalizedPlant) throw new Error('Invalid plant');
  if (!normalizedFromYear || !normalizedFromMonth) throw new Error('Invalid source year/month');
  if (!normalizedToYear || !normalizedToMonth) throw new Error('Invalid target year/month');

  const normalizedListKey = materialListKey ? normalizeMaterialKey(materialListKey) : null;
  if (materialListKey && !normalizedListKey) throw new Error('Invalid material_list_key');

  // Load source prices (exact match for from period)
  let sourceRows;
  if (normalizedListKey) {
    sourceRows = await db.all(
      `SELECT material_list_key, material_name, price, currency
       FROM rm_prices
       WHERE plant = ? AND year = ? AND month = ? AND material_list_key = ?`,
      [normalizedPlant, normalizedFromYear, normalizedFromMonth, normalizedListKey]
    );
  } else {
    sourceRows = await db.all(
      `SELECT material_list_key, material_name, price, currency
       FROM rm_prices
       WHERE plant = ? AND year = ? AND month = ?`,
      [normalizedPlant, normalizedFromYear, normalizedFromMonth]
    );
  }

  let copied = 0;
  let skippedExisting = 0;

  for (const row of sourceRows) {
    if (!overwrite) {
      const existing = await db.get(
        `SELECT id FROM rm_prices
         WHERE material_list_key = ? AND material_name = ? COLLATE NOCASE AND plant = ? AND year = ? AND month = ?`,
        [row.material_list_key, row.material_name, normalizedPlant, normalizedToYear, normalizedToMonth]
      );
      if (existing) {
        skippedExisting += 1;
        continue;
      }
    }

    await db.run(
      `INSERT INTO rm_prices (
        material_list_key, material_name, plant, year, month, price, currency, price_source, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)
      ON CONFLICT(material_list_key, material_name, plant, year, month)
      DO UPDATE SET
        price = excluded.price,
        currency = excluded.currency,
        price_source = 'manual',
        created_by = excluded.created_by,
        updated_at = CURRENT_TIMESTAMP`,
      [row.material_list_key, row.material_name, normalizedPlant,
       normalizedToYear, normalizedToMonth, row.price, row.currency, userId || null]
    );

    copied += 1;
  }

  return {
    source: { plant: normalizedPlant, year: normalizedFromYear, month: normalizedFromMonth },
    target: { plant: normalizedPlant, year: normalizedToYear, month: normalizedToMonth },
    total_source: sourceRows.length,
    copied,
    skipped_existing: skippedExisting
  };
}

module.exports = {
  VALID_PLANTS,
  VALID_MATERIAL_KEYS,
  getPlantFromLine,
  ensureReady,
  getMonthlyPlantPriceSheet,
  getCurrentPricesForLine,
  upsertManualPrice,
  importPrices,
  importNonPolymerPrices,
  getPlantMaterials,
  updatePlantMaterials,
  addMaterialToList,
  deleteMaterialEverywhere,
  listFormulas,
  upsertFormula,
  deleteFormula,
  calculatePolymerPrices,
  rollPrices
};
