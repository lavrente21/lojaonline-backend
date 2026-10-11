const express=require('express');const {transaction,query}=require('../config/db');const {converterEUR,DEFAULT_CURRENCIES}=require('../integrations/cambio');const {tentarAutenticacao}=require('../middleware/auth');const {resolverMoradaParaFornecedor}=require('../integrations/roteamento-envio');const {rateLimitPersistente}=require('../middleware/rate-limit-persistente');const {validarIBAN}=require('../config/env');
const router=express.Router();const ALLOWED=new Set(DEFAULT_CURRENCIES);
async function calcularCupao(codigo,subtotal){if(!codigo)return {codigo:null,desconto:0};const c=(await query(`SELECT * FROM cupons WHERE upper(codigo)=upper($1) AND ativo=true AND (validade_inicio IS NULL OR validade_inicio<=now()) AND (validade_fim IS NULL OR validade_fim>=now()) AND (usos_maximos IS NULL OR usos_atuais<usos_maximos)`,[String(codigo).trim()])).rows[0];if(!c){const e=new Error('Cupão inválido, expirado ou sem utilizações disponíveis.');e.status=400;throw e;}const desconto=Number((c.tipo==='percentagem'?subtotal*Number(c.valor)/100:Number(c.valor)).toFixed(2));return {codigo:c.codigo,desconto:Math.min(subtotal,desconto),id:Number(c.id)};}
async function carregarItens(itens){
  if(!Array.isArray(itens)||!itens.length)throw new Error('Carrinho vazio.');
  const normalizados=itens.map((i,idx)=>{
    const produtoId=Number(i?.produtoId);
    const quantidade=Number(i?.quantidade);
    const idVariante=i?.idVariante==null||i?.idVariante===''?null:Number(i.idVariante);
    if(!Number.isInteger(produtoId)||produtoId<1){const e=new Error(`Item ${idx+1} do carrinho tem um produto inválido.`);e.status=400;throw e;}
    if(!Number.isInteger(quantidade)||quantidade<1){const e=new Error('Quantidade inválida.');e.status=400;throw e;}
    if(idVariante!==null&&(!Number.isInteger(idVariante)||idVariante<1)){const e=new Error(`A variante do produto ${produtoId} é inválida.`);e.status=400;throw e;}
    return {produtoId,quantidade,idVariante};
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
    const vid=variante?.id_fornecedor_variante?String(variante.id_fornecedor_variante).trim():null;
    if(p.fornecedor==='cj'&&(!variante||!vid)){const e=new Error(`O produto ${p.nome} não tem uma variante CJ registada no painel. Contacte a loja.`);e.status=409;throw e;}
    if(p.fornecedor==='cj')produtosCJ.push({vid,quantity:i.quantidade});
    const agora=new Date();
    const promoValida=!!p.promocao_ativa&&Number(p.promocao_preco_eur)>0&&(!p.promocao_inicio||new Date(p.promocao_inicio)<=agora)&&(!p.promocao_fim||new Date(p.promocao_fim)>=agora);
    const precoBase=promoValida?Number(p.promocao_preco_eur):Number(p.preco_venda_eur);
    const preco=precoBase+(variante?Number(variante.preco_extra_eur||0):0);
    if(!Number.isFinite(preco)||preco<=0){const e=new Error(`Preço inválido para ${p.nome}.`);e.status=409;throw e;}
    totalEUR+=preco*i.quantidade;
    resolvidos.push({produtoId:i.produtoId,nomeProduto:p.nome,fornecedor:p.fornecedor,quantidade:i.quantidade,preco,idFornecedor:p.id_fornecedor,skuFornecedor:p.sku_fornecedor,idVariante:variante?Number(variante.id):null,idFornecedorVariante:vid||null});
  }
  return{totalEUR,resolvidos,produtosCJ};
}
router.post('/quote',rateLimitPersistente({nome:'checkout-quote',limite:20,janelaSegundos:900}),async(req,res,next)=>{try{
  const {itens,pais,moeda='EUR',codigoPostal,provincia}=req.body;
  const destino=String(pais||'').trim().toUpperCase();
  if(!Array.isArray(itens)||!itens.length)return res.status(400).json({erro:'Carrinho vazio.'});
  if(!/^[A-Z]{2}$/.test(destino))return res.status(400).json({erro:'Selecione um país válido com código ISO de 2 letras.'});
  if(!ALLOWED.has(String(moeda).toUpperCase()))return res.status(400).json({erro:'Moeda não suportada.'});
  const {totalEUR:subtotal,resolvidos}=await carregarItens(itens);
  let rota;try{rota=resolverMoradaParaFornecedor(destino,{codigoPostal,provincia});}catch(e){const missing=['AGENTE_NOME','AGENTE_LINHA1','AGENTE_CIDADE','AGENTE_PAIS','AGENTE_TELEFONE'].some(k=>!String(process.env[k]||'').trim());if(missing){const x=new Error('Entrega para o seu país em breve. A loja ainda não tem um parceiro de expedição configurado para este destino.');x.status=409;throw x;}e.status=422;throw e;}
  const destinoFornecedor=String(rota.morada.pais||destino).toUpperCase();
  const cupao=await calcularCupao(req.body.cupao,subtotal);
  const grupos={}; for(const i of resolvidos)(grupos[i.fornecedor]??=[]).push(i);
  const providers=[]; const warnings=[];
  const usdToEur=await require('../integrations/cambio').obterTaxaUsdEur().catch(e=>{warnings.push('Câmbio USD/EUR indisponível: '+e.message);return null;});
  for(const [fornecedor,rows] of Object.entries(grupos)){
    try{
      let metodos=[];
      if(fornecedor==='cj'){
        const products=rows.map(i=>({vid:i.idFornecedorVariante,quantity:i.quantidade}));
        if(products.some(x=>!x.vid))throw new Error('Falta Variant ID real da CJ em pelo menos um produto.');
        metodos=await require('../integrations/cj-api').calcularFrete({destino:destinoFornecedor,zip:rota.morada.codigoPostal||codigoPostal,produtos:products});
      } else if(fornecedor==='buckydrop'){
        const products=rows.map(i=>({sku:i.skuFornecedor||i.idFornecedor,quantity:i.quantidade}));
        if(products.some(x=>!x.sku))throw new Error('Falta SKU/ID de fornecedor BuckyDrop.');
        metodos=await require('../integrations/buckydrop-api').calcularFrete({destino:destinoFornecedor,zip:rota.morada.codigoPostal||codigoPostal,produtos:products});
      } else {
        const rates=JSON.parse(process.env.LUMINA_SHIPPING_RATES_JSON||'{}');
        const price=Number(rates[destino]);
        if(!Number.isFinite(price)||price<0)throw new Error(`Não existe tarifa de envio configurada para ${destino}.`);
        metodos=[{nome:'Envio Lúmina',totalEUR:price,prazo:null}];
      }
      if(!metodos.length)throw new Error('O fornecedor não devolveu métodos de envio disponíveis para este destino.');
      providers.push({fornecedor,metodos:metodos.map(m=>({nome:m.nome,totalUSD:m.totalUSD??m.custoUSD??null,totalEUR:m.totalEUR??(usdToEur==null?null:Number(((m.totalUSD??m.custoUSD??0)*usdToEur).toFixed(2))),prazo:m.prazo||null,taxesUSD:m.taxesUSD??null}))});
    }catch(e){warnings.push(`${fornecedor}: ${e.message}`);}
  }
  const shippingReady=providers.length===Object.keys(grupos).length&&providers.every(p=>p.metodos.length>0)&&providers.every(p=>p.metodos.every(m=>Number.isFinite(m.totalEUR)));
  return res.json({pais:destino,moeda:String(moeda).toUpperCase(),disponivel:true,manual:!shippingReady,metodos:shippingReady?providers:[],fornecedores:providers,avisos:warnings,subtotalEUR:Number(subtotal.toFixed(2)),cupao:cupao.codigo,descontoEUR:cupao.desconto,totalProdutosEUR:Number((subtotal-cupao.desconto).toFixed(2)),portesConfirmados:shippingReady,mensagem:shippingReady?'Portes calculados pelos fornecedores. A encomenda continua pendente até confirmação do pagamento.':'Não foi possível calcular todos os portes automaticamente. Não será inventado um valor; a equipa terá de confirmar o envio.'});
}catch(e){if(e.status)return res.status(e.status).json({erro:e.message});next(e)}});
router.post('/validar-cupao',rateLimitPersistente({nome:'checkout-cupao',limite:15,janelaSegundos:900}),async(req,res,next)=>{try{const subtotal=Number(req.body.subtotalEUR);if(!Number.isFinite(subtotal)||subtotal<=0)return res.status(400).json({erro:'Subtotal inválido.'});const cupao=await calcularCupao(req.body.codigo,subtotal);res.json({valido:true,codigo:cupao.codigo,descontoEUR:cupao.desconto,totalEUR:Number((subtotal-cupao.desconto).toFixed(2))});}catch(e){if(e.status)return res.status(e.status).json({erro:e.message});next(e)}});
router.post('/',rateLimitPersistente({nome:'checkout-criar-pedido',limite:10,janelaSegundos:900}),tentarAutenticacao,async(req,res,next)=>{try{
  const {itens,moradaEntrega,moeda='EUR',telefoneCliente,email,nome,cupao,metodoPagamento}=req.body;
  const clienteId=req.utilizador?.tipo==='cliente'?req.utilizador.id:null;
  const currency=String(moeda).toUpperCase();
  if(!ALLOWED.has(currency))return res.status(400).json({erro:'Moeda inválida.'});
  const metodo=String(metodoPagamento||'').trim().toLowerCase();
  const metodoVars={transferencia:['PAGAMENTO_TITULAR','PAGAMENTO_BANCO','PAGAMENTO_IBAN','PAGAMENTO_PRAZO_HORAS'],deposito:['PAGAMENTO_TITULAR','PAGAMENTO_BANCO','PAGAMENTO_PRAZO_HORAS'],multicaixa:['PAGAMENTO_MULTICAIXA_ENTIDADE','PAGAMENTO_MULTICAIXA_TELEFONE','PAGAMENTO_PRAZO_HORAS']};
  const ativos=String(process.env.PAGAMENTO_METODOS_ATIVOS||'').split(',').map(x=>x.trim().toLowerCase());
  const depsPagamento=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_COMPROVATIVOS_BUCKET','RESEND_API_KEY','EMAIL_FROM','EMAIL_REPLY_TO','STORE_ORDER_NOTIFICATION_EMAIL'];
  if(depsPagamento.some(k=>!String(process.env[k]||'').trim()))return res.status(503).json({erro:'O pagamento manual está temporariamente indisponível até a loja concluir a configuração segura de comprovativos e e-mail.'});
  if(!metodoVars[metodo]||!ativos.includes(metodo)||metodoVars[metodo].some(k=>!String(process.env[k]||'').trim())||(metodo==='transferencia'&&!validarIBAN(process.env.PAGAMENTO_IBAN)))return res.status(503).json({erro:'Os métodos de pagamento ainda não estão configurados para este checkout. Contacte a loja mais tarde.'});
  if(!Array.isArray(itens)||!itens.length)return res.status(400).json({erro:'Carrinho vazio.'});
  const nomeCliente=String(nome||'').trim(),emailCliente=String(email||'').trim().toLowerCase();
  if(!nomeCliente||nomeCliente.length>180)return res.status(400).json({erro:'Nome do cliente obrigatório.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCliente)||emailCliente.length>254)return res.status(400).json({erro:'E-mail válido obrigatório.'});
  if(!moradaEntrega?.pais||!/^[A-Za-z]{2}$/.test(String(moradaEntrega.pais))||!moradaEntrega?.linha1||!moradaEntrega?.cidade)return res.status(400).json({erro:'Morada incompleta. País, cidade e morada são obrigatórios.'});
  if(String(moradaEntrega.linha1).length>255||String(moradaEntrega.linha2||'').length>255||String(moradaEntrega.provincia||'').length>120)return res.status(400).json({erro:'Morada ou província demasiado longa.'});
  const {totalEUR:subtotalEUR,resolvidos}=await carregarItens(itens);
  const cupaoValidado=await calcularCupao(cupao,subtotalEUR);
  const descontoEUR=cupaoValidado.desconto;
  const totalEUR=Number((subtotalEUR-descontoEUR).toFixed(2));
  // Sem pagamento e sem agente de carga: portes ainda não são cobrados nem presumidos.
  const freteUSD=0,freteEUR=0,baseTotalEUR=totalEUR;
  const conversao=await converterEUR(baseTotalEUR,currency);
  const morada={...moradaEntrega,nome:nomeCliente,email:emailCliente,telefone:telefoneCliente||moradaEntrega.telefone||''};
  let rotaResolvida;try{rotaResolvida=resolverMoradaParaFornecedor(String(moradaEntrega.pais).toUpperCase(),morada);}catch(e){const missing=['AGENTE_NOME','AGENTE_LINHA1','AGENTE_CIDADE','AGENTE_PAIS','AGENTE_TELEFONE'].some(k=>!String(process.env[k]||'').trim());if(missing){const x=new Error('Entrega para o seu país em breve. A loja ainda não tem um parceiro de expedição configurado para este destino.');x.status=409;throw x;}e.status=422;throw e;}
  const moradaFornecedor=rotaResolvida.morada;
  const linhaFornecedor=[moradaFornecedor.linha1,moradaFornecedor.linha2].filter(Boolean).join(', ');
  const pagamentoImediato=String(process.env.CHECKOUT_PAGAMENTO_IMEDIATO||'true').toLowerCase()!=='false';
  const estadoInicial=pagamentoImediato?'aguarda_pagamento':'aguarda_confirmacao_portes';
  const pedido=await transaction(async c=>{
    const pr=await c.query(`INSERT INTO pedidos(cliente_id,cliente_nome,cliente_email,total_eur,cupao_codigo,desconto_eur,frete_usd,frete_eur,metodo_envio,moeda,cambio_taxa_usada,cambio_valor_eur,cambio_valor_aoa,cambio_data,entrega_linha1,entrega_linha2,entrega_cidade,entrega_provincia,entrega_codigo_postal,entrega_pais,entrega_telefone,rota_envio,fornecedor_morada_nome,fornecedor_morada_linha1,fornecedor_morada_cidade,fornecedor_morada_provincia,fornecedor_morada_cp,fornecedor_morada_pais,fornecedor_morada_telefone,fornecedor_morada_ref,estado) VALUES($1,$2,$3,$4,$5,$6,NULL,NULL,NULL,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *`,
    [clienteId||null,nomeCliente,emailCliente,baseTotalEUR,cupaoValidado.codigo,descontoEUR,currency,conversao.taxa,baseTotalEUR,currency==='AOA'?conversao.valor:null,conversao.data,moradaEntrega.linha1,moradaEntrega.linha2||null,moradaEntrega.cidade,moradaEntrega.provincia||null,moradaEntrega.codigoPostal||null,String(moradaEntrega.pais).toUpperCase(),telefoneCliente||null,rotaResolvida.tipo,moradaFornecedor.nome||nomeCliente,linhaFornecedor,moradaFornecedor.cidade||moradaEntrega.cidade,moradaFornecedor.provincia||moradaEntrega.provincia||null,moradaFornecedor.codigoPostal||moradaEntrega.codigoPostal||null,String(moradaFornecedor.pais||moradaEntrega.pais).toUpperCase(),moradaFornecedor.telefone||telefoneCliente||null,moradaFornecedor.referenciaInterna||null,estadoInicial]);
    const p=pr.rows[0];
    const prazoHoras=Math.max(1,Math.min(168,Number(process.env.PAGAMENTO_PRAZO_HORAS)||48));
    for(const i of resolvidos){
      // O stock é abatido atomicamente como reserva; falha uma linha = rollback do pedido inteiro.
      const stockSql=i.idVariante
        ? 'UPDATE produto_variantes SET stock=stock-$1 WHERE id=$2 AND produto_id=$3 AND stock >= $1 RETURNING id'
        : 'UPDATE produtos SET stock=stock-$1 WHERE id=$2 AND ativo=true AND stock >= $1 RETURNING id';
      const stockArgs=i.idVariante?[i.quantidade,i.idVariante,i.produtoId]:[i.quantidade,i.produtoId];
      const reservado=await c.query(stockSql,stockArgs);
      if(!reservado.rowCount){const e=new Error(`Stock insuficiente para ${i.nomeProduto}; atualize o carrinho.`);e.status=409;throw e;}
      await c.query(`INSERT INTO pedido_stock_reservas(pedido_id,produto_id,variante_id,quantidade) VALUES($1,$2,$3,$4)`,[p.id,i.produtoId,i.idVariante,i.quantidade]);
      await c.query(`INSERT INTO pedido_itens(pedido_id,produto_id,nome_produto,fornecedor,quantidade,variante_id,id_fornecedor_variante,preco_unitario_eur) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[p.id,i.produtoId,i.nomeProduto,i.fornecedor,i.quantidade,i.idVariante,i.idFornecedorVariante,i.preco]);
    }
    const referencia='LUM-'+require('crypto').randomBytes(3).toString('hex').toUpperCase();
    await c.query(`INSERT INTO pedido_pagamentos(pedido_id,metodo,estado,id_cobranca,url_checkout,valor_esperado,moeda,cambio_taxa_travada,referencia_pagamento,prazo_pagamento_em) VALUES($1,$7,'pendente',NULL,NULL,$2,$3,$4,$5,now()+($6 * interval '1 hour'))`,[p.id,conversao.valor,currency,conversao.taxa,referencia,prazoHoras,metodo]);
    await c.query("UPDATE pedidos SET stock_reservado=true,reserva_expira_em=now()+($1 * interval '1 hour'),subtotal_eur=$2,portes_estado=$4 WHERE id=$3",[prazoHoras,subtotalEUR,p.id,pagamentoImediato?'nao_cobrados':'por_confirmar']);
    const gruposFornecedor=[...new Set(resolvidos.map(i=>i.fornecedor).filter(f=>['cj','buckydrop'].includes(f)))];
    for(const f of gruposFornecedor){const linhas=resolvidos.filter(i=>i.fornecedor===f);await c.query(`INSERT INTO pedido_fornecedores(pedido_id,fornecedor,estado,estado_envio,itens_snapshot) VALUES($1,$2,'processando','pendente',$3::jsonb) ON CONFLICT(pedido_id,fornecedor) DO NOTHING`,[p.id,f,JSON.stringify(linhas.map(i=>({produtoId:i.produtoId,quantidade:i.quantidade,idFornecedorVariante:i.idFornecedorVariante,skuFornecedor:i.skuFornecedor||null}))) ]);}
    if(cupaoValidado.id){const cr=await c.query('UPDATE cupons SET usos_atuais=usos_atuais+1 WHERE id=$1 AND ativo=true AND (usos_maximos IS NULL OR usos_atuais<usos_maximos) RETURNING id',[cupaoValidado.id]);if(!cr.rowCount){const e=new Error('O cupão acabou de atingir o limite de utilizações.');e.status=409;throw e;}}
    return p;
  });
  let emailNotificacao={cliente:{enviado:false,razao:'email_nao_configurado'},loja:{enviado:false,razao:'email_nao_configurado'}};
  try{emailNotificacao=await require('../integrations/email').notificarNovaEncomenda({numeroPedido:pedido.numero,nome:nomeCliente,email:emailCliente,totalEUR:baseTotalEUR,moeda:currency});}catch(mailError){console.error('[email] Não foi possível enviar notificação da encomenda:',mailError.message);}
  res.status(201).json({numeroPedido:pedido.numero,subtotalEUR:Number(subtotalEUR.toFixed(2)),descontoEUR,totalEUR:baseTotalEUR,totalMoeda:conversao.valor,moeda:currency,rotaEnvio:rotaResolvida.tipo,pagamento:{metodo,idCobranca:null,urlCheckout:null,estado:'pendente',referenciaPagamento:(await query('SELECT referencia_pagamento FROM pedido_pagamentos WHERE pedido_id=$1',[pedido.id])).rows[0]?.referencia_pagamento||null,mensagem:pagamentoImediato?'Encomenda registada. Faça a transferência com os dados indicados e envie o comprovativo.':'A encomenda foi registada; os portes ainda têm de ser confirmados. Não efetue pagamento até receber o valor final e as instruções.'},emailNotificacao,aviso:pagamentoImediato?'Aguarda pagamento por transferência e aprovação do comprovativo.':'A encomenda ainda não foi paga nem enviada ao fornecedor.'});
}catch(e){if(e.status)return res.status(e.status).json({erro:e.message});next(e)}});
module.exports=router;
