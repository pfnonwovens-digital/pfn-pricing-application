#!/usr/bin/env node

/**
 * Seed Script - Create initial admin user
 * Usage: node scripts/seed-admin.js
 */

const auth = require('../src/backend/auth');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

async function main() {
  try {
    console.log('\n========================================');
    console.log('   Mini ERP - Create Admin User');
    console.log('========================================\n');

    // Initialize database
    await auth.initializeDatabase();
    console.log('✓ Database schema initialized');

    // Get user input
    const email = await question('\nEmail: ');
    const name = await question('Full Name: ');
    const password = await question('Password (min 8 chars): ');
    const confirm = await question('Confirm Password: ');

    if (!email || !name || !password) {
      console.log('\n❌ All fields are required\n');
      rl.close();
      process.exit(1);
    }

    if (password !== confirm) {
      console.log('\n❌ Passwords do not match\n');
      rl.close();
      process.exit(1);
    }

    // Create admin user
    const user = await auth.createUser(email, name, password, 'admin');

    console.log('\n✓ Admin user created successfully!');
    console.log('\nUser Details:');
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Role: ${user.role}`);
    console.log('\n✓ You can now login to the application\n');

    rl.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message, '\n');
    rl.close();
    process.exit(1);
  }
}

main();
