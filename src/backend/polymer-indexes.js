const auth = require('./auth');

const DAY_NAME_TO_NUM = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

function normalizeDate(value) {
  if (!value) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const ms = Math.round(value * 86400000);
    const date = new Date(excelEpochUtc + ms);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getRowValue(row, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return '';
}

function parseNameAndVariant(rawName, rawVariant) {
  const variantFromColumn = String(rawVariant || '').trim();
  if (variantFromColumn) {
    const lowered = variantFromColumn.toLowerCase();
    if (['none', 'no variant', 'n/a', 'na', 'null', '-'].includes(lowered)) {
      return {
        baseName: String(rawName || '').trim(),
        variant: ''
      };
    }

    return {
      baseName: String(rawName || '').trim(),
      variant: variantFromColumn
    };
  }

  const fullName = String(rawName || '').trim();
  const match = fullName.match(/^(.*?)\s*(?:-|\s)\s*(Min|Mid|Max)\s*$/i);
  if (match) {
    return {
      baseName: match[1].trim(),
      variant: match[2]
    };
  }

  return {
    baseName: fullName,
    variant: ''
  };
}

function getIndexNameParts(indexName) {
  const fullName = String(indexName || '').trim();
  const match = fullName.match(/^(.*?)\s*(?:-|\s)\s*(Min|Mid|Max)\s*$/i);
  if (!match) {
    return {
      baseName: fullName,
      variant: ''
    };
  }

  return {
    baseName: match[1].trim(),
    variant: match[2].trim().toUpperCase()
  };
}

async function findIndexByBaseAndVariant(baseName, variantTitle) {
  const candidates = [
    `${baseName} - ${variantTitle}`,
    `${baseName} ${variantTitle}`
  ];

  for (const candidate of candidates) {
    const index = await auth.dbGet(
      'SELECT id, name FROM polymer_indexes WHERE name = ?',
      [candidate]
    );
    if (index) return index;
  }

  return null;
}

async function recalculateMidValueForDate(baseName, valueDate, userId = null) {
  const normalizedDate = normalizeDate(valueDate);
  if (!baseName || !normalizedDate) {
    return;
  }

  const minIndex = await findIndexByBaseAndVariant(baseName, 'Min');
  const maxIndex = await findIndexByBaseAndVariant(baseName, 'Max');
  const midIndex = await findIndexByBaseAndVariant(baseName, 'Mid');

  if (!minIndex || !maxIndex || !midIndex) {
    return;
  }

  const minValueRow = await auth.dbGet(
    'SELECT index_value FROM polymer_index_values WHERE index_id = ? AND value_date = ?',
    [minIndex.id, normalizedDate]
  );
  const maxValueRow = await auth.dbGet(
    'SELECT index_value FROM polymer_index_values WHERE index_id = ? AND value_date = ?',
    [maxIndex.id, normalizedDate]
  );

  if (!minValueRow || !maxValueRow) {
    return;
  }

  const minValue = Number(minValueRow.index_value);
  const maxValue = Number(maxValueRow.index_value);
  if (Number.isNaN(minValue) || Number.isNaN(maxValue)) {
    return;
  }

  const midValue = (minValue + maxValue) / 2;

  await upsertIndexValue(
    midIndex.id,
    { valueDate: normalizedDate, value: midValue, notes: 'AUTO_CALCULATED_MID' },
    userId,
    { allowMidWrite: true, skipMidRecalculation: true }
  );
}

function normalizeWeekday(value, fallback = 1) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'number' && value >= 0 && value <= 6) {
    return value;
  }

  const asNum = Number(value);
  if (!Number.isNaN(asNum) && asNum >= 0 && asNum <= 6) {
    return asNum;
  }

  const key = String(value).trim().toLowerCase();
  if (key in DAY_NAME_TO_NUM) {
    return DAY_NAME_TO_NUM[key];
  }

  return fallback;
}

