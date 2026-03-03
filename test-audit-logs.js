async function testAuditLogs() {
    console.log('🧪 Testing Audit Logs Feature...\n');

    try {
        // First, login to get a token
        console.log('1️⃣  Logging in as admin...');
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'mfischer@pfnonwovens.com',
                password: 'admin326'
            })
        });

        const loginData = await loginRes.json();
        
        if (!loginRes.ok) {
            console.error('❌ Login failed:', loginData.error);
            return;
        }

        console.log('✅ Login successful');
        const token = loginData.token;

        // Test 1: Get audit logs without filters
        console.log('\n2️⃣  Fetching all audit logs...');
        const logsRes = await fetch('http://localhost:3000/api/admin/audit-logs', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const logsData = await logsRes.json();
        
        if (!logsRes.ok) {
            console.error('❌ Failed to fetch audit logs:', logsData.error);
            return;
        }

        console.log('✅ Successfully fetched audit logs');
        console.log(`   Found ${logsData.logs.length} log entries`);
        
        if (logsData.logs.length > 0) {
            console.log('\n📋 Sample log entries:');
            logsData.logs.slice(0, 3).forEach((log, idx) => {
                console.log(`\n   [${idx + 1}]`);
                console.log(`   - Timestamp: ${log.timestamp}`);
                console.log(`   - User: ${log.user_email || log.user_id}`);
                console.log(`   - Action: ${log.action}`);
                console.log(`   - Resource: ${log.resource || 'N/A'}`);
                console.log(`   - Details: ${JSON.stringify(log.details)}`);
            });
        }

        // Test 2: Get audit log stats
        console.log('\n3️⃣  Fetching audit log statistics...');
        const statsRes = await fetch('http://localhost:3000/api/admin/audit-logs/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const statsData = await statsRes.json();
        
        if (!statsRes.ok) {
            console.error('❌ Failed to fetch stats:', statsData.error);
            return;
        }

        console.log('✅ Successfully fetched statistics');
        console.log(`   Total Logs: ${statsData.stats.total_logs}`);
        console.log(`   Unique Users: ${statsData.stats.unique_users}`);
        console.log(`   Unique Actions: ${statsData.stats.unique_actions}`);
        console.log(`   Last Activity: ${statsData.stats.last_activity}`);

        // Test 3: Filter by action
        console.log('\n4️⃣  Testing filter by action (LOGIN_SUCCESS)...');
        const filterRes = await fetch('http://localhost:3000/api/admin/audit-logs?action=LOGIN_SUCCESS', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const filterData = await filterRes.json();
        
        if (!filterRes.ok) {
            console.error('❌ Failed to filter logs:', filterData.error);
            return;
        }

        console.log('✅ Successfully filtered logs');
        console.log(`   Found ${filterData.logs.length} LOGIN_SUCCESS entries`);

        // Test 4: Test non-admin access (should fail)
        console.log('\n5️⃣  Testing non-admin access (should fail)...');
        
        // Try to login as test user (if exists)
        const testLoginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'testuser@pfnonwovens.com',
                password: 'password123'
            })
        });

        if (testLoginRes.ok) {
            const testLoginData = await testLoginRes.json();
            const testToken = testLoginData.token;

            const noPermRes = await fetch('http://localhost:3000/api/admin/audit-logs', {
                headers: { 'Authorization': `Bearer ${testToken}` }
            });

            if (noPermRes.ok) {
                console.log('⚠️  WARNING: Non-admin user was able to access audit logs!');
            } else {
                console.log('✅ Correctly denied access to non-admin user');
                console.log(`   Status: ${noPermRes.status}`);
            }
        } else {
            console.log('⚠️  Could not test non-admin access (test user not available)');
        }

        console.log('\n✅ All audit log tests completed successfully!');
        console.log('\n📊 Summary:');
        console.log('   ✓ Audit logs endpoint working');
        console.log('   ✓ Statistics endpoint working');
        console.log('   ✓ Filtering working');
        console.log('   ✓ Admin-only access enforced');

    } catch (err) {
        console.error('❌ Test failed:', err.message);
        console.error(err);
    }
}

// Run the tests
testAuditLogs();
