const http = require('http');

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
      console.log('✓ Login successful');
      console.log(`  Token: ${token.substring(0, 20)}...`);
      
      // Now test the groups endpoint
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
          console.log(`✓ Groups endpoint response (Status: ${res2.statusCode}):`);
          try {
            const groups = JSON.parse(groupsData);
            console.log(JSON.stringify(groups, null, 2));
            
            // Check if user is in Admin group
            const isAdmin = groups.some(g => g.name === 'Admin');
            console.log(`\n✓ User is Admin: ${isAdmin}`);
          } catch (e) {
            console.log('Response:', groupsData);
          }
        });
      });
      
      groupsReq.on('error', (e) => {
        console.error('Groups endpoint error:', e.message);
      });
      
      groupsReq.end();
    } catch (e) {
      console.error('Login parse error:', e.message);
      console.error('Response:', data);
    }
  });
});

loginReq.on('error', (e) => {
  console.error(' Login error:', e.message);
});

loginReq.write(loginData);
loginReq.end();
