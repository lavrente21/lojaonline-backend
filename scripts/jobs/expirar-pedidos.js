'use strict';
require('dotenv').config();
const crypto=require('crypto');
const {transaction,query,pool}=require('../../config/db');
const {enviarEmail}=require('../../integrations/email');
(async()=>{
 if(!process.env.CRON_SECRET)throw new Error('CRON_SECRET não configurado.');
 const resultado=await transaction(async c=>{
  const ps=(await c.query("SELECT id,numero,cliente_id,cupao_codigo,cliente_email,cliente_nome FROM pedidos WHERE estado='aguarda_pagamento' AND reserva_expira_em IS NOT NULL AND reserva_expira_em<=now() ORDER BY reserva_expira_em LIMIT 100 FOR UPDATE SKIP LOCKED")).rows;
  const notificar=[];
  for(const p of ps){
   const reservas=(await c.query("SELECT produto_id,variante_id,quantidade FROM pedido_stock_reservas WHERE pedido_id=$1 AND estado='reservado' FOR UPDATE",[p.id])).rows;
   for(const x of reservas){if(x.variante_id)await c.query('UPDATE produto_variantes SET stock=stock+$1 WHERE id=$2',[x.quantidade,x.variante_id]);else if(x.produto_id)await c.query('UPDATE produtos SET stock=stock+$1 WHERE id=$2',[x.quantidade,x.produto_id]);}
   await c.query("UPDATE pedido_stock_reservas SET estado='libertado',atualizado_em=now() WHERE pedido_id=$1 AND estado='reservado'",[p.id]);
   await c.query("UPDATE pedidos SET estado='expirado',stock_reservado=false WHERE id=$1",[p.id]);
   await c.query("UPDATE pedido_pagamentos SET estado='falhado' WHERE pedido_id=$1 AND estado='pendente'",[p.id]);
   await c.query("INSERT INTO auditoria(quem_tipo,acao,entidade,entidade_id,depois) VALUES('sistema','pedido_expirado','pedido',$1,$2::jsonb)",[String(p.id),JSON.stringify({estado:'expirado'})]);
   if(p.cupao_codigo)await c.query('UPDATE cupons SET usos_atuais=GREATEST(0,usos_atuais-1) WHERE upper(codigo)=upper($1)',[p.cupao_codigo]);
   notificar.push({id:p.id,numero:p.numero,email:p.cliente_email,nome:p.cliente_nome});
  }
  return notificar;
 });
 let falhasEmail=0;
 for(const p of resultado){if(!p.email)continue;const hash=crypto.createHash('sha256').update(String(p.email).toLowerCase()).digest('hex');try{const r=await enviarEmail({to:p.email,subject:`Encomenda expirada — ${p.numero}`,html:`<p>Olá ${String(p.nome||'').replace(/[&<>"']/g,'')}</p><p>A reserva da encomenda ${p.numero} expirou e o pedido foi cancelado automaticamente. O stock reservado foi libertado. Se ainda desejar comprar, faça uma nova encomenda.</p>`,text:`A encomenda ${p.numero} expirou e foi cancelada. O stock reservado foi libertado.`});if(r.enviado)await query("INSERT INTO emails_enviados(pedido_id,destinatario_hash,tipo,estado,tentativas,enviado_em) VALUES($1,$2,'pedido_expirado','enviado',1,now())",[p.id,hash]);else falhasEmail++;}catch(e){falhasEmail++;await query("INSERT INTO emails_enviados(pedido_id,destinatario_hash,tipo,estado,erro_codigo,tentativas) VALUES($1,$2,'pedido_expirado','erro',$3,1)",[p.id,hash,String(e.code||'EMAIL_FALHOU').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80)]).catch(()=>{});}}
 console.log(JSON.stringify({job:'expirar-pedidos',expirados:resultado.length,falhasEmail}));await pool.end();if(falhasEmail)process.exitCode=1;
})().catch(async e=>{console.error(JSON.stringify({job:'expirar-pedidos',erro:String(e.code||'ERRO')}));try{await pool.end()}catch{}process.exit(1)});
