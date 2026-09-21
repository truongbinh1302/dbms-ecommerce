const sql = require('./backend-app/node_modules/mssql');
const fs = require('fs');

const config = {
  server: 'localhost',
  port: 1433,
  database: 'ecommerce_dbms',
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

async function runSeed() {
  let pool;
  try {
    console.log('Connecting to ecommerce_dbms...');
    pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log('✓ Connected to database');

    const seedPath = './database/seeds/002_seed_demo_data.sql';
    const seedSQL = fs.readFileSync(seedPath, 'utf-8');

    console.log('Running seed data...');
    const request = pool.request();
    
    const batches = seedSQL.split(/\bGO\b/gi).filter(batch => batch.trim());
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i].trim();
      if (!batch) continue;
      
      try {
        await request.batch(batch);
        console.log(`✓ Batch ${i + 1}/${batches.length} executed`);
      } catch (err) {
        console.error(`✗ Batch ${i + 1} failed:`, err.message);
      }
    }

    console.log('✓ Seed data inserted successfully!');

  } catch (err) {
    console.error('✗ Seed failed:', err);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

runSeed();
