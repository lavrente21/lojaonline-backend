// Corre o schema (migrations/schema.sql) contra a base de dados apontada
// por DATABASE_URL. Uso:
//   npm run migrate

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrar() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não está definida no .env — não há a onde aplicar o schema.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
  });

  const caminhoSchema = path.join(__dirname, 'migrations', 'schema.sql');
  const sql = fs.readFileSync(caminhoSchema, 'utf-8');

  console.log('🔧 A aplicar migrations/schema.sql...');
  try {
    await pool.query(sql);
    console.log('✅ Base de dados criada/atualizada com sucesso.');
  } catch (erro) {
    console.error('❌ Erro ao aplicar o schema:', erro.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrar();
