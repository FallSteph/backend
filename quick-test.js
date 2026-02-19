import mongoose from 'mongoose';

// Try different connection options
const testOptions = [
  {
    name: 'Direct with IP (if known)',
    uri: 'mongodb://nexora_db_admin_AACFF:2F%40@[IP_ADDRESS]:27017/nexora?retryWrites=true&w=majority&ssl=true'
  },
  {
    name: 'Try without SSL',
    uri: 'mongodb://nexora_db_admin_AACFF:2F%40@nexora.lmlczqu.mongodb.net:27017/nexora?retryWrites=true&w=majority'
  },
  {
    name: 'Local MongoDB',
    uri: 'mongodb://localhost:27017/nexora'
  }
];

async function testConnections() {
  for (const option of testOptions) {
    console.log(`\nTesting: ${option.name}`);
    console.log(`URI: ${option.uri.replace(/:[^:]*@/, ':****@')}`);
    
    try {
      await mongoose.connect(option.uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
      });
      
      console.log('✅ SUCCESS!');
      console.log(`Connected to: ${mongoose.connection.host}`);
      await mongoose.disconnect();
      return; // Stop after first success
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
      await mongoose.disconnect().catch(() => {});
    }
  }
  
  console.log('\n🔴 All connection attempts failed.');
  console.log('\nNext steps:');
  console.log('1. Check your internet connection');
  console.log('2. Try using a VPN');
  console.log('3. Use phone hotspot');
  console.log('4. Install MongoDB locally');
}

testConnections();