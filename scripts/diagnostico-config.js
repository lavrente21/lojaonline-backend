'use strict';
// Diagnóstico de pagamento (transferência) e 2FA. Não mostra valores, só nomes e estado.
try { require('dotenv').config(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const crypto = require('crypto');
const { validarIBAN } = require('../config/env');
const totp = require('../services/totp');

const vazias = k => !String(process.env[k] || '').trim();
const out = [];
const ok = m => out.push('  OK    ' + m);
const mau = m => out.push('  FALTA ' + m);

out.push('\n[PAGAMENTO POR TRANSFERÊNCIA]');
const deps = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_COMPROVATIVOS_BUCKET'];
for (const k of deps) vazias(k) ? mau(k + ' (sem ela a loja esconde TODOS os métodos de pagamento)') : ok(k);
const metodos = String(process.env.PAGAMENTO_METODOS_ATIVOS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
metodos.includes('transferencia') ? ok('PAGAMENTO_METODOS_ATIVOS contém "transferencia"') : mau('PAGAMENTO_METODOS_ATIVOS deve conter: transferencia');
for (const k of ['PAGAMENTO_TITULAR','PAGAMENTO_BANCO','PAGAMENTO_IBAN','PAGAMENTO_PRAZO_HORAS']) vazias(k) ? mau(k) : ok(k);
if (!vazias('PAGAMENTO_IBAN')) validarIBAN(process.env.PAGAMENTO_IBAN) ? ok('PAGAMENTO_IBAN válido (checksum)') : mau('PAGAMENTO_IBAN inválido (checksum falha — confirme o IBAN AO06...)');

out.push('\n[2FA ADMIN]');
let chaveOk = false;
if (vazias('TOTP_ENCRYPTION_KEY')) mau('TOTP_ENCRYPTION_KEY está vazia/não definida neste ambiente');
else if (Buffer.byteLength(process.env.TOTP_ENCRYPTION_KEY) < 32) mau('TOTP_ENCRYPTION_KEY tem menos de 32 bytes');
else { ok('TOTP_ENCRYPTION_KEY definida (≥32 bytes)'); chaveOk = true; }

(async () => {
  if (chaveOk && !vazias('DATABASE_URL')) {
    const { query, pool } = require('../config/db');
    try {
      const r = await query('SELECT email,totp_ativo,totp_secret_enc FROM admins');
      for (const a of r.rows) {
        if (!a.totp_secret_enc) { out.push(`  INFO  ${a.email}: sem segredo 2FA guardado (precisa de setup)`); continue; }
        try { totp.decifrar(a.totp_secret_enc); ok(`${a.email}: segredo 2FA decifra com a chave atual`); }
        catch { mau(`${a.email}: segredo 2FA NÃO decifra → a TOTP_ENCRYPTION_KEY atual é diferente da usada no setup. Reponha a chave antiga OU corra: npm run reset:2fa -- ${a.email}`); }
      }
    } catch (e) { mau('Falha ao ler admins na base de dados (' + String(e.code || e.message).slice(0, 60) + ')'); }
    await pool.end();
  }
  console.log(out.join('\n') + '\n');
})();
