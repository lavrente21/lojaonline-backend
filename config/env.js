'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarIBAN(valor) {
  const iban = String(valor || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranjado = iban.slice(4) + iban.slice(0, 4);
  let expandido = '';
  for (const ch of rearranjado) {
    expandido += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  }
  let resto = 0;
  for (const ch of expandido) resto = (resto * 10 + Number(ch)) % 97;
  return resto === 1;
}

function validarJsonTarifas(valor) {
  if (!valor) return true;
  let dados;
  try { dados = JSON.parse(valor); } catch { return false; }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return false;
  return Object.entries(dados).every(([pais, tarifa]) =>
    /^[A-Z]{2}$/.test(pais) && Number.isFinite(Number(tarifa)) && Number(tarifa) >= 0
  );
}

function variaveisEmFalta(env = process.env) {
  const obrigatorias = [
    'NODE_ENV', 'DATABASE_URL', 'DATABASE_SSL', 'JWT_SECRET', 'TOTP_ENCRYPTION_KEY', 'CRON_SECRET',
    'ORIGENS_PERMITIDAS', 'FRONTEND_URL', 'ADMIN_URL', 'BACKEND_PUBLIC_URL',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET',
    'SUPABASE_COMPROVATIVOS_BUCKET'
  ];
  return obrigatorias.filter(k => !String(env[k] || '').trim());
}

