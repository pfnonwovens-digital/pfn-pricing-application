const http = require('http');
const fs = require('fs');

// Test configuration
const tests = [];
const logFile = 'test-results.txt';

// Clear previous results
try { fs.unlinkSync(logFile); } catch(e) {}

function log(msg) {
  fs.appendFileSync(logFile, `${msg}\n`);
}

log('=== Endpoint Testing ===\n');

// Test 1: Health check
setTimeout(() => {
  const req = http.request('http://localhost:3000/api/health', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      log(`[TEST 1] Health Check: ${res.statusCode === 200 ? 'PASS' : 'FAIL'}`);
      contineTest2();
    });
  });
  req.on('error', (e) => {
    log(`[TEST 1] Health Check: FAIL - ${e.message}`);
    process.exit(1);
  });
  req.end();
}, 100);

function contineTest2() {
  // Test 2: Login
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
  // Test 3: Groups endpoint
  const groupsReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me/groups',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      log(`[TEST 3] Groups Endpoint Status: ${res.statusCode}`);
      if (res.statusCode === 200) {
        try {
          const groups = JSON.parse(data);
          log(`[TEST 3] Groups Response: ${JSON.stringify(groups)}`);
          const isAdmin = groups.some(g => g.name === 'Admin');
          log(`[TEST 3] User is Admin: ${isAdmin ? 'YES' : 'NO'}`);
          log(`[TEST 3] Groups Endpoint: ${isAdmin ? 'PASS' : 'FAIL'}`);
        } catch (e) {
          log(`[TEST 3] Groups Endpoint: PARTIAL - Status 200 but parse failed`);
          log(`  Raw response: ${data}`);
        }
      } else {
        log(`[TEST 3] Groups Endpoint: FAIL - Status ${res.statusCode}`);
        log(`  Response: ${data}`);
      }
      
      log('\n=== Tests Complete ===');
      process.exit(0);
    });
  });
  
  groupsReq.on('error', (e) => {
    log(`[TEST 3] Groups Endpoint: FAIL - ${e.message}`);
    process.exit(1);
  });
  
  groupsReq.end();
}

// Timeout safety
setTimeout(() => {
  log('TIMEOUT - Tests did not complete');
  process.exit(1);
}, 10000);
