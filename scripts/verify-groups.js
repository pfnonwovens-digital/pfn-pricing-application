/**
 * Verify Group Assignments
 */

const auth = require('../src/backend/auth');

async function main() {
  try {
    await auth.initializeDatabase();
    
    console.log('\n========================================');
    console.log('   User & Group Verification');
    console.log('========================================\n');

    // Check admin user
    const adminUser = await auth.dbGet("SELECT id, email, name FROM users WHERE email = 'mfischer@pfnonwovens.com'");
    console.log('Admin user (mfischer):');
    console.log(JSON.stringify(adminUser, null, 2));

    // Check test user
    const testUser = await auth.dbGet("SELECT id, email, name FROM users WHERE email = 'testuser@pfnonwovens.com'");
    console.log('\nTest user (testuser):');
    console.log(JSON.stringify(testUser, null, 2));

    // Check Admin group
    const adminGroup = await auth.dbGet("SELECT * FROM groups WHERE name = 'Admin'");
    console.log('\nAdmin group:');
    console.log(JSON.stringify(adminGroup, null, 2));

    // Check PD Users group
    const pdGroup = await auth.dbGet("SELECT * FROM groups WHERE name = 'PD Users'");
    console.log('\nPD Users group:');
    console.log(JSON.stringify(pdGroup, null, 2));

    // Check group memberships
    if (adminUser && adminGroup) {
      const adminMembership = await auth.dbGet(
        "SELECT * FROM user_groups WHERE user_id = ? AND group_id = ?",
        [adminUser.id, adminGroup.id]
      );
      console.log('\nAdmin user in Admin group:');
      console.log(JSON.stringify(adminMembership, null, 2));
    }

    if (testUser && pdGroup) {
      const testMembership = await auth.dbGet(
        "SELECT * FROM user_groups WHERE user_id = ? AND group_id = ?",
        [testUser.id, pdGroup.id]
      );
      console.log('\nTest user in PD Users group:');
      console.log(JSON.stringify(testMembership, null, 2));
    }

    // Get all groups and their users
    const allGroups = await auth.getGroups();
    console.log('\n\nAll groups with users:');
    for (const group of allGroups) {
      console.log(`\n${group.name}:`);
      const users = await auth.getUsersInGroup(group.id);
      console.log(JSON.stringify(users, null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
