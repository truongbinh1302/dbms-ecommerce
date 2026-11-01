/**
 * run-migration.js
 * Chạy từ thư mục backend-app:
 *   node run-migration.js           cập nhật schema, GIỮ dữ liệu đang có
 *   node run-migration.js --reset   tạo lại toàn bộ schema từ đầu (XOÁ HẾT dữ liệu)
 *
 * Chạy các file SQL trong ../database/migrations theo thứ tự tên file.
 * 001_create_schema.sql xoá và tạo lại mọi bảng, nên chỉ chạy khi database chưa có bảng
 * (lần đầu cài) hoặc khi truyền --reset. Các file còn lại chạy lại nhiều lần vẫn an toàn.
 * Có batch lỗi thì thoát với mã 1 để CI/Docker biết mà dừng.
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config();

const sql = require('mssql');

const sqlServerRaw = process.env.SQL_SERVER || 'localhost,1433';
const [sqlHost, sqlPortStr] = sqlServerRaw.split(',');
const databaseName = process.env.SQL_DATABASE || 'ecommerce_dbms';
const reset = process.argv.includes('--reset');

const baseConfig = {
  server: sqlHost || 'localhost',
  port: Number(process.env.SQL_PORT || sqlPortStr || 1433),
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_PASSWORD || 'SuperStrongPassword123!',
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 120000,
};

const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
const SCHEMA_FILE_PREFIX = '001_';

const splitBatches = (script) => script
  .split(/^\s*GO\s*$/im)
  .map((batch) => batch.trim())
  .filter((batch) => batch.length > 0);

const isAlreadyExistsError = (message) => message.includes('already an object named')
  || message.includes('already exists')
  || message.includes('There is already');

async function runFile(pool, fileName, totals) {
  const batches = splitBatches(fs.readFileSync(path.join(migrationsDir, fileName), 'utf8'));
  console.log(`📄 Running migration file: ${fileName} (${batches.length} batch)`);
  totals.batches += batches.length;

  for (let i = 0; i < batches.length; i++) {
    const preview = batches[i].replace(/\s+/g, ' ').slice(0, 60);
    try {
      await pool.request().batch(batches[i]);
      totals.ok++;
      console.log(`  ✅ ${fileName} batch ${i + 1}/${batches.length}: ${preview}...`);
    } catch (err) {
      if (isAlreadyExistsError(err.message)) {
        totals.ok++;
        console.log(`  ⚠️  ${fileName} batch ${i + 1}/${batches.length}: Đã tồn tại, bỏ qua.`);
      } else {
        totals.failed++;
        console.error(`  ❌ ${fileName} batch ${i + 1} lỗi:`, err.message);
      }
    }
  }
  console.log('');
}

async function runMigration() {
  console.log('🔌 Connecting to SQL Server at', baseConfig.server + ':' + baseConfig.port, '...');

  let masterPool;
  try {
    masterPool = await new sql.ConnectionPool({ ...baseConfig, database: 'master' }).connect();
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
  } catch {
    console.error('❌ Cannot read migrations directory:', migrationsDir);
    process.exit(1);
  }

  const totals = { batches: 0, ok: 0, failed: 0 };
  const schemaFile = migrationFiles.find((file) => file.startsWith(SCHEMA_FILE_PREFIX));
  const existing = await masterPool.request()
    .input('usersTable', sql.NVarChar, `${databaseName}.dbo.Users`)
    .query('SELECT OBJECT_ID(@usersTable, N\'U\') AS UsersTable');
  const hasSchema = Boolean(existing.recordset[0].UsersTable);

  // 001 tạo database và (tạo lại) mọi bảng: chạy trên kết nối tới master.
  if (schemaFile) {
    if (hasSchema && !reset) {
      console.log(`⏭️  Bỏ qua ${schemaFile}: database ${databaseName} đã có dữ liệu.`);
      console.log('   Muốn tạo lại từ đầu (XOÁ HẾT dữ liệu) thì chạy: node run-migration.js --reset\n');
    } else {
      if (hasSchema) console.log(`⚠️  --reset: tạo lại toàn bộ bảng trong ${databaseName}, dữ liệu cũ bị xoá.\n`);
      await runFile(masterPool, schemaFile, totals);
    }
  }
  await masterPool.close();

  // Các file còn lại chạy trên kết nối gắn sẵn với database, không phụ thuộc lệnh USE của file trước.
  const dbPool = await new sql.ConnectionPool({ ...baseConfig, database: databaseName }).connect();
  for (const fileName of migrationFiles.filter((file) => file !== schemaFile)) {
    await runFile(dbPool, fileName, totals);
  }
  await dbPool.close();

  if (totals.failed > 0) {
    console.error(`❌ Migration có ${totals.failed} batch lỗi (${totals.ok}/${totals.batches} batch thành công).`);
    process.exitCode = 1;
    return;
  }
  console.log(`🎉 Migration hoàn thành! (${totals.ok}/${totals.batches} batch thành công)`);
}

runMigration().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
