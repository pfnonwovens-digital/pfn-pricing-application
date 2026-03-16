const polymerIndexes = require('../src/backend/polymer-indexes');

async function migrate() {
  console.log('Removing source field from polymer_index_values table...');
  
  try {
    await polymerIndexes.initializeDatabase();
    
    const auth = require('../src/backend/auth');
    
    // Create new table without source field
    await auth.dbRun(`
      CREATE TABLE IF NOT EXISTS polymer_index_values_new (
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
    
    // Copy data from old table to new table
    await auth.dbRun(`
      INSERT INTO polymer_index_values_new (id, index_id, value_date, index_value, notes, created_by, created_at, updated_at)
      SELECT id, index_id, value_date, index_value, notes, created_by, created_at, updated_at
      FROM polymer_index_values
    `);
    
    // Drop old table
    await auth.dbRun('DROP TABLE polymer_index_values');
    
    // Rename new table to original name
    await auth.dbRun('ALTER TABLE polymer_index_values_new RENAME TO polymer_index_values');
    
    console.log('✓ Successfully removed source field from database');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
