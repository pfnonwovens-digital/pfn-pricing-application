/**
 * Quick Setup - Create initial admin user (non-interactive)
 * Usage: node scripts/setup.js
 * Will create: testuser@pfnonwovens.com / TestPass123 (role: admin)
 */

const auth = require('../src/backend/auth');

async function main() {
  try {
    console.log('\n========================================');
    console.log('   Mini ERP - Initial Setup');
    console.log('========================================\n');

    // Initialize database
    await auth.initializeDatabase();
    console.log('✓ Database initialized');

    // Create test admin user
    try {
      const user = await auth.createUser(
        'testuser@pfnonwovens.com',
        'Test User',
        'TestPass123',
        'admin'
      );

      console.log('\n✓ Admin user created successfully!');
      console.log('\nTest Credentials:');
      console.log('  Email: testuser@pfnonwovens.com');
      console.log('  Password: TestPass123');
      console.log(`  Role: ${user.role}`);
    } catch (err) {
      if (err.message.includes('already in use')) {
        console.log('\n✓ Test user already exists (skipping)');
      } else {
        throw err;
      }
    }

    console.log('\n✓ Setup complete!');
    console.log('\nYou can now:');
    console.log('  1. Start the server: npm start');
    console.log('  2. Open: http://localhost:3000/login.html');
    console.log('  3. Login with test credentials above');
    console.log();

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message, '\n');
    process.exit(1);
  }
}

main();
