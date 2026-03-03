const http = require('http');
const fs = require('fs');
const logFile = 'endpoint-test.log';

function log(msg) {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

// Clear log
fs.writeFileSync(logFile, '');

log('Starting endpoint test...');

// First, login to get a token
const loginData = JSON.stringify({
  email: 'mfischer@pfnonwovens.com',
  password: 'admin326'
});

const loginOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

const loginReq = http.request(loginOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const loginResult = JSON.parse(data);
      const token = loginResult.token;
      log('✓ Login successful');
      log(`  Token length: ${token.length}`);
      
      // Now test the groups endpoint
      setTimeout(() => {
        const groupsOptions = {
          hostname: 'localhost',
          port: 3000,
          path: '/api/auth/me/groups',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        };
        
        const groupsReq = http.request(groupsOptions, (res2) => {
          let groupsData = '';
          res2.on('data', (chunk) => {
            groupsData += chunk;
          });
          res2.on('end', () => {
            log(`✓ Groups endpoint response (Status: ${res2.statusCode}):`);
            try {
              const groups = JSON.parse(groupsData);
              log(`Groups: ${JSON.stringify(groups, null, 2)}`);
              
              // Check if user is in Admin group
              const isAdmin = groups.some(g => g.name === 'Admin');
              log(`✓ User is Admin: ${isAdmin}`);
              process.exit(0);
            } catch (e) {
              log(`Error parsing groups: ${e.message}`);
              log(`Raw response: ${groupsData}`);
              process.exit(1);
            }
          });
        });
        
        groupsReq.on('error', (e) => {
          log(`✗ Groups endpoint error: ${e.message}`);
          process.exit(1);
        });
        
        groupsReq.end();
      }, 100);
    } catch (e) {
      log(`✗ Login parse error: ${e.message}`);
      log(`Response: ${data}`);
      process.exit(1);
    }
  });
});

loginReq.on('error', (e) => {
  log(`✗ Login error: ${e.message}`);
  process.exit(1);
});

loginReq.write(loginData);
loginReq.end();

// Timeout after 5 seconds
setTimeout(() => {
  log('✗ Test timed out');
  process.exit(1);
}, 5000);
