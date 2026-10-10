require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {Client}=require('pg');
const dir=path.join(__dirname,'migrations');
const selected=process.env.MIGRATION_FILE||null;
(async()=>{
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL não configurada.');
 const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:(process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true,...(process.env.DATABASE_SSL_CA?{ca:process.env.DATABASE_SSL_CA.replace(/\\n/g,'\n')}:{})}:{rejectUnauthorized:false})});
 await client.connect();
 try{
  await client.query('SELECT pg_advisory_lock(7319042026)');
  await client.query('CREATE TABLE IF NOT EXISTS lumina_migrations (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())');
  const hasBase=await client.query("SELECT to_regclass('public.categorias') AS existe");
  const files=selected?[selected]:fs.readdirSync(dir).filter(f=>f.endsWith('.sql')&&f!=='schema.sql').sort();
  if(!selected&&!hasBase.rows[0].existe){
   const schema=fs.readFileSync(path.join(dir,'schema.sql'),'utf8');
   await client.query(schema);
   await client.query('INSERT INTO lumina_migrations(nome) VALUES($1) ON CONFLICT DO NOTHING',['schema.sql']);
  }else if(!selected&&hasBase.rows[0].existe){
   // Existing installs skip the baseline schema and apply only incremental, idempotent migrations.
   console.log('Base de dados existente detetada; schema.sql não será repetido.');
  }
  for(const nome of files){
   const check=await client.query('SELECT 1 FROM lumina_migrations WHERE nome=$1',[nome]);
   if(check.rowCount){console.log(`Já aplicada: ${nome}`);continue;}
   const sql=fs.readFileSync(path.join(dir,nome),'utf8').replace(/^\s*BEGIN;\s*/i,'').replace(/\s*COMMIT;\s*$/i,'');
   await client.query('BEGIN');
   try{await client.query(sql);await client.query('INSERT INTO lumina_migrations(nome) VALUES($1) ON CONFLICT DO NOTHING',[nome]);await client.query('COMMIT');console.log(`Aplicada: ${nome}`)}
   catch(e){await client.query('ROLLBACK');throw e;}
  }
  if(!selected){
   const required=await client.query(`SELECT to_regclass('public.pedidos') pedidos,to_regclass('public.kits') kits,to_regclass('public.kit_itens') kit_itens,to_regclass('public.assinaturas') assinaturas,to_regclass('public.pedido_fornecedores') pedido_fornecedores`);
   const row=required.rows[0]; const missing=Object.entries(row).filter(([,v])=>!v).map(([k])=>k);
   if(missing.length)throw new Error('Validação pós-migração falhou; tabelas em falta: '+missing.join(', '));
   const cols=await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pedidos' AND column_name IN ('entrega_provincia','portes_confirmados')`);
   if(cols.rowCount!==2)throw new Error('Validação pós-migração falhou: faltam colunas de morada/portes em pedidos.');
  }
  console.log('Migrações concluídas e esquema verificado.');
 }finally{try{await client.query('SELECT pg_advisory_unlock(7319042026)')}catch{} await client.end()}
})().catch(e=>{console.error(e);process.exit(1)});
