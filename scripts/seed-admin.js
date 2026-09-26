require('dotenv').config();
const bcrypt=require('bcryptjs'); const {query}=require('../config/db');
(async()=>{const nome=process.env.ADMIN_NOME,email=(process.env.ADMIN_EMAIL||'').toLowerCase().trim(),pass=process.env.ADMIN_PASSWORD;
 if(!nome||!email||!pass||pass.length<12) throw new Error('Defina ADMIN_NOME, ADMIN_EMAIL e ADMIN_PASSWORD (>=12 caracteres).');
 const hash=await bcrypt.hash(pass,12); await query(`INSERT INTO admins(nome,email,password_hash,papel) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET nome=EXCLUDED.nome,password_hash=EXCLUDED.password_hash,papel=EXCLUDED.papel`,[nome,email,hash,process.env.ADMIN_PAPEL||'dono']); console.log('Admin criado/atualizado:',email); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
