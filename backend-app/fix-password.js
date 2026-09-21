const sql = require('mssql');
require('dotenv').config();

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
    enableKeepAlive: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

async function fixPassword() {
  let pool;

  try {
    console.log('Dang ket noi SQL Server...');
    pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log('Ket noi thanh cong!');

    const correctHash = '$2a$10$LMLgKTcM2wnRcg4gUMhsv./SbIGmL.n5IXoSfCRYSsH5y.rRDuEZ6';

    console.log('Dang khoi phuc tai khoan admin demo...');

    const result = await pool.request()
      .input('email', sql.NVarChar, 'admin@btstore.local')
      .input('fullName', sql.NVarChar, 'Admin BinhTinhStore')
      .input('passwordHash', sql.NVarChar, correctHash)
      .input('phone', sql.NVarChar, '0900000001')
      .input('address', sql.NVarChar, 'Ho Chi Minh City')
      .query(`
        MERGE dbo.Users WITH (HOLDLOCK) AS target
        USING (SELECT @email AS Email) AS source
        ON target.Email = source.Email
        WHEN MATCHED THEN
          UPDATE SET
            Password = @passwordHash,
            Role = N'admin',
            IsActive = 1,
            UpdatedAt = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (FullName, Email, Password, Phone, Role, Address, IsActive)
          VALUES (@fullName, @email, @passwordHash, @phone, N'admin', @address, 1);

        SELECT UserID, FullName, Email, Role, IsActive
        FROM dbo.Users
        WHERE Email = @email;
      `);

    console.log('Hoan tat! Tai khoan admin demo:');
    console.table(result.recordset);
    console.log('Dang nhap bang: admin@btstore.local / password');
  } catch (err) {
    console.error('Loi:', err.message);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.close();
  }
}

fixPassword();
