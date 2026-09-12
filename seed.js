// Corre uma vez para preparar a base de dados com um utilizador admin de teste.
// Uso: node seed.js

const bcrypt = require('bcryptjs');
const { ler, guardar } = require('./config/db');

async function seed() {
  const db = ler();
  const senha = 'admin123';
  db.admins[0].passwordHash = await bcrypt.hash(senha, 10);
  guardar(db);
  console.log('✅ Base de dados preparada.');
  console.log(`   Login admin de teste: ${db.admins[0].email} / senha: ${senha}`);
}

seed();
