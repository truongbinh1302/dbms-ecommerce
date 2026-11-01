/**
 * run-seed.js
 * Chạy từ thư mục backend-app:  node run-seed.js
 * Nạp dữ liệu mẫu từ ../database/seeds/002_seed_demo_data.sql
 *
 * ⚠️  Chạy run-migration.js TRƯỚC khi chạy file này!
 * ⚠️  Chỉ chạy 1 lần — chạy lại sẽ bị lỗi duplicate key (bình thường).
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config(); // load .env trong backend-app/

const sql = require('mssql');

const sqlServerRaw = process.env.SQL_SERVER || 'localhost,1433';
const [sqlHost, sqlPortStr] = sqlServerRaw.split(',');

const config = {
  server: sqlHost || 'localhost',
  port: Number(process.env.SQL_PORT || sqlPortStr || 1433),
  database: process.env.SQL_DATABASE || 'ecommerce_dbms',
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_PASSWORD || 'SuperStrongPassword123!',
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 120000,
};

// Chạy mọi file .sql trong database/seeds theo thứ tự tên (002 dữ liệu demo, 003 linh kiện Build PC...).
const seedDir = path.join(__dirname, '..', 'database', 'seeds');

async function runSeed() {
  console.log('🔌 Connecting to SQL Server at', config.server + ':' + config.port, '...');

  let pool;
  try {
    pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');
  } catch (err) {
    console.error('❌ Cannot connect to SQL Server:', err.message);
    console.error('\n💡 Chạy run-migration.js trước: node run-migration.js');
    process.exit(1);
  }

  let batches = [];
  try {
    const seedFiles = fs.readdirSync(seedDir).filter((file) => file.toLowerCase().endsWith('.sql')).sort();
    for (const file of seedFiles) {
      const fileBatches = fs.readFileSync(path.join(seedDir, file), 'utf8')
        .split(/^\s*GO\s*$/im)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
      console.log(`📄 Đọc ${fileBatches.length} batch từ ${file}`);
      batches = batches.concat(fileBatches);
    }
  } catch (err) {
    console.error('❌ Cannot read seed files in:', seedDir);
    process.exit(1);
  }

  console.log('⏳ Đang nạp dữ liệu (50.000 sản phẩm + 5.000 đơn hàng — mất 2-5 phút)...\n');

  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const result = await pool.request().batch(batch);
      successCount++;

      if (result.recordsets && result.recordsets.length > 0) {
        console.log('\n📊 Thống kê dữ liệu đã nạp:');
        result.recordsets.forEach((rs) => {
          if (rs[0]) console.log('  ', JSON.stringify(rs[0]));
        });
      } else {
        const preview = batch.replace(/\s+/g, ' ').slice(0, 60);
        console.log(`  ✅ Batch ${i + 1}/${batches.length}: ${preview}...`);
      }
    } catch (err) {
      if (
        err.message.includes('duplicate key') ||
        err.message.includes('Violation of UNIQUE') ||
        err.message.includes('already an object named') ||
        err.message.includes('already exists')
      ) {
        skipCount++;
        console.log(`  ⚠️  Batch ${i + 1}/${batches.length}: Đã có dữ liệu, bỏ qua.`);
      } else {
        console.error(`  ❌ Batch ${i + 1} lỗi:`, err.message);
      }
    }
  }

  await pool.close();
  console.log(`\n🎉 Seed hoàn thành!`);
  console.log(`   ✅ Thành công: ${successCount} batch`);
  if (skipCount > 0) console.log(`   ⚠️  Bỏ qua: ${skipCount} batch (dữ liệu đã tồn tại)`);
  console.log('\n👤 Tài khoản demo:');
  console.log('   Admin:    admin@btstore.local    / password');
  console.log('   Customer: customer@btstore.local / password');
}

runSeed().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
