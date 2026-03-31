/**
 * Setup Default Groups and Assign Users
 * Usage: node scripts/setup-groups.js
 */

const auth = require('../src/backend/auth');

async function main() {
  try {
    console.log('\n========================================');
    console.log('   Setup Default Groups');
    console.log('========================================\n');

    // Initialize database
    await auth.initializeDatabase();
    console.log('✓ Database initialized');

    // Create Admin group
    let adminGroup;
    try {
      adminGroup = await auth.createGroup('Admin', 'System administrators with full access', ['user:manage', 'admin:all']);
      console.log('✓ Admin group created');
    } catch (err) {
      if (err.message.includes('already exists')) {
        const groups = await auth.getGroups();
        adminGroup = groups.find(g => g.name === 'Admin');
        console.log('✓ Admin group already exists');
      } else {
        throw err;
      }
    }

    // Create PD Users group
    let pdUsersGroup;
    try {
      pdUsersGroup = await auth.createGroup('PD Users', 'Product Development team members', ['product:edit', 'bom:create']);
      console.log('✓ PD Users group created');
    } catch (err) {
      if (err.message.includes('already exists')) {
        const groups = await auth.getGroups();
        pdUsersGroup = groups.find(g => g.name === 'PD Users');
        console.log('✓ PD Users group already exists');
      } else {
        throw err;
      }
    }

    // Resolve group IDs from DB to avoid relying on insert return shape
    const groups = await auth.getGroups();
    adminGroup = groups.find(g => g.name === 'Admin') || adminGroup;
    pdUsersGroup = groups.find(g => g.name === 'PD Users') || pdUsersGroup;

    if (!adminGroup || !adminGroup.id) {
      throw new Error('Admin group missing after setup');
    }
    if (!pdUsersGroup || !pdUsersGroup.id) {
      throw new Error('PD Users group missing after setup');
    }

    // Get users
    const adminUser = await auth.dbGet("SELECT id FROM users WHERE email = 'mfischer@pfnonwovens.com'");
    const testUser = await auth.dbGet("SELECT id FROM users WHERE email = 'testuser@pfnonwovens.com'");

    if (!adminUser) {
      console.warn('⚠ mfischer@pfnonwovens.com user not found');
    } else {
      try {
        await auth.addUserToGroup(adminUser.id, adminGroup.id);
        console.log('✓ mfischer@pfnonwovens.com assigned to Admin group');
      } catch (err) {
        if (err.message.includes('already in this group')) {
          console.log('✓ mfischer@pfnonwovens.com already in Admin group');
        } else {
          throw err;
        }
      }
    }

    if (!testUser) {
      console.warn('⚠ testuser@pfnonwovens.com user not found');
    } else {
      try {
        await auth.addUserToGroup(testUser.id, pdUsersGroup.id);
        console.log('✓ testuser@pfnonwovens.com assigned to PD Users group');
      } catch (err) {
        if (err.message.includes('already in this group')) {
          console.log('✓ testuser@pfnonwovens.com already in PD Users group');
        } else {
          throw err;
        }
      }
    }

    console.log('\n✓ Setup complete!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message, '\n');
    process.exit(1);
  }
}

main();
