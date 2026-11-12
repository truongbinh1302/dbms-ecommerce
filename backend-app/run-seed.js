/**
 * run-seed.js
 * Chạy từ thư mục backend-app:  node run-seed.js
 * Nạp dữ liệu mẫu từ các file .sql trong ../database/seeds theo thứ tự tên
 * (002 dữ liệu demo 50.000 sản phẩm, 003 linh kiện Build PC, 010 laptop...).
 *
 * Mỗi file nạp xong được ghi vào bảng SeedHistory, nên chạy lại chỉ nạp file seed mới thêm
 * (không nạp lại 50.000 sản phẩm). Database đã nạp từ trước khi có SeedHistory: các file 002-009
 * được coi là đã nạp.
 *
 * ⚠️  Chạy run-migration.js TRƯỚC khi chạy file này!
 * Có batch lỗi thì file đó không được ghi là đã nạp và script thoát với mã 1.
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

const seedDir = path.join(__dirname, '..', 'database', 'seeds');
// Các file đã có trước khi có bảng SeedHistory.
const LEGACY_PREFIX_MAX = '010';

const splitBatches = (script) => script
  .split(/^\s*GO\s*$/im)
  .map((batch) => batch.trim())
  .filter((batch) => batch.length > 0);

const isAlreadyLoadedError = (message) => message.includes('duplicate key')
  || message.includes('Violation of UNIQUE')
  || message.includes('already an object named')
  || message.includes('already exists');

async function appliedSeeds(pool, seedFiles) {
  await pool.request().batch(`
    IF OBJECT_ID(N'dbo.SeedHistory', N'U') IS NULL
      CREATE TABLE dbo.SeedHistory (
        FileName NVARCHAR(200) NOT NULL CONSTRAINT PK_SeedHistory PRIMARY KEY,
        AppliedAt DATETIME2 NOT NULL CONSTRAINT DF_SeedHistory_AppliedAt DEFAULT SYSDATETIME()
      );
  `);
  const state = await pool.request().query(`
    SELECT FileName FROM dbo.SeedHistory;
    SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Products) THEN 1 ELSE 0 END AS HasProducts;
  `);
  const applied = new Set(state.recordsets[0].map((row) => row.FileName));
  if (applied.size === 0 && state.recordsets[1][0].HasProducts) {
    const legacy = seedFiles.filter((file) => file < LEGACY_PREFIX_MAX);
    for (const file of legacy) {
      await pool.request().input('file', sql.NVarChar(200), file).query('INSERT INTO dbo.SeedHistory (FileName) VALUES (@file)');
      applied.add(file);
    }
    if (legacy.length) console.log(`ℹ️  Database đã có dữ liệu mẫu từ trước: coi ${legacy.join(', ')} là đã nạp.`);
  }
  return applied;
}

async function runSeedFile(pool, file, totals) {
  const batches = splitBatches(fs.readFileSync(path.join(seedDir, file), 'utf8'));
  console.log(`📄 ${file}: ${batches.length} batch`);
  let failed = 0;
  for (let i = 0; i < batches.length; i++) {
    const preview = batches[i].replace(/\s+/g, ' ').slice(0, 60);
    try {
      const result = await pool.request().batch(batches[i]);
      totals.ok++;
      const sets = (result.recordsets || []).filter((rs) => rs[0]);
      if (sets.length) {
        sets.forEach((rs) => console.log('   📊', JSON.stringify(rs[0])));
      } else {
        console.log(`  ✅ Batch ${i + 1}/${batches.length}: ${preview}...`);
      }
    } catch (err) {
      if (isAlreadyLoadedError(err.message)) {
        totals.skipped++;
        console.log(`  ⚠️  Batch ${i + 1}/${batches.length}: Đã có dữ liệu, bỏ qua.`);
      } else {
        failed++;
        totals.failed++;
        console.error(`  ❌ Batch ${i + 1}/${batches.length} lỗi:`, err.message);
      }
    }
  }
  if (failed === 0) {
    await pool.request().input('file', sql.NVarChar(200), file).query('INSERT INTO dbo.SeedHistory (FileName) VALUES (@file)');
  }
  return failed === 0;
}

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

  let seedFiles;
  try {
    seedFiles = fs.readdirSync(seedDir).filter((file) => file.toLowerCase().endsWith('.sql')).sort();
  } catch (err) {
    console.error('❌ Cannot read seed files in:', seedDir);
    process.exit(1);
  }

  const applied = await appliedSeeds(pool, seedFiles);
  const pending = seedFiles.filter((file) => !applied.has(file));
  if (pending.length === 0) {
    console.log('✅ Dữ liệu mẫu đã nạp đủ, không có file seed mới.');
    await pool.close();
    return;
  }

  console.log(`⏳ Nạp ${pending.length} file seed: ${pending.join(', ')}`);
  if (pending.includes('002_seed_demo_data.sql')) console.log('   (50.000 sản phẩm + 5.000 đơn hàng — mất 2-5 phút)');
  console.log('');

  const totals = { ok: 0, skipped: 0, failed: 0 };
  const failedFiles = [];
  for (const file of pending) {
    const ok = await runSeedFile(pool, file, totals);
    if (!ok) failedFiles.push(file);
  }

  await pool.close();
  console.log(`\n🎉 Seed hoàn thành! Thành công: ${totals.ok} batch`);
  if (totals.skipped > 0) console.log(`   ⚠️  Bỏ qua: ${totals.skipped} batch (dữ liệu đã tồn tại)`);
  if (pending.includes('002_seed_demo_data.sql')) {
    console.log('\n👤 Tài khoản demo:');
    console.log('   Admin:    admin@btstore.local    / password');
    console.log('   Customer: customer@btstore.local / password');
  }
  if (failedFiles.length) {
    console.error(`\n❌ ${totals.failed} batch lỗi trong: ${failedFiles.join(', ')}. Các file này chưa được ghi là đã nạp.`);
    process.exitCode = 1;
  }
}

runSeed().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
