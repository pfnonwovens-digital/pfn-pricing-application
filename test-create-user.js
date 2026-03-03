const http = require('http');
const fs = require('fs');

const logFile = 'create-user-test.log';
fs.writeFileSync(logFile, '');

function log(msg) {
  fs.appendFileSync(logFile, `${msg}\n`);
  console.log(msg);
}

log('=== Create User Feature Test ===\n');

// Test 1: Login as admin
setTimeout(() => {
  const loginData = JSON.stringify({
    email: 'mfischer@pfnonwovens.com',
    password: 'admin326'
  });
  
  const loginReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': loginData.length
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (result.token) {
          log(`[TEST 1] Login: PASS`);
          continueTest2(result.token);
        } else {
          log(`[TEST 1] Login: FAIL - No token in response`);
          process.exit(1);
        }
      } catch (e) {
        log(`[TEST 1] Login: FAIL - ${e.message}`);
        process.exit(1);
      }
    });
  });
  
  loginReq.on('error', (e) => {
    log(`[TEST 1] Login: FAIL - ${e.message}`);
    process.exit(1);
  });
  
  loginReq.write(loginData);
  loginReq.end();
}, 100);

function continueTest2(token) {
  // Test 2: Get groups to find one to add user to
  const groupsReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/groups',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const groups = JSON.parse(data);
          if (groups.length > 0) {
            log(`[TEST 2] Get Groups: PASS`);
            log(`  Found ${groups.length} groups`);
            continueTest3(token, groups[0].id);
          } else {
            log(`[TEST 2] Get Groups: FAIL - No groups found`);
            process.exit(1);
          }
        } catch (e) {
          log(`[TEST 2] Get Groups: FAIL - Parse error: ${e.message}`);
          process.exit(1);
        }
      } else {
        log(`[TEST 2] Get Groups: FAIL - Status ${res.statusCode}`);
        process.exit(1);
      }
    });
  });
  
  groupsReq.on('error', (e) => {
    log(`[TEST 2] Get Groups: FAIL - ${e.message}`);
    process.exit(1);
  });
  
  groupsReq.end();
}

function continueTest3(token, groupId) {
  // Test 3: Create a new user
  const newUser = {
    email: 'testcreate.user@pfnonwovens.com',
    fullName: 'Test Create User',
    password: 'TestPass123',
    groupId: groupId
  };
  
  const createData = JSON.stringify(newUser);
  
  const createReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/users',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': createData.length
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 201 || res.statusCode === 200) {
        try {
          const result = JSON.parse(data);
          log(`[TEST 3] Create User: PASS`);
          log(`  Created user: ${result.user.email}`);
          log(`\n=== All Tests Complete ===`);
          process.exit(0);
        } catch (e) {
          log(`[TEST 3] Create User: FAIL - Parse error: ${e.message}`);
          log(`  Raw response: ${data}`);
          process.exit(1);
        }
      } else {
        try {
          const error = JSON.parse(data);
          log(`[TEST 3] Create User: FAIL - Status ${res.statusCode}`);
          log(`  Error: ${error.error}`);
        } catch (e) {
          log(`[TEST 3] Create User: FAIL - Status ${res.statusCode}`);
          log(`  Response: ${data}`);
        }
        process.exit(1);
      }
    });
  });
  
  createReq.on('error', (e) => {
    log(`[TEST 3] Create User: FAIL - ${e.message}`);
    process.exit(1);
  });
  
  createReq.write(createData);
  createReq.end();
}

// Timeout safety
setTimeout(() => {
  log('TIMEOUT - Tests did not complete');
  process.exit(1);
}, 15000);