async function initializeDatabase() {
  await auth.dbRun(`
    CREATE TABLE IF NOT EXISTS polymer_indexes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT UNIQUE NOT NULL,
      unit TEXT,
      currency TEXT,
      publish_weekday INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await auth.dbRun(`
    CREATE TABLE IF NOT EXISTS polymer_index_values (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      index_id TEXT NOT NULL,
      value_date DATE NOT NULL,
      index_value REAL NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (index_id) REFERENCES polymer_indexes(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(index_id, value_date)
    )
  `);
}

async function getIndexes(includeInactive = false) {
  const sql = includeInactive
    ? `SELECT id, name, unit, currency, publish_weekday, is_active, created_at, updated_at
       FROM polymer_indexes
       ORDER BY name`
    : `SELECT id, name, unit, currency, publish_weekday, is_active, created_at, updated_at
       FROM polymer_indexes
       WHERE is_active = 1
       ORDER BY name`;

  return auth.dbAll(sql, []);
}

async function createIndex({ name, unit = 'kg', currency = 'EUR', publishWeekday = 1, isActive = 1 }) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    throw new Error('Index name is required');
  }

  const normalizedUnit = String(unit || '').trim() || 'kg';
  const normalizedCurrency = String(currency || '').trim() || 'EUR';

  const weekday = normalizeWeekday(publishWeekday, 1);
  await auth.dbRun(
    `INSERT INTO polymer_indexes (name, unit, currency, publish_weekday, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [normalizedName, normalizedUnit, normalizedCurrency, weekday, isActive ? 1 : 0]
  );

  return auth.dbGet(
    'SELECT id, name, unit, currency, publish_weekday, is_active, created_at, updated_at FROM polymer_indexes WHERE name = ?',
    [normalizedName]
  );
}

async function updateIndex(indexId, { name, unit, currency, publishWeekday, isActive }) {
  const existing = await auth.dbGet('SELECT * FROM polymer_indexes WHERE id = ?', [indexId]);
  if (!existing) {
    throw new Error('Index not found');
  }

  const nextName = name !== undefined ? String(name).trim() : existing.name;
  if (!nextName) {
    throw new Error('Index name cannot be empty');
  }

  const nextUnit = unit !== undefined ? unit : existing.unit;
  const nextCurrency = currency !== undefined ? currency : existing.currency;
  const nextWeekday = publishWeekday !== undefined
    ? normalizeWeekday(publishWeekday, existing.publish_weekday)
    : existing.publish_weekday;
  const nextIsActive = isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active;

  await auth.dbRun(
    `UPDATE polymer_indexes
     SET name = ?, unit = ?, currency = ?, publish_weekday = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nextName, nextUnit, nextCurrency, nextWeekday, nextIsActive, indexId]
  );

  return auth.dbGet(
    'SELECT id, name, unit, currency, publish_weekday, is_active, created_at, updated_at FROM polymer_indexes WHERE id = ?',
    [indexId]
  );
}

async function deleteIndex(indexId) {
  const existing = await auth.dbGet(
    'SELECT id, name, is_active FROM polymer_indexes WHERE id = ?',
    [indexId]
  );

  if (!existing) {
    throw new Error('Index not found');
  }

  if (existing.is_active) {
    throw new Error('Only deactivated indexes can be deleted');
  }

  await auth.dbRun('DELETE FROM polymer_indexes WHERE id = ?', [indexId]);

  return {
    id: existing.id,
    name: existing.name,
    deleted: true
  };
}

async function getIndexValues(indexId, { startDate = null, endDate = null, limit = 520 } = {}) {
  const params = [indexId];
  let sql = `
    SELECT piv.id, piv.index_id, piv.value_date, piv.index_value, piv.notes,
           piv.created_by, piv.created_at, piv.updated_at,
           u.email AS created_by_email
    FROM polymer_index_values piv
    LEFT JOIN users u ON u.id = piv.created_by
    WHERE piv.index_id = ?
  `;

  if (startDate) {
    sql += ' AND piv.value_date >= ?';
    params.push(normalizeDate(startDate));
  }

  if (endDate) {
    sql += ' AND piv.value_date <= ?';
    params.push(normalizeDate(endDate));
  }

  sql += ' ORDER BY piv.value_date DESC LIMIT ?';
  params.push(Number(limit) || 520);

  return auth.dbAll(sql, params);
}

async function upsertIndexValue(indexId, { valueDate, value, notes = '' }, userId = null, options = {}) {
  const index = await auth.dbGet('SELECT id, name FROM polymer_indexes WHERE id = ?', [indexId]);
  if (!index) {
    throw new Error('Index not found');
  }

  const { baseName, variant } = getIndexNameParts(index.name);
  const isMidVariant = variant === 'MID';
  const isMinOrMaxVariant = variant === 'MIN' || variant === 'MAX';

  if (isMidVariant && !options.allowMidWrite) {
    throw new Error('Mid values are auto-calculated from Min and Max and cannot be inserted manually');
  }

  const normalizedDate = normalizeDate(valueDate);
  if (!normalizedDate) {
    throw new Error('Valid valueDate is required (YYYY-MM-DD)');
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    throw new Error('Value must be numeric');
  }

  const existing = await auth.dbGet(
    'SELECT id FROM polymer_index_values WHERE index_id = ? AND value_date = ?',
    [indexId, normalizedDate]
  );

  let savedRecord;
  if (existing) {
    await auth.dbRun(
      `UPDATE polymer_index_values
       SET index_value = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [numericValue, notes || '', existing.id]
    );

    await auth.auditLog(userId, 'INDEX_VALUE_UPDATED', 'polymer_indexes', {
      indexId,
      indexName: index.name,
      valueDate: normalizedDate,
      value: numericValue
    });

    savedRecord = await auth.dbGet(
      'SELECT * FROM polymer_index_values WHERE id = ?',
      [existing.id]
    );
  } else {
    await auth.dbRun(
      `INSERT INTO polymer_index_values
        (index_id, value_date, index_value, notes, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [indexId, normalizedDate, numericValue, notes || '', userId || null]
    );

    await auth.auditLog(userId, 'INDEX_VALUE_CREATED', 'polymer_indexes', {
      indexId,
      indexName: index.name,
      valueDate: normalizedDate,
      value: numericValue
    });

    savedRecord = await auth.dbGet(
      'SELECT * FROM polymer_index_values WHERE index_id = ? AND value_date = ?',
      [indexId, normalizedDate]
    );
  }

  if (isMinOrMaxVariant && !options.skipMidRecalculation) {
    await recalculateMidValueForDate(baseName, normalizedDate, userId);
  }

  return savedRecord;
}

async function ensureIndexByName({ name, unit = '', currency = '', publishWeekday = 1 }) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    throw new Error('Index name is required');
  }

  const existing = await auth.dbGet(
    'SELECT id, name, unit, currency, publish_weekday, is_active FROM polymer_indexes WHERE name = ?',
    [normalizedName]
  );

  if (existing) {
    return existing;
  }

  return createIndex({
    name: normalizedName,
    unit,
    currency,
    publishWeekday,
    isActive: 1
  });
}

async function bulkImport(rows, userId = null) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Import rows are required');
  }

  let insertedValues = 0;
  let updatedValues = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    try {
      const rawName = getRowValue(row, [
        'indexName', 'Index Name', 'index name',
        'name', 'Name',
        'index', 'Index'
      ]);
      const rawVariant = getRowValue(row, ['variant', 'Variant']);
      const valueDate = getRowValue(row, [
        'valueDate', 'Value Date', 'value date',
        'value_date', 'date', 'Date'
      ]);
      const valueRaw = getRowValue(row, [
        'value', 'Value',
        'indexValue', 'Index Value',
        'index_value'
      ]);
      const value = valueRaw;

      const { baseName, variant } = parseNameAndVariant(rawName, rawVariant);
      const normalizedVariant = String(variant || '').trim().toUpperCase();

      if (!baseName) {
        throw new Error('Index name is required');
      }
      if (!valueDate) {
        throw new Error('Value date is required');
      }
      if (value === null || value === undefined || value === '') {
        throw new Error('Value is required');
      }

      if (normalizedVariant === 'MID') {
        throw new Error('Mid values are auto-calculated. Import Min and Max only.');
      }

      // Combine base name and variant to get full index name
      const normalizedBase = String(baseName).trim();
      const normalizedVariantText = String(variant || '').trim();
      const candidateNames = [];

      if (normalizedVariantText) {
        const variantTitle = normalizedVariantText.charAt(0).toUpperCase() + normalizedVariantText.slice(1).toLowerCase();
        candidateNames.push(
          `${normalizedBase} - ${variantTitle}`,
          `${normalizedBase} ${variantTitle}`
        );
      } else {
        candidateNames.push(normalizedBase);
      }

      let index = null;
      for (const candidate of candidateNames) {
        index = await auth.dbGet(
          'SELECT id, name, unit, currency FROM polymer_indexes WHERE name = ?',
          [candidate]
        );
        if (index) break;
      }

      if (!index) {
        throw new Error(`Index not found. Tried: ${candidateNames.join(' | ')}`);
      }

      const existingValue = await auth.dbGet(
        'SELECT id FROM polymer_index_values WHERE index_id = ? AND value_date = ?',
        [index.id, normalizeDate(valueDate)]
      );

      await upsertIndexValue(index.id, { valueDate, value }, userId);
      if (existingValue) {
        updatedValues += 1;
      } else {
        insertedValues += 1;
      }
    } catch (err) {
      errors.push({ row: i + 1, message: err.message });
    }
  }

  await auth.auditLog(userId, 'INDEX_IMPORT_COMPLETED', 'polymer_indexes', {
    totalRows: rows.length,
    insertedValues,
    updatedValues,
    errorCount: errors.length
  });

  return {
    totalRows: rows.length,
    insertedValues,
    updatedValues,
    errors
  };
}

async function getDueReminders(baseDate = new Date()) {
  const today = new Date(baseDate);
  const weekday = today.getDay();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const activeIndexes = await auth.dbAll(
    `SELECT id, name, specs, publish_weekday
     FROM polymer_indexes
     WHERE is_active = 1 AND publish_weekday = ?
     ORDER BY name`,
    [weekday]
  );

  const due = [];
  for (const idx of activeIndexes) {
    const latest = await auth.dbGet(
      'SELECT value_date, index_value FROM polymer_index_values WHERE index_id = ? ORDER BY value_date DESC LIMIT 1',
      [idx.id]
    );

    if (!latest || latest.value_date < cutoffIso) {
      due.push({
        ...idx,
        latest_value_date: latest ? latest.value_date : null,
        latest_value: latest ? latest.index_value : null
      });
    }
  }

  return {
    date: today.toISOString().slice(0, 10),
    weekday,
    dueIndexes: due
  };
}

async function getDataByWeek({ startYear = 2020, endYear = 2026 } = {}) {
  // Get all active indexes with their publish weekdays
  const indexes = await getIndexes(false);
  
  // Query all values in date range
  const startDate = `${startYear}-01-01`;
  const endDate = `${endYear}-12-31`;
  
  const allValues = await auth.dbAll(`
    SELECT piv.index_id, piv.value_date, piv.index_value,
           pi.name, pi.publish_weekday, pi.unit, pi.currency
    FROM polymer_index_values piv
    JOIN polymer_indexes pi ON piv.index_id = pi.id
    WHERE piv.value_date BETWEEN ? AND ?
      AND pi.is_active = 1
    ORDER BY piv.value_date, pi.name
  `, [startDate, endDate]);

  // Group by week (ISO week number)
  const weekMap = new Map();
  
  for (const val of allValues) {
    const date = new Date(val.value_date + 'T00:00:00Z');
    const weekNumber = getISOWeekNumber(date);
    const year = date.getUTCFullYear();
    const weekKey = `${weekNumber}/${year}`;
    
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { week: weekNumber, year, indexes: new Map() });
    }
    
    const week = weekMap.get(weekKey);
    if (!week.indexes.has(val.index_id)) {
      week.indexes.set(val.index_id, {
        id: val.index_id,
        name: val.name,
        publish_weekday: val.publish_weekday,
        unit: val.unit,
        currency: val.currency,
        values: []
      });
    }
    
    week.indexes.get(val.index_id).values.push({
      date: val.value_date,
      value: val.index_value
    });
  }

  // Convert to array and filter: only include weeks with at least one non-zero value
  const result = Array.from(weekMap.values())
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.week - b.week;
    })
    .filter(week => {
      // Check if any index has a non-zero value
      for (const idx of week.indexes.values()) {
        if (idx.values.some(v => v.value !== 0 && v.value !== null)) {
          return true;
        }
      }
      return false;
    })
    .map(week => ({
      week: week.week,
      year: week.year,
      indexes: Array.from(week.indexes.values())
    }));

  return result;
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function clearAllIndexValues() {
  const result = await auth.dbRun('DELETE FROM polymer_index_values');
  return { deletedCount: result.changes || 0 };
}

async function recalculateAllMidValues(userId = null) {
  const allIndexes = await auth.dbAll(
    'SELECT id, name FROM polymer_indexes ORDER BY name',
    []
  );

  const groupedByBase = new Map();
  for (const index of allIndexes) {
    const { baseName, variant } = getIndexNameParts(index.name);
    const normalizedVariant = String(variant || '').toUpperCase();
    if (!normalizedVariant) continue;

    if (!groupedByBase.has(baseName)) {
      groupedByBase.set(baseName, {});
    }

    const group = groupedByBase.get(baseName);
    group[normalizedVariant] = index;
  }

  let groupsProcessed = 0;
  let groupsSkipped = 0;
  let totalDatesProcessed = 0;
  let midCreated = 0;
  let midUpdated = 0;

  for (const [baseName, group] of groupedByBase.entries()) {
    const minIndex = group.MIN;
    const maxIndex = group.MAX;
    const midIndex = group.MID;

    if (!minIndex || !maxIndex || !midIndex) {
      groupsSkipped += 1;
      continue;
    }

    groupsProcessed += 1;

    const minMaxRows = await auth.dbAll(
      `SELECT minv.value_date,
              minv.index_value AS min_value,
              maxv.index_value AS max_value
       FROM polymer_index_values minv
       JOIN polymer_index_values maxv
         ON maxv.value_date = minv.value_date
       WHERE minv.index_id = ?
         AND maxv.index_id = ?`,
      [minIndex.id, maxIndex.id]
    );

    for (const row of minMaxRows) {
      const minValue = Number(row.min_value);
      const maxValue = Number(row.max_value);

      if (Number.isNaN(minValue) || Number.isNaN(maxValue)) {
        continue;
      }

      const midValue = (minValue + maxValue) / 2;

      const existingMid = await auth.dbGet(
        'SELECT id FROM polymer_index_values WHERE index_id = ? AND value_date = ?',
        [midIndex.id, row.value_date]
      );

      await upsertIndexValue(
        midIndex.id,
        { valueDate: row.value_date, value: midValue, notes: 'AUTO_CALCULATED_MID' },
        userId,
        { allowMidWrite: true, skipMidRecalculation: true }
      );

      if (existingMid) {
        midUpdated += 1;
      } else {
        midCreated += 1;
      }

      totalDatesProcessed += 1;
    }
  }

  await auth.auditLog(userId, 'MID_VALUES_RECALCULATED', 'polymer_indexes', {
    groupsProcessed,
    groupsSkipped,
    totalDatesProcessed,
    midCreated,
    midUpdated
  });

  return {
    groupsProcessed,
    groupsSkipped,
    totalDatesProcessed,
    midCreated,
    midUpdated
  };
}

module.exports = {
  initializeDatabase,
  getIndexes,
  createIndex,
  updateIndex,
  deleteIndex,
  getIndexValues,
  upsertIndexValue,
  bulkImport,
  getDueReminders,
  getDataByWeek,
  clearAllIndexValues,
  recalculateAllMidValues
};
