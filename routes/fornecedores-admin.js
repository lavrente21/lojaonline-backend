'use strict';
const express=require('express');
const {query,transaction}=require('../config/db');
const {exigirAutenticacao,exigirPapel}=require('../middleware/auth');
const router=express.Router();
const admin=exigirAutenticacao('admin');
async function executarEnvio(numeroPedido,fornecedorNome,adminId){
 const numero=String(numeroPedido),fornecedor=String(fornecedorNome).toLowerCase();
 if(!['cj','buckydrop'].includes(fornecedor))throw Object.assign(new Error('Fornecedor não suportado.'),{status:400});
 if(fornecedor==='cj'&&String(process.env.CJ_ENVIO_VALIDADO||'false').toLowerCase()!=='true')throw Object.assign(new Error('Envio à CJ bloqueado até validação do contrato oficial e dos testes de integração.'),{status:409});
 let sub;
 try{
  sub=await transaction(async c=>{
   const p=(await c.query('SELECT * FROM pedidos WHERE numero=$1 FOR UPDATE',[numero])).rows[0];
   if(!p)throw Object.assign(new Error('Pedido não encontrado.'),{status:404});
   const pago=(await c.query("SELECT estado FROM pedido_pagamentos WHERE pedido_id=$1",[p.id])).rows[0];
   if(p.estado!=='pago'&&p.estado!=='em_processamento')throw Object.assign(new Error('Só é possível expedir encomendas com pagamento confirmado.'),{status:409});
   const itens=(await c.query('SELECT pi.*,p.sku_fornecedor,p.id_fornecedor FROM pedido_itens pi LEFT JOIN produtos p ON p.id=pi.produto_id WHERE pi.pedido_id=$1 AND pi.fornecedor=$2 ORDER BY pi.id',[p.id,fornecedor])).rows;
   if(!itens.length)throw Object.assign(new Error('Não existem artigos deste fornecedor neste pedido.'),{status:409});
   if(itens.some(i=>fornecedor==='cj'&&!String(i.id_fornecedor_variante||'').trim()))throw Object.assign(new Error('Falta Variant ID real da CJ num ou mais artigos.'),{status:409});
   const current=(await c.query('SELECT * FROM pedido_fornecedores WHERE pedido_id=$1 AND fornecedor=$2 FOR UPDATE',[p.id,fornecedor])).rows[0];
   if(current?.estado_envio==='enviado'&&current.id_pedido_fornecedor)return {jaEnviado:true,numero:p.numero,fornecedor,idPedidoFornecedor:current.id_pedido_fornecedor};
   if(current?.estado_envio==='enviando')throw Object.assign(new Error('Já existe um envio em curso. Aguarde antes de tentar novamente.'),{status:409});
   if(current)await c.query("UPDATE pedido_fornecedores SET estado_envio='enviando',tentativas_envio=tentativas_envio+1,erro_envio_codigo=NULL,itens_snapshot=$1::jsonb WHERE id=$2",[JSON.stringify(itens.map(i=>({produtoId:i.produto_id,quantidade:i.quantidade,idFornecedorVariante:i.id_fornecedor_variante,skuFornecedor:i.sku_fornecedor,idFornecedor:i.id_fornecedor}))),current.id]);
   else await c.query("INSERT INTO pedido_fornecedores(pedido_id,fornecedor,estado_envio,tentativas_envio,itens_snapshot) VALUES($1,$2,'enviando',1,$3::jsonb)",[p.id,fornecedor,JSON.stringify(itens.map(i=>({produtoId:i.produto_id,quantidade:i.quantidade,idFornecedorVariante:i.id_fornecedor_variante,skuFornecedor:i.sku_fornecedor,idFornecedor:i.id_fornecedor})))]);
   return {pedido:p,itens};
  });
  if(sub.jaEnviado)return {sucesso:true,jaEnviado:true,fornecedor:sub.fornecedor,idPedidoFornecedor:sub.idPedidoFornecedor};
  const p=sub.pedido, itens=sub.itens;
  const moradaEntrega={nome:p.fornecedor_morada_nome||p.cliente_nome,email:p.cliente_email,telefone:p.fornecedor_morada_telefone||p.entrega_telefone,pais:p.fornecedor_morada_pais||p.entrega_pais,provincia:p.fornecedor_morada_provincia||p.entrega_provincia,cidade:p.fornecedor_morada_cidade||p.entrega_cidade,codigoPostal:p.fornecedor_morada_cp||p.entrega_codigo_postal,linha1:p.fornecedor_morada_linha1||p.entrega_linha1};
  if(!moradaEntrega.pais||!moradaEntrega.cidade||!moradaEntrega.linha1||!moradaEntrega.telefone)throw Object.assign(new Error('A morada de expedição está incompleta; não foi enviada ao fornecedor.'),{status:409});
  let criado;
  try{
   if(fornecedor==='cj'){if(!process.env.CJ_FROM_COUNTRY_CODE||!process.env.CJ_LOGISTIC_NAME)throw new Error('CJ_FROM_COUNTRY_CODE e CJ_LOGISTIC_NAME têm de estar configurados.');const cj=require('../integrations/cj-api');for(const i of itens){const stock=await cj.consultarEstoque(i.id_fornecedor_variante);if(Number(stock.stock)<Number(i.quantidade))throw new Error(`Stock CJ insuficiente para o artigo ${i.produto_id}.`);}criado=await cj.criarPedido({pedidoId:`${p.numero}-${fornecedor}`,itens:itens.map(i=>({produtoId:i.produto_id,quantidade:i.quantidade,idFornecedorVariante:i.id_fornecedor_variante})),moradaEntrega,logisticName:process.env.CJ_LOGISTIC_NAME});}
   else {if(!process.env.BUCKYDROP_API_URL||!process.env.BUCKYDROP_APPCODE||!process.env.BUCKYDROP_APPSECRET)throw new Error('BuckyDrop não configurado; envio desativado.');throw new Error('O contrato de criação de encomenda BuckyDrop ainda não foi validado; envio bloqueado para evitar duplicação.');}
   if(!criado?.idPedidoFornecedor)throw new Error('O fornecedor não devolveu um identificador de encomenda verificável.');
   await transaction(async c=>{const r=await c.query("UPDATE pedido_fornecedores SET estado_envio='enviado',id_pedido_fornecedor=$1,enviado_em=now(),estado='processando',erro_envio_codigo=NULL WHERE pedido_id=$2 AND fornecedor=$3 AND estado_envio='enviando' RETURNING id",[String(criado.idPedidoFornecedor),p.id,fornecedor]);if(!r.rowCount)throw new Error('Estado do subpedido mudou durante a criação externa. Requer reconciliação manual.');await c.query("INSERT INTO auditoria(quem_tipo,quem_id,acao,entidade,entidade_id,depois) VALUES('admin',$1,'fornecedor_enviado','pedido',$2,$3::jsonb)",[adminId,String(p.id),JSON.stringify({fornecedor,idPedidoFornecedor:String(criado.idPedidoFornecedor)})]);await c.query("UPDATE pedidos SET estado='em_processamento' WHERE id=$1 AND estado='pago'",[p.id]);});
   return {sucesso:true,fornecedor,idPedidoFornecedor:String(criado.idPedidoFornecedor)};
  }catch(e){await query("UPDATE pedido_fornecedores SET estado_envio='erro_envio',erro_envio_codigo=$1 WHERE pedido_id=$2 AND fornecedor=$3 AND estado_envio='enviando'",[String(e.code||'ENVIO_FALHOU').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80),p.id,fornecedor]).catch(()=>{});throw e;}
 }catch(e){throw e;}
}
router.post('/admin/pedidos/:numero/enviar-fornecedor/:fornecedor',admin,exigirPapel('dono','gestor'),async(req,res,next)=>{
 try{res.json(await executarEnvio(req.params.numero,req.params.fornecedor,req.utilizador.id));}
 catch(e){if(e.status)return res.status(e.status).json({erro:e.message});next(e);}
});
router.post('/admin/pedidos/:numero/sincronizar-tracking',admin,exigirPapel('dono','gestor'),async(req,res,next)=>{try{const p=(await query('SELECT id,numero FROM pedidos WHERE numero=$1',[req.params.numero])).rows[0];if(!p)return res.status(404).json({erro:'Pedido não encontrado.'});const fs=(await query("SELECT * FROM pedido_fornecedores WHERE pedido_id=$1 AND estado_envio='enviado' AND id_pedido_fornecedor IS NOT NULL",[p.id])).rows;const resultados=[];for(const f of fs){if(f.fornecedor==='cj'){try{const t=await require('../integrations/cj-api').consultarRastreio(f.id_pedido_fornecedor);const estado=String(t.estado||'').toLowerCase();const novo=/deliver/.test(estado)?'entregue':/transit|shipped/.test(estado)?'a_caminho':f.estado;await query('UPDATE pedido_fornecedores SET rastreio1=COALESCE($1,rastreio1),estado=$2 WHERE id=$3',[t.codigoRastreio,novo,f.id]);resultados.push({fornecedor:f.fornecedor,atualizado:true,temCodigo:!!t.codigoRastreio});}catch(e){resultados.push({fornecedor:f.fornecedor,atualizado:false,erro:String(e.code||'ERRO_FORNECEDOR')});}}else resultados.push({fornecedor:f.fornecedor,atualizado:false,erro:'TRACKING_NAO_CONFIGURADO'});}res.json({numeroPedido:p.numero,resultados});}catch(e){next(e)}});
router.executarEnvio=executarEnvio;
module.exports=router;
