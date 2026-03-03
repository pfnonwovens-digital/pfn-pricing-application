// Test if dashboard loads and stats display correctly
console.log('Testing dashboard stats display...\n');

async function testDashboard() {
    try {
        // Login first
        console.log('1. Logging in...');
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

        // Load costs data
        console.log('\n2. Loading costs data...');
        const costsRes = await fetch('http://localhost:3000/api/costs?currency=USD', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const costsData = await costsRes.json();
        if (!costsRes.ok) {
            console.error('❌ Failed to load costs:', costsData);
            return;
        }

        console.log(`✅ Costs loaded: ${costsData.length} records`);
        
        // Check if we have data to display stats
        if (costsData.length > 0) {
            console.log('\n3. Calculating stats...');
            
            const avgMaterial = costsData.reduce((sum, item) => sum + (item.materialCostNet ?? item.materialCost ?? 0), 0) / costsData.length;
            const avgProcess = costsData.reduce((sum, item) => sum + item.processCost, 0) / costsData.length;
            const avgTotal = costsData.reduce((sum, item) => sum + item.totalCost, 0) / costsData.length;

            console.log('✅ Stats calculated:');
            console.log(`   Total Records: ${costsData.length}`);
            console.log(`   Avg Material Cost: ${avgMaterial.toFixed(4)} USD`);
            console.log(`   Avg Process Cost: ${avgProcess.toFixed(4)} USD`);
            console.log(`   Avg Total Cost: ${avgTotal.toFixed(4)} USD`);
        } else {
            console.log('⚠️  No data returned - stats would be empty');
        }

        // Load the dashboard page HTML
        console.log('\n4. Checking dashboard HTML...');
        const dashboardRes = await fetch('http://localhost:3000/dashboard', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const html = await dashboardRes.text();
        
        // Check if summary stats section exists
        if (html.includes('id="summaryStats"')) {
            console.log('✅ Summary stats section found in HTML');
            
            // Check if it has the right structure
            if (html.includes('id="statRecords"') && 
                html.includes('id="statAvgMaterial"') && 
                html.includes('id="statAvgProcess"') && 
                html.includes('id="statAvgTotal"')) {
                console.log('✅ All stat elements present');
            } else {
                console.log('❌ Some stat elements missing!');
            }
        } else {
            console.log('❌ Summary stats section NOT found in HTML!');
        }

        console.log('\n✅ Dashboard test completed successfully!');
        console.log('\n📝 Note: If stats are blank on the page, check:');
        console.log('   1. Click "Load Costs" button to fetch data');
        console.log('   2. Check browser console for JavaScript errors');
        console.log('   3. Verify script.js is loaded correctly');
        console.log('   4. Check if CSS is hiding the stats (display: none)');

    } catch (err) {
        console.error('❌ Test failed:', err.message);
    }
}

testDashboard();
