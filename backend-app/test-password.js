const bcrypt = require('bcryptjs');

// Password hash từ seed data
const seedHash = '$2a$10$LMLgKTcM2wnRcg4gUMhsv./SbIGmL.n5IXoSfCRYSsH5y.rRDuEZ6';
const plainPassword = 'password';

async function test() {
  try {
    console.log('🔍 Kiểm tra password hash...');
    console.log(`Hash từ seed: ${seedHash}`);
    console.log(`Mật khẩu plain: ${plainPassword}`);
    
    const isMatch = await bcrypt.compare(plainPassword, seedHash);
    console.log(`\n✅ Kết quả: ${isMatch ? 'MẬT KHẨU ĐÚNG' : 'MẬT KHẨU SAI'}`);
    
    // Kiểm tra xem hash có valid không
    const testHash = await bcrypt.hash('password', 10);
    console.log(`\n🔧 Test hash mới: ${testHash}`);
    const testMatch = await bcrypt.compare('password', testHash);
    console.log(`Test match result: ${testMatch}`);
    
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  }
  process.exit(0);
}

test();
