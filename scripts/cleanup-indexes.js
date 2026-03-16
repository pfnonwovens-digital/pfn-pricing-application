const auth = require('../src/backend/auth');

async function cleanupAndRename() {
  console.log('Cleaning up and renaming indexes...\n');

  await auth.initializeDatabase();

  // Delete test indexes
  const toDelete = ['PX Import Demo', 'TEST INDEX 1772712763817'];
  for (const name of toDelete) {
    const idx = await auth.dbGet('SELECT id FROM polymer_indexes WHERE name = ?', [name]);
    if (idx) {
      // Delete values first (cascading)
      await auth.dbRun('DELETE FROM polymer_index_values WHERE index_id = ?', [idx.id]);
      await auth.dbRun('DELETE FROM polymer_indexes WHERE id = ?', [idx.id]);
      console.log('✓ Deleted:', name);
    }
  }

  // Rename ICIS Raffia indexes to ICIS PP Raffia
  const renameMap = [
    ['ICIS Raffia Index - Min', 'ICIS PP Raffia - Min'],
    ['ICIS Raffia Index - Max', 'ICIS PP Raffia - Max'],
    ['ICIS Raffia Index - Middle', 'ICIS PP Raffia - Middle']
  ];

  for (const [oldName, newName] of renameMap) {
    const idx = await auth.dbGet('SELECT id FROM polymer_indexes WHERE name = ?', [oldName]);
    if (idx) {
      await auth.dbRun(
        'UPDATE polymer_indexes SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newName, idx.id]
      );
      console.log(`✓ Renamed: "${oldName}" → "${newName}"`);
    }
  }

  console.log('\n✓ Cleanup complete!');
  process.exit(0);
}

cleanupAndRename().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
