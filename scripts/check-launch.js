'use strict';
try { require('dotenv').config(); } catch (erro) { if (erro.code !== 'MODULE_NOT_FOUND') throw erro; }
const {validarLancamento}=require('../config/env');
const resultado=validarLancamento(process.env);
async function verificarInfra(){
 const {query,pool}=require('../config/db');
 const erros=[];
 try{
  const mig=await query("SELECT nome FROM lumina_migrations WHERE nome=$1",['2026-10-14-lancamento-transacional.sql']);
  if(!mig.rowCount)erros.push('Migração em falta: 2026-10-14-lancamento-transacional.sql');
  const admin=await query('SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE totp_ativo=true)::int com_2fa FROM admins');
  if(Number(admin.rows[0].total)<1)erros.push('Nenhum administrador inicial encontrado.');
  if(Number(admin.rows[0].com_2fa)<1)erros.push('Nenhum administrador com 2FA ativo.');
  const tables=await query("SELECT to_regclass('public.pedido_stock_reservas') reservas,to_regclass('public.pedido_comprovativos') comprovativos,to_regclass('public.auditoria') auditoria,to_regclass('public.rate_limit_buckets') rate_limits");
  const missing=Object.entries(tables.rows[0]).filter(([,v])=>!v).map(([k])=>k);if(missing.length)erros.push('Tabelas de lançamento em falta: '+missing.join(', '));
 }catch(e){erros.push(`Verificação PostgreSQL falhou (${String(e.code||'ERRO').replace(/[^A-Za-z0-9_-]/g,'')}).`)}
 try{
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  for(const [bucket,esperado,variavel] of [[process.env.SUPABASE_STORAGE_BUCKET,true,'SUPABASE_STORAGE_BUCKET'],[process.env.SUPABASE_COMPROVATIVOS_BUCKET,false,'SUPABASE_COMPROVATIVOS_BUCKET']]){
   const r=await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
   if(!r.ok){erros.push(`Bucket Supabase inacessível ou inexistente: ${variavel}.`);continue;}
   const info=await r.json().catch(()=>({}));if(info.public!==esperado)erros.push(`${variavel}: visibilidade incorreta; esperado ${esperado?'público':'privado'}.`);
  }
 }catch{erros.push('Não foi possível verificar buckets Supabase.');}
 await pool.end();return erros;
}
(async()=>{
 if(!resultado.ok){console.error('CHECK DE LANÇAMENTO: BLOQUEADO. Corrija as variáveis indicadas; nenhum valor foi mostrado.');for(const erro of resultado.erros)console.error('- '+erro);process.exitCode=1;return;}
 if(String(process.env.LUMINA_LEGAL_VALIDADO||'').toLowerCase()!=='true'){console.error('CHECK DE LANÇAMENTO: BLOQUEADO — LUMINA_LEGAL_VALIDADO não está true.');process.exitCode=1;return;}
 try{const base=String(process.env.BACKEND_PUBLIC_URL||'').replace(/\/$/,'');if(!base)throw new Error('BACKEND_PUBLIC_URL em falta');const r=await fetch(base+'/api/publico/empresa',{signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok||d.configurada!==true){console.error('CHECK DE LANÇAMENTO: BLOQUEADO — /publico/empresa não devolve configurada:true.');process.exitCode=1;return;}}catch{console.error('CHECK DE LANÇAMENTO: BLOQUEADO — não foi possível verificar /publico/empresa.');process.exitCode=1;return;}
 let erros;try{erros=await verificarInfra()}catch(e){erros=[`Verificação de infraestrutura falhou (${String(e.code||'ERRO').replace(/[^A-Za-z0-9_-]/g,'')}).`]}
 if(erros.length){console.error('CHECK DE LANÇAMENTO: BLOQUEADO.');for(const erro of erros)console.error('- '+erro);process.exitCode=1;return;}
 console.log('CHECK DE LANÇAMENTO: variáveis, PostgreSQL, migração, administrador com 2FA e buckets Supabase verificados.');
 console.log('Ainda são obrigatórios: compra de teste, verificação Resend/CJ real, teste E2E, auditoria de segurança e revisão legal/fiscal.');
})().catch(e=>{console.error(`CHECK DE LANÇAMENTO: falhou (${String(e.code||'ERRO').replace(/[^A-Za-z0-9_-]/g,'')}).`);process.exit(1)});
