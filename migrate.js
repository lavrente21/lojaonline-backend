require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {Client}=require('pg');
const file=path.join(__dirname,'migrations','schema.sql');
(async()=>{
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false}});
  await client.connect();
  try { await client.query(fs.readFileSync(file,'utf8')); console.log('Migração Lúmina concluída.'); }
  finally { await client.end(); }
})().catch(e=>{console.error(e);process.exit(1)});
