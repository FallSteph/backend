import dns from 'dns';

async function diagnose() {
  console.log('=== MongoDB Connection Diagnostic ===\n');
  
  const hostname = 'nexora.lmlczqu.mongodb.net';
  
  // Test 1: Regular DNS lookup
  console.log('1. Testing regular DNS lookup...');
  try {
    const addresses = await dns.promises.lookup(hostname);
    console.log(`✅ Regular lookup OK: ${addresses.address}`);
  } catch (err) {
    console.log(`❌ Regular lookup failed: ${err.message}`);
  }
  
  // Test 2: SRV record lookup (this is failing for you)
  console.log('\n2. Testing SRV record lookup...');
  try {
    const srvRecords = await dns.promises.resolveSrv('_mongodb._tcp.' + hostname);
    console.log(`✅ SRV records found:`, srvRecords);
  } catch (err) {
    console.log(`❌ SRV lookup failed: ${err.message}`);
    console.log('\n🔴 THIS IS YOUR PROBLEM!');
    console.log('Your computer cannot resolve MongoDB SRV records.');
  }
  
  // Test 3: Alternative connection method
  console.log('\n3. Solution: Use direct connection (skip SRV)');
  console.log('Change your connection string to:');
  console.log('mongodb://nexora_db_admin_AACFF:2F%40@nexora.lmlczqu.mongodb.net:27017/nexora?retryWrites=true&w=majority&ssl=true&authSource=admin');
}

diagnose();