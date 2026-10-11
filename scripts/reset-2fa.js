'use strict';
// Uso: npm run reset:2fa -- email@admin.com
// Apaga o segredo 2FA do admin (útil quando TOTP_ENCRYPTION_KEY mudou). Depois refaça o setup 2FA no painel.
try { require('dotenv').config(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const { query, pool } = require('../config/db');
(async () => {
  const email = String(process.argv[2] || process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  if (!email) throw new Error('Indique o e-mail: npm run reset:2fa -- email@admin.com');
  const r = await query("UPDATE admins SET totp_ativo=false,totp_secret_enc=NULL,totp_setup_em=NULL,totp_recuperacao_hashes='{}',token_version=token_version+1 WHERE email=$1 RETURNING email", [email]);
  console.log(r.rowCount ? `2FA reposto para ${email}. Inicie sessão no admin e configure o 2FA de novo (QR novo).` : 'Admin não encontrado: ' + email);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
