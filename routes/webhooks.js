const express=require('express');const crypto=require('crypto');const {query}=require('../config/db');
const router=express.Router();
// Payment providers remain disabled until real credentials and signed webhook tests are supplied.
router.post('/stripe',(req,res)=>res.status(410).json({erro:'Pagamentos Stripe ainda não estão ativados. Nenhuma encomenda foi marcada como paga.'}));
router.post('/appypay',(req,res)=>res.status(410).json({erro:'Pagamentos AppyPay ainda não estão ativados. Nenhuma encomenda foi marcada como paga.'}));
router.post('/tracking/:fornecedor',async(req,res,next)=>{try{
 const fornecedor=String(req.params.fornecedor||'').toLowerCase();if(!['cj','buckydrop'].includes(fornecedor))return res.status(400).json({erro:'Fornecedor inválido.'});
 const expected=fornecedor==='cj'?process.env.CJ_TRACKING_WEBHOOK_SECRET:process.env.BUCKYDROP_TRACKING_WEBHOOK_SECRET;
 const received=String(req.headers['x-lumina-webhook-secret']||'');if(!expected)return res.status(503).json({erro:'Webhook de tracking não configurado.'});
 const a=Buffer.from(received),b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({erro:'Webhook não autorizado.'});
 const numeroPedido=String(req.body.numeroPedido||'');const codigoRastreio=String(req.body.codigoRastreio||'').slice(0,120);const estado=String(req.body.estado||'').slice(0,30);
 if(!numeroPedido||(!codigoRastreio&&!estado))return res.status(400).json({erro:'Referência da encomenda e rastreio/estado são obrigatórios.'});
 const p=(await query('SELECT id,rota_envio FROM pedidos WHERE numero=$1',[numeroPedido])).rows[0];if(!p)return res.status(404).json({erro:'Pedido não encontrado.'});
 const u=await query(`UPDATE pedido_fornecedores SET rastreio1=COALESCE(NULLIF($1,''),rastreio1),estado=COALESCE(NULLIF($2,''),estado) WHERE pedido_id=$3 AND fornecedor=$4 RETURNING id`,[codigoRastreio,estado,p.id,fornecedor]);
 if(!u.rowCount)return res.status(404).json({erro:'Não existe subpedido deste fornecedor para a encomenda.'});
 res.json({sucesso:true});
 }catch(e){next(e)}});
module.exports=router;