function validarAmbiente(env = process.env, opcoes = {}) {
  const lancamento = opcoes.lancamento === true;
  const erros = [];
  const faltas = variaveisEmFalta(env);
  if (faltas.length) erros.push(...faltas.map(k => `Variável obrigatória em falta: ${k}`));
  if (String(env.JWT_SECRET || '').length < 64) erros.push('JWT_SECRET: mínimo de 64 caracteres.');
  if (env.TOTP_ENCRYPTION_KEY && Buffer.byteLength(String(env.TOTP_ENCRYPTION_KEY), 'utf8') < 32) erros.push('TOTP_ENCRYPTION_KEY: mínimo de 32 bytes.');
  if (String(env.CRON_SECRET || '').length < 32) erros.push('CRON_SECRET: mínimo de 32 caracteres.');
  for (const k of ['SUPABASE_URL', 'FRONTEND_URL', 'ADMIN_URL', 'BACKEND_PUBLIC_URL']) {
    if (env[k]) {
      try { const u = new URL(env[k]); if (!['http:', 'https:'].includes(u.protocol)) throw new Error(); }
      catch { erros.push(`${k}: URL inválida.`); }
    }
  }
  if (lancamento && env.TOTP_ENCRYPTION_KEY && Buffer.byteLength(String(env.TOTP_ENCRYPTION_KEY), 'utf8') < 32) erros.push('TOTP_ENCRYPTION_KEY: mínimo de 32 bytes.');
  if (lancamento && env.ADMIN_PASSWORD && String(env.ADMIN_PASSWORD).length < 12) erros.push('ADMIN_PASSWORD: mínimo de 12 caracteres.');
  if (lancamento && env.EMPRESA_EMAIL && !EMAIL_RE.test(env.EMPRESA_EMAIL)) erros.push('EMPRESA_EMAIL: formato inválido.');
  for (const k of ['EMAIL_FROM', 'EMAIL_REPLY_TO', 'STORE_ORDER_NOTIFICATION_EMAIL']) {
    if (lancamento && env[k] && !EMAIL_RE.test(env[k])) erros.push(`${k}: formato de e-mail inválido.`);
  }
  if (lancamento && env.PAGAMENTO_IBAN && !validarIBAN(env.PAGAMENTO_IBAN)) erros.push('PAGAMENTO_IBAN: formato/checksum inválido.');
  if (lancamento && env.LUMINA_SHIPPING_RATES_JSON && !validarJsonTarifas(env.LUMINA_SHIPPING_RATES_JSON)) erros.push('LUMINA_SHIPPING_RATES_JSON: JSON inválido; use códigos ISO e tarifas não negativas.');
  if (lancamento && env.ENVIO_AUTOMATICO_FORNECEDOR && !['true', 'false'].includes(env.ENVIO_AUTOMATICO_FORNECEDOR)) {
    erros.push('ENVIO_AUTOMATICO_FORNECEDOR: use true ou false.');
  }
  const paisesDiretos = String(env.PAISES_COM_ENVIO_DIRETO || 'PT,ES,FR,DE,IT,NL,BE,AT,IE,SE,DK,FI,PL,CZ,RO,GB,US,CA,MX,BR,CL,AR,CO').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
  if (lancamento && paisesDiretos.length && !paisesDiretos.includes('AO')) {
    const varsAgente = ['AGENTE_NOME', 'AGENTE_LINHA1', 'AGENTE_CIDADE', 'AGENTE_PAIS', 'AGENTE_TELEFONE'];
    const faltamAgente = varsAgente.filter(k => !String(env[k] || '').trim());
    if (faltamAgente.length) erros.push(`Agente de carga obrigatório para destinos sem envio direto: ${faltamAgente.join(', ')}.`);
  }
  const metodos = String(env.PAGAMENTO_METODOS_ATIVOS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (lancamento && !metodos.length) erros.push('PAGAMENTO_METODOS_ATIVOS: ative pelo menos um método manual com dados reais completos.');
  const validos = new Set(['transferencia', 'multicaixa', 'deposito']);
  for (const metodo of metodos) if (lancamento && !validos.has(metodo)) erros.push('PAGAMENTO_METODOS_ATIVOS: contém método desconhecido.');
  if (lancamento && metodos.includes('transferencia') && (!env.PAGAMENTO_TITULAR || !env.PAGAMENTO_BANCO || !env.PAGAMENTO_IBAN || !validarIBAN(env.PAGAMENTO_IBAN))) {
    erros.push('Pagamento por transferência desativado: verificar PAGAMENTO_TITULAR, PAGAMENTO_BANCO e PAGAMENTO_IBAN.');
  }
  if (lancamento && metodos.includes('deposito') && (!env.PAGAMENTO_TITULAR || !env.PAGAMENTO_BANCO)) {
    erros.push('Pagamento por depósito desativado: verificar PAGAMENTO_TITULAR e PAGAMENTO_BANCO.');
  }
  if (lancamento && metodos.includes('multicaixa') && (!env.PAGAMENTO_MULTICAIXA_ENTIDADE || !env.PAGAMENTO_MULTICAIXA_TELEFONE)) {
    erros.push('Pagamento Multicaixa desativado: verificar PAGAMENTO_MULTICAIXA_ENTIDADE e PAGAMENTO_MULTICAIXA_TELEFONE.');
  }
  if (lancamento && metodos.length && (!env.PAGAMENTO_PRAZO_HORAS || !Number.isInteger(Number(env.PAGAMENTO_PRAZO_HORAS)) || Number(env.PAGAMENTO_PRAZO_HORAS) < 1)) {
    erros.push('PAGAMENTO_PRAZO_HORAS: defina um inteiro positivo ao ativar pagamentos.');
  }
  return { ok: erros.length === 0, erros };
}

function validarLancamento(env = process.env) {
 const base=validarAmbiente(env,{lancamento:true});
 const required=['RESEND_API_KEY','EMAIL_FROM','EMAIL_REPLY_TO','STORE_ORDER_NOTIFICATION_EMAIL','PAGAMENTO_METODOS_ATIVOS','PAGAMENTO_PRAZO_HORAS','CJ_API_KEY','CJ_FROM_COUNTRY_CODE','CJ_LOGISTIC_NAME','PAISES_COM_ENVIO_DIRETO','EMPRESA_DENOMINACAO','EMPRESA_NIF','EMPRESA_MORADA','EMPRESA_EMAIL','EMPRESA_TELEFONE','EMPRESA_REPRESENTANTE','EMPRESA_HORARIO','EMPRESA_LIVRO_RECLAMACOES','EMPRESA_IVA'];
 const extra=required.filter(k=>!String(env[k]||'').trim()).map(k=>`Variável obrigatória para lançamento em falta: ${k}`);
 if(String(env.LUMINA_LEGAL_VALIDADO||'').toLowerCase()!=='true')extra.push('LUMINA_LEGAL_VALIDADO tem de ser true após validação jurídica e contabilística do titular.');
 return {ok:base.ok&&extra.length===0,erros:[...base.erros,...extra]};
}
module.exports = { validarIBAN, validarJsonTarifas, variaveisEmFalta, validarAmbiente, validarLancamento };
