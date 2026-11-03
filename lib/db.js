// Pool de PostgreSQL reutilizado entre invocaciones de la función serverless.
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
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

// La demo se carga sola: la primera vez (base vacía) y cuando quedan pocos eventos por venir,
// para que el portfolio nunca muestre una cartelera vencida. Un advisory lock evita cargas dobles.
let ready;
function ensureSeeded() {
  if (!ready) {
    ready = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock(424242)');
        const { rows: [t] } = await client.query("SELECT to_regclass('public.evento') IS NOT NULL AS existe");
        const proximos = t.existe
          ? Number((await client.query('SELECT COUNT(*) AS n FROM evento WHERE fecha_fin >= CURRENT_DATE')).rows[0].n)
          : 0;
        if (proximos < 4) {
          const { seed } = require('../db/seed');
          const r = await seed(client);
          console.log('Demo cargada:', r);
        }
      } finally {
        await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
        client.release();
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

module.exports = { query, withTransaction, ensureSeeded };
