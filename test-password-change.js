#!/usr/bin/env node

/**
 * Test script for Change Password feature and Admin page improvements
 */

const http = require('http');

const API_BASE = 'http://localhost:3000';

function makeRequest(method, path, body = null, authToken = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      method: method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function main() {
  console.log('\n=== PASSWORD CHANGE FEATURE TEST ===\n');

  try {
    // TEST 1: Login with admin user
    console.log('[TEST 1] Login as admin user...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      email: 'mfischer@pfnonwovens.com',
      password: 'admin326'
    });

    if (loginRes.status !== 200) {
      console.log('[TEST 1] FAIL - Could not login');
      console.log('Response:', loginRes);
      return;
    }

    const token = loginRes.data.token;
    console.log('[TEST 1] PASS - Logged in, token received\n');

    // TEST 2: Try changing password with wrong current password
    console.log('[TEST 2] Try changing password with wrong current password...');
    const wrongRes = await makeRequest('POST', '/api/auth/change-password', {
      currentPassword: 'wrongpassword',
      newPassword: 'newpassword123'
    }, token);

    if (wrongRes.status !== 401) {
      console.log('[TEST 2] FAIL - Should return 401 for incorrect current password');
      console.log('Response:', wrongRes);
    } else {
      console.log('[TEST 2] PASS - Correctly rejected wrong current password\n');
    }

    // TEST 3: Try changing password with valid current password
    console.log('[TEST 3] Change password with correct current password...');
    const changeRes = await makeRequest('POST', '/api/auth/change-password', {
      currentPassword: 'admin326',
      newPassword: 'newadmin456'
    }, token);

    if (changeRes.status !== 200) {
      console.log('[TEST 3] FAIL - Password change failed');
      console.log('Response:', changeRes);
    } else {
      console.log('[TEST 3] PASS - Password changed successfully');
      console.log('Response:', changeRes.data);
      console.log();

      // TEST 4: Try logging in with old password (should fail)
      console.log('[TEST 4] Try logging in with old password...');
      const oldLogin = await makeRequest('POST', '/api/auth/login', {
        email: 'mfischer@pfnonwovens.com',
        password: 'admin326'
      });

      if (oldLogin.status !== 401) {
        console.log('[TEST 4] FAIL - Should not login with old password');
        console.log('Response:', oldLogin);
      } else {
        console.log('[TEST 4] PASS - Old password no longer works\n');

        // TEST 5: Try logging in with new password (should succeed)
        console.log('[TEST 5] Log in with new password...');
        const newLogin = await makeRequest('POST', '/api/auth/login', {
          email: 'mfischer@pfnonwovens.com',
          password: 'newadmin456'
        });

        if (newLogin.status !== 200) {
          console.log('[TEST 5] FAIL - Could not login with new password');
          console.log('Response:', newLogin);
        } else {
          console.log('[TEST 5] PASS - Successfully logged in with new password\n');

          // TEST 6: Change password back to admin326
          console.log('[TEST 6] Change password back to original...');
          const backRes = await makeRequest('POST', '/api/auth/change-password', {
            currentPassword: 'newadmin456',
            newPassword: 'admin326'
          }, newLogin.data.token);

          if (backRes.status !== 200) {
            console.log('[TEST 6] FAIL - Could not change password back');
            console.log('Response:', backRes);
          } else {
            console.log('[TEST 6] PASS - Password restored to original\n');

            // TEST 7: Verify new password cannot be used
            console.log('[TEST 7] Verify old temp password no longer works...');
            const verifyOld = await makeRequest('POST', '/api/auth/login', {
              email: 'mfischer@pfnonwovens.com',
              password: 'newadmin456'
            });

            if (verifyOld.status !== 401) {
              console.log('[TEST 7] FAIL - Old temp password should not work');
            } else {
              console.log('[TEST 7] PASS - Old temp password correctly rejected\n');
            }
          }
        }
      }
    }

    // TEST 8: Check that groups are properly returned for button visibility
    console.log('[TEST 8] Check user groups for Test Group membership...');
    const loginRes2 = await makeRequest('POST', '/api/auth/login', {
      email: 'mfischer@pfnonwovens.com',
      password: 'admin326'
    });

    if (loginRes2.status === 200) {
      const groupsRes = await makeRequest('GET', '/api/auth/me/groups', null, loginRes2.data.token);
      if (groupsRes.status === 200) {
        const groups = groupsRes.data;
        const inTestGroup = groups.some(g => g.name === 'Test Group');
        console.log(`[TEST 8] PASS - User groups retrieved: ${groups.map(g => g.name).join(', ')}`);
        console.log(`         User is in Test Group: ${inTestGroup} (Change Password button should ${inTestGroup ? 'NOT' : ''} show)\n`);
      }
    }

    console.log('=== PASSWORD CHANGE TESTS COMPLETE ===\n');

  } catch (err) {
    console.error('Test error:', err.message);
  }
}

main();
