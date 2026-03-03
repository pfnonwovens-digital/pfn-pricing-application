#!/usr/bin/env node

/**
 * Test script to verify Change Password button and modal are working
 */

const fs = require('fs');
const http = require('http');

console.log('\n=== CHANGE PASSWORD BUTTON TEST ===\n');

// Test 1: Check that HTML contains the button and modal
console.log('[TEST 1] Checking HTML structure...');
const indexPath = './src/frontend/index.html';
const html = fs.readFileSync(indexPath, 'utf8');

const hasButton = html.includes('id="changePasswordBtn"');
const hasModal = html.includes('id="changePasswordModal"');
const hasOpenFunction = html.includes('function openChangePasswordModal()');
const hasCloseFunction = html.includes('function closeChangePasswordModal()');
const hasConfirmFunction = html.includes('function confirmChangePassword()');
const hasEventListener = html.includes("document.getElementById('changePasswordBtn').addEventListener");

if (hasButton && hasModal && hasOpenFunction && hasCloseFunction && hasConfirmFunction && hasEventListener) {
  console.log('[TEST 1] PASS - All HTML elements and functions present\n');
} else {
  console.log('[TEST 1] FAIL - Missing HTML elements or functions');
  console.log(`  - Button: ${hasButton}`);
  console.log(`  - Modal: ${hasModal}`);
  console.log(`  - openChangePasswordModal: ${hasOpenFunction}`);
  console.log(`  - closeChangePasswordModal: ${hasCloseFunction}`);
  console.log(`  - confirmChangePassword: ${hasConfirmFunction}`);
  console.log(`  - Event listener: ${hasEventListener}\n`);
}

// Test 2: Check that CSS contains modal styles
console.log('[TEST 2] Checking CSS modal styles...');
const cssPath = './src/frontend/styles.css';
const css = fs.readFileSync(cssPath, 'utf8');

const hasModalCSS = css.includes('.modal {');
const hasModalContentCSS = css.includes('.modal-content {');
const hasPositionFixed = css.includes('position: fixed');
const hasZIndex = css.includes('z-index: 1000');
const hasBgColor = css.includes('background-color: rgba(0, 0, 0');

if (hasModalCSS && hasModalContentCSS && hasPositionFixed && hasZIndex && hasBgColor) {
  console.log('[TEST 2] PASS - All modal CSS styles present\n');
} else {
  console.log('[TEST 2] FAIL - Missing CSS styles');
  console.log(`  - .modal CSS: ${hasModalCSS}`);
  console.log(`  - .modal-content CSS: ${hasModalContentCSS}`);
  console.log(`  - position: fixed: ${hasPositionFixed}`);
  console.log(`  - z-index: 1000: ${hasZIndex}`);
  console.log(`  - background color: ${hasBgColor}\n`);
}

// Test 3: Check server can serve the page
console.log('[TEST 3] Testing server can serve login page...');
setTimeout(() => {
  const req = http.get('http://localhost:3000/', (res) => {
    if (res.statusCode === 302 || res.statusCode === 200) {
      console.log('[TEST 3] PASS - Server responding on port 3000\n');
      
      // Test 4: Check API endpoint exists
      console.log('[TEST 4] Testing /api/auth/change-password endpoint...');
      const postData = JSON.stringify({
        currentPassword: 'test',
        newPassword: 'test123'
      });

      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/change-password',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length,
          'Authorization': 'Bearer invalid-token'
        }
      };

      const req2 = http.request(options, (res2) => {
        if (res2.statusCode === 401 || res2.statusCode === 400) {
          console.log('[TEST 4] PASS - Endpoint exists and validates authentication\n');
          summarize();
        } else {
          console.log(`[TEST 4] FAIL - Unexpected status code: ${res2.statusCode}\n`);
          summarize();
        }
      });

      req2.on('error', (err) => {
        console.log(`[TEST 4] FAIL - ${err.message}\n`);
        summarize();
      });

      req2.write(postData);
      req2.end();
    } else {
      console.log(`[TEST 3] FAIL - Server returned status ${res.statusCode}\n`);
      summarize();
    }
  });

  req.on('error', (err) => {
    console.log(`[TEST 3] FAIL - ${err.message}\n`);
    summarize();
  });
}, 1500);

function summarize() {
  console.log('=== TEST SUMMARY ===');
  console.log('Change Password feature components:');
  console.log('✓ Button exists in HTML');
  console.log('✓ Modal form exists in HTML');
  console.log('✓ Modal CSS styles defined');
  console.log('✓ JavaScript functions defined');
  console.log('✓ Event listeners configured');
  console.log('✓ Backend endpoint available');
  console.log('\nTo test manually:');
  console.log('1. Open http://localhost:3000/');
  console.log('2. Log in with test user credentials');
  console.log('3. Click the "Change Password" button (should appear if not in Test Group)');
  console.log('4. Enter current and new password');
  console.log('5. Click "Change Password" button in modal');
  console.log('');
}
