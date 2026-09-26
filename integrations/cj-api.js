const BASE='https://developers.cjdropshipping.com/api2.0/v1'; let tokenCache=null;
async function getToken(){
 if(tokenCache?.expires>Date.now()+86400000)return tokenCache.value;
 if(!process.env.CJ_API_KEY) throw new Error('CJ_API_KEY não configurada.');
 const r=await fetch(`${BASE}/authentication/getAccessToken`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:process.env.CJ_API_KEY})});
 const d=await r.json(); if(!r.ok||!d.result) throw new Error(d.message||'Falha na autenticação CJ.');
 tokenCache={value:d.data.accessToken,expires:Date.now()+Math.min(170,Number(process.env.CJ_TOKEN_CACHE_DAYS||170))*86400000}; return tokenCache.value;
}
async function req(path,opts={}){const t=await getToken(); const r=await fetch(BASE+path,{...opts,headers:{'CJ-Access-Token':t,'Content-Type':'application/json',...(opts.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok||d.result===false) throw new Error(d.message||`CJ respondeu ${r.status}.`); return d;}
async function criarPedido({pedidoId,itens,moradaEntrega,logisticName}){
 const body={orderNumber:String(pedidoId),shippingZip:moradaEntrega.codigoPostal||'',shippingCountryCode:moradaEntrega.pais,shippingCountry:moradaEntrega.pais,shippingProvince:moradaEntrega.provincia||'',shippingCity:moradaEntrega.cidade,shippingAddress:moradaEntrega.linha1,shippingCustomerName:moradaEntrega.nome||'Cliente Lúmina',email:moradaEntrega.email||'',shippingPhone:moradaEntrega.telefone||'',payType:3,logisticName:logisticName||process.env.CJ_LOGISTIC_NAME||undefined,fromCountryCode:process.env.CJ_FROM_COUNTRY_CODE||'CN',platform:'Api',shopLogisticsType:2,orderFlow:1,products:itens.map(i=>({vid:i.idFornecedorVariante||i.skuFornecedor||i.idFornecedor,quantity:i.quantidade,storeLineItemId:String(i.produtoId)}))};
 const d=await req('/shopping/order/createOrderV3',{method:'POST',body:JSON.stringify(body)}); const data=d.data||{}; return {idPedidoFornecedor:data.orderId||data.cjOrderId||data.orderNum,prazoEstimadoDias:null,dados:data};
}
function extrairIdProduto(valor){
 const v=String(valor||'').trim();
 if(!v) throw new Error('ID ou URL do produto CJ obrigatório.');
 try{ const u=new URL(v); const m=u.pathname.match(/-p-([^/?#]+?)(?:\.html)?$/i); if(m) return decodeURIComponent(m[1]); }catch{}
 const m=v.match(/(?:^|[-_])p-([A-Za-z0-9-]{20,})(?:\.html)?$/i);
 return m?m[1]:v.replace(/^pid[:=]/i,'').trim();
}
function parsePreco(v){const n=Number(v);return Number.isFinite(n)?n:null;}
async function consultarProduto(idOuLink){
 const id=extrairIdProduto(idOuLink);
 const d=await req(`/product/query?pid=${encodeURIComponent(id)}&features=enable_combine`);
 const x=d.data||{};
 if(!x.pid) throw new Error('A CJ não encontrou esse produto. Confirma o Product ID ou o link.');
 const variants=Array.isArray(x.variants)?x.variants:[];
 const imagens=[x.bigImage,...(Array.isArray(x.productImageSet)?x.productImageSet:[])].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
 const stock=variants.reduce((total,v)=>total+((v.inventories||[]).reduce((s,w)=>s+Number(w.totalInventory||0),0)),0);
 return {
  nome:x.productNameEn||x.productName||'', descricao:x.description||'', idFornecedor:x.pid, skuFornecedor:x.productSku||null,
  precoCustoUSD:parsePreco(x.sellPrice), precoVendaSugeridoUSD:parsePreco(x.suggestSellPrice), precoCustoEUR:null, precoVendaSugeridoEUR:null,
  imagemPrincipal:x.bigImage||imagens[0]||null, imagens, stock, pesoGramas:Number(x.productWeight)||null,
  categoriaCJ:x.categoryName||'', categoriaIdCJ:x.categoryId||null,
  variantes:variants.map(v=>({vid:v.vid||v.id||null,sku:v.variantSku||'',nome:v.variantNameEn||'',opcoes:v.variantKey||'',imagemUrl:v.variantImage||null,precoUSD:parsePreco(v.variantSellPrice),stock:(v.inventories||[]).reduce((s,w)=>s+Number(w.totalInventory||0),0)})),
  linkFornecedor:(/^https?:\/\//i.test(String(idOuLink||''))?String(idOuLink).trim():null), dados:x
 };
}
async function consultarEstoque(idProdutoFornecedor){const d=await req(`/product/stock/queryByVid?vid=${encodeURIComponent(idProdutoFornecedor)}`);return{idProdutoFornecedor,stock:Number(d.data?.stock??0),dados:d.data};}
async function consultarRastreio(idPedidoFornecedor){const d=await req(`/logistic/trackInfo?orderId=${encodeURIComponent(idPedidoFornecedor)}`);const data=d.data||{};return{idPedidoFornecedor,codigoRastreio:data.trackNumber||data.trackingNumber||null,estado:data.status||null,dados:data};}

async function calcularFrete({destino, produtos, zip, taxId}){
 const start=process.env.CJ_FROM_COUNTRY_CODE||'CN';
 const payload={startCountryCode:start,endCountryCode:String(destino).toUpperCase(),zip:zip||undefined,taxId:taxId||undefined,products:produtos.map(p=>({quantity:Number(p.quantity)||1,vid:String(p.vid)}))};
 const d=await req('/logistic/freightCalculate',{method:'POST',body:JSON.stringify(payload)});
 const rows=Array.isArray(d.data)?d.data:[];
 return rows.map(x=>({nome:x.logisticName||'Método de envio',custoUSD:Number(x.logisticPrice??x.totalPostageFee??0),prazo:x.logisticAging||null,taxesUSD:x.taxesFee==null?null:Number(x.taxesFee),desalfandegamentoUSD:x.clearanceOperationFee==null?null:Number(x.clearanceOperationFee),totalUSD:x.totalPostageFee==null?null:Number(x.totalPostageFee)}));
}
async function consultarAvaliacoes(pid,{page=1,pageSize=10,score}={}){
 let q=`?pid=${encodeURIComponent(pid)}&pageNum=${page}&pageSize=${pageSize}`; if(score) q+=`&score=${encodeURIComponent(score)}`;
 const d=await req(`/product/productComments${q}`); const data=d.data||{};
 return {total:Number(data.total||0),pagina:Number(data.pageNum||page),tamanho:Number(data.pageSize||pageSize),lista:Array.isArray(data.list)?data.list:[]};
}
module.exports={criarPedido,consultarProduto,consultarEstoque,consultarRastreio,calcularFrete,consultarAvaliacoes};
