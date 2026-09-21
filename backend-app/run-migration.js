/**
 * run-migration.js
 * Chạy từ thư mục backend-app:  node run-migration.js
 * Chạy tất cả file SQL trong ../database/migrations theo thứ tự tên file.
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config();

const sql = require('mssql');

const sqlServerRaw = process.env.SQL_SERVER || 'localhost,1433';
const [sqlHost, sqlPortStr] = sqlServerRaw.split(',');

const config = {
  server: sqlHost || 'localhost',
  port: Number(process.env.SQL_PORT || sqlPortStr || 1433),
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_PASSWORD || 'SuperStrongPassword123!',
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');

async function runMigration() {
  console.log('🔌 Connecting to SQL Server at', config.server + ':' + config.port, '...');

  let pool;
  try {
    pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');
  } catch (err) {
    console.error('❌ Cannot connect to SQL Server:', err.message);
    console.error('\n💡 Gợi ý:');
    console.error('   - Kiểm tra Docker đang chạy: docker ps');
    console.error('   - Kiểm tra SQL_PASSWORD trong .env');
    process.exit(1);
  }

  let migrationFiles;
  try {
    migrationFiles = fs.readdirSync(migrationsDir)
      .filter((file) => file.toLowerCase().endsWith('.sql'))
      .sort();
  } catch (err) {
    console.error('❌ Cannot read migrations directory:', migrationsDir);
    process.exit(1);
  }

  if (migrationFiles.length === 0) {
    console.log('⚠️  Không tìm thấy file migration nào trong', migrationsDir);
    await pool.close();
    return;
  }

  let totalBatchCount = 0;
  let totalSuccessCount = 0;

  for (const fileName of migrationFiles) {
    const filePath = path.join(migrationsDir, fileName);
    let scriptContent;
    try {
      scriptContent = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error('❌ Cannot read migration file:', filePath);
      continue;
    }

    const batches = scriptContent
      .split(/^\s*GO\s*$/im)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    console.log(`📄 Running migration file: ${fileName} (${batches.length} batch)`);

    totalBatchCount += batches.length;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        await pool.request().batch(batch);
        totalSuccessCount++;
        const preview = batch.replace(/\s+/g, ' ').slice(0, 60);
        console.log(`  ✅ ${fileName} batch ${i + 1}/${batches.length}: ${preview}...`);
      } catch (err) {
        if (
          err.message.includes('already an object named') ||
          err.message.includes('already exists') ||
          err.message.includes('There is already')
        ) {
          console.log(`  ⚠️  ${fileName} batch ${i + 1}/${batches.length}: Đã tồn tại, bỏ qua.`);
        } else {
          console.error(`  ❌ ${fileName} batch ${i + 1} lỗi:`, err.message);
        }
      }
    }

    console.log('');
  }

  await pool.close();
  console.log(`🎉 Migration hoàn thành! (${totalSuccessCount}/${totalBatchCount} batch thành công)`);
}

runMigration().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
