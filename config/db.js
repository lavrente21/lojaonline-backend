// Ligação real à base de dados PostgreSQL.
//
// Substitui o antigo ficheiro data/db.json. O schema completo está em
// migrations/schema.sql — corre `npm run migrate` uma vez para o criar.
//
// Precisa de DATABASE_URL no .env, por exemplo:
//   DATABASE_URL=postgres://utilizador:senha@host:5432/lumina
// (Render, Supabase, Neon e Railway têm todos um plano Postgres gratuito
// que te dá esta connection string pronta a copiar.)

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[db] AVISO: DATABASE_URL não está definida no .env — a ligação à base de dados vai falhar.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // A maioria dos fornecedores gratuitos (Render, Supabase, Neon) exige SSL.
  // Em desenvolvimento local sem SSL, define PGSSL=false no .env.
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('[db] Erro inesperado na ligação à base de dados:', err.message);
});

// Atalho para uma query simples.
function query(texto, parametros) {
  return pool.query(texto, parametros);
}

// Corre uma função dentro de uma transação: se a função lançar um erro,
// faz ROLLBACK automaticamente. Usar sempre que uma operação precisa de
// escrever em mais do que uma tabela de forma atómica (ex: criar um pedido
// com os seus itens, ou importar um produto com as suas imagens).
async function transacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

async function verificarLigacao() {
  const { rows } = await pool.query('SELECT NOW() AS agora');
  return rows[0].agora;
}

module.exports = { pool, query, transacao, verificarLigacao };
