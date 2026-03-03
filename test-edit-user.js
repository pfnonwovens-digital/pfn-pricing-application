const http = require('http');
const fs = require('fs');

const logFile = 'edit-user-test.log';
fs.writeFileSync(logFile, '');

function log(msg) {
  fs.appendFileSync(logFile, `${msg}\n`);
  console.log(msg);
}

log('=== Edit User Feature Test ===\n');

// Test 1: Health check
setTimeout(() => {
  const req = http.request('http://localhost:3000/api/health', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      log(`[TEST 1] Health Check: ${res.statusCode === 200 ? 'PASS' : 'FAIL'}`);
      continueTest2();
    });
  });
  req.on('error', (e) => {
    log(`[TEST 1] Health Check: FAIL - ${e.message}`);
    process.exit(1);
  });
  req.end();
}, 100);

function continueTest2() {
  // Test 2: Login as admin
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
          log(`[TEST 2] Login: PASS`);
          continueTest3(result.token);
        } else {
          log(`[TEST 2] Login: FAIL - No token in response`);
          process.exit(1);
        }
      } catch (e) {
        log(`[TEST 2] Login: FAIL - ${e.message}`);
        process.exit(1);
      }
    });
  });
  
  loginReq.on('error', (e) => {
    log(`[TEST 2] Login: FAIL - ${e.message}`);
    process.exit(1);
  });
  
  loginReq.write(loginData);
  loginReq.end();
}

function continueTest3(token) {
  // Test 3: Get users to find a test user
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
          if (groups.length > 0 && groups[0].users && groups[0].users.length > 0) {
            const testUser = groups[0].users[0];
            log(`[TEST 3] Found test user: ${testUser.email} (ID: ${testUser.id})`);
            continueTest4(token, testUser.id, testUser.email, testUser.name);
          } else {
            log(`[TEST 3] No users found in groups`);
            process.exit(0);
          }
        } catch (e) {
          log(`[TEST 3] Parse error: ${e.message}`);
          process.exit(1);
        }
      } else {
        log(`[TEST 3] Failed to get groups: ${res.statusCode}`);
        process.exit(1);
      }
    });
  });
  
  groupsReq.on('error', (e) => {
    log(`[TEST 3] Error: ${e.message}`);
    process.exit(1);
  });
  
  groupsReq.end();
}

function continueTest4(token, userId, originalEmail, originalName) {
  // Test 4: Update user
  const updateData = JSON.stringify({
    email: 'updated.test.user@pfnonwovens.com',
    fullName: 'Updated Test User',
    password: 'NewPassword123'
  });
  
  const updateReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users/${userId}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': updateData.length
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        log(`[TEST 4] Update User: PASS`);
        log(`  Response: ${data}`);
        
        // Test 5: Restore original values
        continueTest5(token, userId, originalEmail, originalName);
      } else {
        log(`[TEST 4] Update User: FAIL - Status ${res.statusCode}`);
        log(`  Response: ${data}`);
        process.exit(1);
      }
    });
  });
  
  updateReq.on('error', (e) => {
    log(`[TEST 4] Error: ${e.message}`);
    process.exit(1);
  });
  
  updateReq.write(updateData);
  updateReq.end();
}

function continueTest5(token, userId, originalEmail, originalName) {
  // Test 5: Restore original values
  const restoreData = JSON.stringify({
    email: originalEmail,
    fullName: originalName
  });
  
  const restoreReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users/${userId}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': restoreData.length
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        log(`[TEST 5] Restore User: PASS`);
        log(`\n=== All Tests Complete ===`);
        process.exit(0);
      } else {
        log(`[TEST 5] Restore User: FAIL - Status ${res.statusCode}`);
        log(`  Response: ${data}`);
        process.exit(1);
      }
    });
  });
  
  restoreReq.on('error', (e) => {
    log(`[TEST 5] Error: ${e.message}`);
    process.exit(1);
  });
  
  restoreReq.write(restoreData);
  restoreReq.end();
}

// Timeout safety
setTimeout(() => {
  log('TIMEOUT - Tests did not complete');
  process.exit(1);
}, 15000);
