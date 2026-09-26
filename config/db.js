const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada. Use a connection string do Supabase.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', err => console.error('[DB] erro inesperado no pool:', err));

async function query(text, params) { return pool.query(text, params); }
async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

module.exports = { pool, query, transaction };
