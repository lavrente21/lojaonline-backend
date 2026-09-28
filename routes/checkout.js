const express=require('express');const {transaction,query}=require('../config/db');const {converterEUR,travarCambioParaPedido,obterTaxaUsdEur,DEFAULT_CURRENCIES}=require('../integrations/cambio');const {resolverMoradaParaFornecedor}=require('../integrations/roteamento-envio');const {tentarAutenticacao}=require('../middleware/auth');const {criarSessaoStripe}=require('../integrations/pagamentos-eur');const {criarCobranca}=require('../integrations/appypay');const cj=require('../integrations/cj-api');
const router=express.Router();const ALLOWED=new Set(DEFAULT_CURRENCIES);
async function carregarItens(itens){
  if(!Array.isArray(itens)||!itens.length)throw new Error('Carrinho vazio.');
  const normalizados=itens.map((i,idx)=>{
    const produtoId=Number(i?.produtoId);
    const quantidade=Number(i?.quantidade);
    const idVariante=i?.idVariante==null||i?.idVariante===''?null:Number(i.idVariante);
    if(!Number.isInteger(produtoId)||produtoId<1){const e=new Error(`Item ${idx+1} do carrinho tem um produto inválido.`);e.status=400;throw e;}
    if(!Number.isInteger(quantidade)||quantidade<1){const e=new Error('Quantidade inválida.');e.status=400;throw e;}
    if(idVariante!==null&&(!Number.isInteger(idVariante)||idVariante<1)){const e=new Error(`A variante do produto ${produtoId} é inválida.`);e.status=400;throw e;}
    return {...i,produtoId,quantidade,idVariante};
  });
  const ids=[...new Set(normalizados.map(i=>i.produtoId))];
  const r=await query(`SELECT p.*,c.nome categoria_nome,(SELECT COUNT(*) FROM produto_variantes v WHERE v.produto_id=p.id)::int qtd_variantes,(SELECT COALESCE(SUM(v.stock),0) FROM produto_variantes v WHERE v.produto_id=p.id)::int stock_variantes FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.id=ANY($1::bigint[]) AND p.ativo=true`,[ids]);
  if(r.rowCount!==ids.length){const e=new Error('Um ou mais produtos não estão disponíveis.');e.status=409;throw e;}
  const by=new Map(r.rows.map(p=>[Number(p.id),p]));
  let totalEUR=0,resolvidos=[],produtosCJ=[];
  for(const i of normalizados){
    const p=by.get(i.produtoId);
    let variante=null;
    if(Number(p.qtd_variantes)>0){
      if(i.idVariante===null){const e=new Error(`Escolha uma variante para ${p.nome}.`);e.status=400;throw e;}
      variante=(await query('SELECT * FROM produto_variantes WHERE id=$1 AND produto_id=$2',[i.idVariante,p.id])).rows[0];
      if(!variante){const e=new Error(`A variante selecionada de ${p.nome} já não está disponível.`);e.status=409;throw e;}
      if(Number(variante.stock)<i.quantidade){const e=new Error(`Stock insuficiente para ${p.nome} — ${variante.valor_opcao}.`);e.status=409;throw e;}
    }else if(Number(p.stock)<i.quantidade){
      const e=new Error(`Stock insuficiente para ${p.nome}.`);e.status=409;throw e;
    }
    let vid=i.idFornecedorVariante?String(i.idFornecedorVariante).trim():null;
    if(p.fornecedor==='cj'&&variante){vid=variante.id_fornecedor_variante?String(variante.id_fornecedor_variante).trim():vid;}
    if(p.fornecedor==='cj'&&!vid){const e=new Error(`A variante de ${p.nome} não tem Variant ID real da CJ.`);e.status=409;throw e;}
    if(p.fornecedor==='cj')produtosCJ.push({vid,quantity:i.quantidade});
    const agora=new Date();
    const promoValida=!!p.promocao_ativa&&Number(p.promocao_preco_eur)>0&&(!p.promocao_inicio||new Date(p.promocao_inicio)<=agora)&&(!p.promocao_fim||new Date(p.promocao_fim)>=agora);
    const precoBase=promoValida?Number(p.promocao_preco_eur):Number(p.preco_venda_eur);
    const preco=precoBase+(variante?Number(variante.preco_extra_eur||0):0);
    if(!Number.isFinite(preco)||preco<0){const e=new Error(`Preço inválido para ${p.nome}.`);e.status=409;throw e;}
    totalEUR+=preco*i.quantidade;
    resolvidos.push({produtoId:i.produtoId,nomeProduto:p.nome,fornecedor:p.fornecedor,quantidade:i.quantidade,preco,idFornecedor:p.id_fornecedor,skuFornecedor:p.sku_fornecedor,idVariante:variante?Number(variante.id):null,idFornecedorVariante:vid||null});
  }
  return{totalEUR,resolvidos,produtosCJ};
}
router.post('/quote',async(req,res,next)=>{try{const {itens,pais,zip,moeda='EUR'}=req.body;if(!Array.isArray(itens)||!itens.length)return res.status(400).json({erro:'Carrinho vazio.'});if(!ALLOWED.has(String(moeda).toUpperCase()))return res.status(400).json({erro:'Moeda não suportada.'});if(String(pais).toUpperCase()==='AO')return res.json({pais,moeda,disponivel:false,metodos:[],mensagem:'Entrega para Angola requer o agente de carga configurado pela Lúmina.'});const {produtosCJ}=await carregarItens(itens);let methods=[];if(produtosCJ.length)methods=await cj.calcularFrete({destino:String(pais).toUpperCase(),zip,produtos:produtosCJ});const fx=await require('../integrations/cambio').obterTaxasEUR([String(moeda).toUpperCase(),'USD']);const usdPerEur=Number(fx.rates.USD),targetPerEur=Number(fx.rates[String(moeda).toUpperCase()]);res.json({pais,moeda,disponivel:methods.length>0,metodos:methods.map(m=>{const custoUSD=Number(m.custoUSD||0);const custoEUR=custoUSD/usdPerEur;return{...m,custoUSD,custoEUR:Number(custoEUR.toFixed(2)),custoMoeda:Number((custoEUR*targetPerEur).toFixed(2)),moeda};})});}catch(e){if(e.status)return res.status(e.status).json({erro:e.message});next(e)}});
router.post('/',tentarAutenticacao,async(req,res,next)=>{try{const {itens,moradaEntrega,moeda='EUR',telefoneCliente,email,nome,metodoEnvio}=req.body;const clienteId=req.utilizador?.tipo==='cliente'?req.utilizador.id:null;const currency=String(moeda).toUpperCase();if(!ALLOWED.has(currency))return res.status(400).json({erro:'Moeda inválida.'});if(!Array.isArray(itens)||!itens.length)return res.status(400).json({erro:'Carrinho vazio.'});if(!moradaEntrega?.pais||!moradaEntrega?.linha1||!moradaEntrega?.cidade)return res.status(400).json({erro:'Morada incompleta.'});const {totalEUR,resolvidos,produtosCJ}=await carregarItens(itens);if(String(moradaEntrega.pais).toUpperCase()==='AO')return res.status(409).json({erro:'O checkout de Angola só pode ser ativado depois de configurar o agente de carga real da Lúmina.'});let freteUSD=0;let freteEUR=0;if(produtosCJ.length){if(!metodoEnvio)return res.status(400).json({erro:'Escolha um método de envio.'});const methods=await cj.calcularFrete({destino:moradaEntrega.pais,zip:moradaEntrega.codigoPostal,produtos:produtosCJ});const chosen=methods.find(m=>String(m.nome)===String(metodoEnvio));if(!chosen)return res.status(409).json({erro:'O método de envio selecionado já não está disponível. Recalcule o frete.'});freteUSD=Number(chosen.custoUSD||0);const usdPerEur=Number((await require('../integrations/cambio').obterTaxasEUR(['USD'])).rates.USD);freteEUR=freteUSD/usdPerEur;}const baseTotalEUR=Number((totalEUR+freteEUR).toFixed(2));const conversao=await converterEUR(baseTotalEUR,currency);const rota=resolverMoradaParaFornecedor(moradaEntrega.pais,{...moradaEntrega,nome,email,telefone:telefoneCliente});const pedido=await transaction(async c=>{const pr=await c.query(`INSERT INTO pedidos(cliente_id,total_eur,frete_usd,frete_eur,metodo_envio,moeda,cambio_taxa_usada,cambio_valor_eur,cambio_valor_aoa,cambio_data,entrega_linha1,entrega_linha2,entrega_cidade,entrega_codigo_postal,entrega_pais,entrega_telefone,rota_envio,fornecedor_morada_nome,fornecedor_morada_linha1,fornecedor_morada_cidade,fornecedor_morada_cp,fornecedor_morada_pais,fornecedor_morada_telefone,fornecedor_morada_ref,estado) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'novo') RETURNING *`,[clienteId||null,baseTotalEUR,freteUSD||null,freteEUR||null,metodoEnvio||null,currency,conversao.taxa,baseTotalEUR,currency==='AOA'?conversao.valor:null,conversao.data,moradaEntrega.linha1,moradaEntrega.linha2||null,moradaEntrega.cidade,moradaEntrega.codigoPostal||null,moradaEntrega.pais,telefoneCliente||null,rota.tipo,rota.morada.nome,rota.morada.linha1,rota.morada.cidade,rota.morada.codigoPostal,rota.morada.pais,rota.morada.telefone,rota.morada.referenciaInterna||null]);const p=pr.rows[0];for(const i of resolvidos)await c.query(`INSERT INTO pedido_itens(pedido_id,produto_id,nome_produto,fornecedor,quantidade,variante_id,id_fornecedor_variante,preco_unitario_eur) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[p.id,i.produtoId,i.nomeProduto,i.fornecedor,i.quantidade,i.idVariante,i.idFornecedorVariante,i.preco]);return p});if(currency==='AOA'&&!telefoneCliente)return res.status(400).json({erro:'Telefone obrigatório para pagamento em AOA.'});
const gatewayLigado=currency==='AOA'?!!(process.env.APPYPAY_ACCESS_TOKEN&&process.env.APPYPAY_PAYMENT_METHOD):!!process.env.STRIPE_SECRET_KEY;
let pagamento,metodoPagamento;
if(!gatewayLigado){
 // Gateway de pagamento ainda não configurado: o pedido é criado na mesma, fica 'pendente'
 // e a equipa da Lúmina confirma o pagamento manualmente (transferência/Multicaixa/numerário) em /admin/pagamentos.
 metodoPagamento='manual';
 pagamento={idCobranca:null,urlCheckout:null,mensagem:currency==='AOA'?'A nossa equipa vai contactá-lo pelo telefone indicado para combinar o pagamento (Multicaixa Express / transferência).':'A nossa equipa vai contactá-lo por e-mail para combinar o pagamento.'};
}else{
 try{
  metodoPagamento=currency==='AOA'?'appypay':'stripe';
  pagamento=currency==='AOA'?await criarCobranca({pedidoId:pedido.numero,valorAOA:conversao.valor,telefoneCliente}):await criarSessaoStripe({pedidoId:pedido.numero,valor:conversao.valor,moeda:currency,email});
 }catch(e){
  // Gateway configurado mas indisponível/erro momentâneo: não perde a encomenda, cai para pendente manual.
  console.error('[checkout] gateway de pagamento falhou, a usar pagamento manual pendente:',e.message);
  metodoPagamento='manual';
  pagamento={idCobranca:null,urlCheckout:null,mensagem:'Não foi possível abrir o pagamento automático neste momento. A nossa equipa vai contactá-lo para confirmar o pagamento.'};
 }
}
await query(`INSERT INTO pedido_pagamentos(pedido_id,metodo,estado,id_cobranca,url_checkout) VALUES($1,$2,'pendente',$3,$4)`,[pedido.id,metodoPagamento,pagamento.idCobranca||null,pagamento.urlCheckout||null]);
res.status(201).json({numeroPedido:pedido.numero,totalEUR:baseTotalEUR,totalMoeda:conversao.valor,moeda:currency,taxaCambio:conversao.taxa,rotaEnvio:rota.tipo,pagamento:{metodo:metodoPagamento,idCobranca:pagamento.idCobranca||null,urlCheckout:pagamento.urlCheckout||null,estado:'pendente',mensagem:pagamento.mensagem||null}});
}catch(e){if(e.status)return res.status(e.status).json({erro:e.message});next(e)}});
module.exports=router;
