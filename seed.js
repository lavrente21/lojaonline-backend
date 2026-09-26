// Cria (ou atualiza a senha de) um utilizador admin de teste na base de dados real.
// Corre depois de `npm run migrate`. Uso: node seed.js

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');

async function seed() {
  const nome = 'Ana Ribeiro';
  const email = 'ana@lumina-beauty.com';
  const senha = 'admin123'; // TROCAR depois do primeiro login em produção
  const passwordHash = await bcrypt.hash(senha, 10);

  await pool.query(
    `INSERT INTO admins (nome, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [nome, email, passwordHash]
  );

  console.log('✅ Admin de teste pronto.');
  console.log(`   Login: ${email} / senha: ${senha}`);
  await pool.end();
}

seed().catch((erro) => {
  console.error('❌ Erro ao criar o admin de teste:', erro.message);
  process.exit(1);
});
