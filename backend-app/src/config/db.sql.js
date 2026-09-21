const sql = require('mssql');
const config = require('./env');

let pool;

const createPool = () => {
  if (!pool) {
    pool = new sql.ConnectionPool(config.sql);
  }
  return pool;
};

const connectSQL = async () => {
  const currentPool = createPool();

  if (currentPool.connected) {
    return currentPool;
  }

  if (currentPool.connecting) {
    return currentPool;
  }

  try {
    await currentPool.connect();
    console.log('SQL Server connected');
    return currentPool;
  } catch (err) {
    console.error('SQL Server connection error:', err.message);
    throw err;
  }
};

const getPool = () => {
  const currentPool = createPool();
  if (!currentPool.connected) {
    throw new Error('SQL Server pool is not connected. Call connectSQL() before using the pool.');
  }
  return currentPool;
};

module.exports = {
  sql,
  connectSQL,
  getPool,
  get pool() {
    return createPool();
  },
};
