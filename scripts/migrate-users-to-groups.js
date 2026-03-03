/**
 * One-time migration: Auto-assign active corporate users without groups to General Access
 * Usage: node scripts/migrate-users-to-groups.js
 */

const auth = require('../src/backend/auth');

async function main() {
  try {
    console.log('\n========================================');
    console.log('   User Group Migration');
    console.log('========================================\n');

    // Initialize database
    await auth.initializeDatabase();
    console.log('✓ Database initialized');

    // Get all users
    const allUsers = await auth.dbAll('SELECT id, email, name, is_active FROM users', []);
    console.log(`\nFound ${allUsers.length} total users`);

    // Filter to active corporate users
    const activeCorpUsers = allUsers.filter(user => 
      user.is_active === 1 && 
      user.email && 
      user.email.toLowerCase().endsWith('@pfnonwovens.com')
    );
    console.log(`Found ${activeCorpUsers.length} active corporate (@pfnonwovens.com) users`);

    // Check which users lack group membership
    const usersWithoutGroups = [];
    for (const user of activeCorpUsers) {
      const membership = await auth.dbGet(
        'SELECT COUNT(*) as count FROM user_groups WHERE user_id = ?',
        [user.id]
      );
      if (!membership || membership.count < 1) {
        usersWithoutGroups.push(user);
      }
    }

    if (usersWithoutGroups.length === 0) {
      console.log('\n✓ All active corporate users already have group assignments');
      console.log('\nMigration complete - no changes needed!\n');
      process.exit(0);
    }

    console.log(`\n⚠ Found ${usersWithoutGroups.length} users without group assignments:`);
    usersWithoutGroups.forEach(user => {
      console.log(`  - ${user.name} (${user.email})`);
    });

    // Ensure General Access group exists
    let generalAccessGroup = await auth.dbGet('SELECT id FROM groups WHERE name = ?', ['General Access']);
    if (!generalAccessGroup) {
      console.log('\n→ Creating "General Access" group...');
      await auth.dbRun(
        'INSERT INTO groups (name, description, permissions) VALUES (?, ?, ?)',
        ['General Access', 'Baseline access group for active users', JSON.stringify([])]
      );
      generalAccessGroup = await auth.dbGet('SELECT id FROM groups WHERE name = ?', ['General Access']);
      console.log('✓ "General Access" group created');
    } else {
      console.log('\n✓ "General Access" group already exists');
    }

    // Assign users to General Access
    console.log('\n→ Assigning users to "General Access"...');
    let successCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutGroups) {
      try {
        await auth.dbRun(
          'INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)',
          [user.id, generalAccessGroup.id]
        );
        console.log(`  ✓ ${user.email}`);
        successCount++;
      } catch (err) {
        console.error(`  ✗ ${user.email}: ${err.message}`);
        errorCount++;
      }
    }

    console.log('\n========================================');
    console.log('   Migration Summary');
    console.log('========================================');
    console.log(`Total users processed: ${usersWithoutGroups.length}`);
    console.log(`Successfully assigned: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('\n✓ Migration complete!\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
