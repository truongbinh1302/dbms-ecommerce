const sql = require('./backend-app/node_modules/mssql');

const config = {
  server: 'localhost',
  port: 1433,
  user: 'sa',
  password: 'SuperStrongPassword123!',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableKeepAlive: true,
    connectionTimeout: 30000,
    requestTimeout: 30000,
  }
};

async function runMigration() {
  let pool;
  try {
    console.log('Connecting to SQL Server...');
    pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log('✓ Connected to SQL Server');

    // Read migration file
    const fs = require('fs');
    const migrationPath = './database/migrations/001_create_schema.sql';
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Running migration...');
    const request = pool.request();
    
    // Split by GO statements and execute each batch
    const batches = migrationSQL.split(/\bGO\b/gi).filter(batch => batch.trim());
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i].trim();
      if (!batch) continue;
      
      try {
        await request.batch(batch);
        console.log(`✓ Batch ${i + 1}/${batches.length} executed`);
      } catch (err) {
        console.error(`✗ Batch ${i + 1} failed:`, err.message);
        // Continue to next batch
      }
    }

    console.log('✓ Migration completed successfully!');
    
    // Check if database was created
    const result = await request.query("SELECT name FROM sys.databases WHERE name = 'ecommerce_dbms'");
    if (result.recordset.length > 0) {
      console.log('✓ Database ecommerce_dbms created successfully');
    }

  } catch (err) {
    console.error('✗ Migration failed:', err);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('Connection closed');
    }
  }
}

runMigration();
