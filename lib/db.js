// Pool de PostgreSQL reutilizado entre invocaciones de la función serverless.
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      const e = new Error('Falta configurar DATABASE_URL.');
      e.statusCode = 500;
      throw e;
    }
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3, // las funciones serverless corren en instancias chicas
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const { rows } = await getPool().query(sql, params);
  return rows;
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, withTransaction };
