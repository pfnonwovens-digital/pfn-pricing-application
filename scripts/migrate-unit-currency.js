const polymerIndexes = require('../src/backend/polymer-indexes');

async function migrate() {
  console.log('Migrating polymer_indexes: replacing specs with unit and currency...');
  
  try {
    await polymerIndexes.initializeDatabase();
    
    const auth = require('../src/backend/auth');
    
    // Create new table with unit and currency fields
    await auth.dbRun(`
      CREATE TABLE IF NOT EXISTS polymer_indexes_new (
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
    
    // Copy data from old table to new table (specs is dropped)
    await auth.dbRun(`
      INSERT INTO polymer_indexes_new (id, name, unit, currency, publish_weekday, is_active, created_at, updated_at)
      SELECT id, name, '', '', publish_weekday, is_active, created_at, updated_at
      FROM polymer_indexes
    `);
    
    // Drop old table
    await auth.dbRun('DROP TABLE polymer_indexes');
    
    // Rename new table to original name
    await auth.dbRun('ALTER TABLE polymer_indexes_new RENAME TO polymer_indexes');
    
    console.log('✓ Successfully migrated polymer_indexes table');
    console.log('  - Removed: specs field');
    console.log('  - Added: unit field (TEXT)');
    console.log('  - Added: currency field (TEXT)');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
