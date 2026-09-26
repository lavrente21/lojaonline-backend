const BASE='https://developers.cjdropshipping.com/api2.0/v1'; let tokenCache=null;
async function getToken(){
 if(tokenCache?.expires>Date.now()+86400000)return tokenCache.value;
 if(!process.env.CJ_API_KEY) throw new Error('CJ_API_KEY não configurada.');
 const r=await fetch(`${BASE}/authentication/getAccessToken`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:process.env.CJ_API_KEY})});
 const d=await r.json(); if(!r.ok||!d.result) throw new Error(d.message||'Falha na autenticação CJ.');
 tokenCache={value:d.data.accessToken,expires:Date.now()+Math.min(170,Number(process.env.CJ_TOKEN_CACHE_DAYS||170))*86400000}; return tokenCache.value;
}
async function req(path,opts={}){const t=await getToken(); const r=await fetch(BASE+path,{...opts,headers:{'CJ-Access-Token':t,'Content-Type':'application/json',...(opts.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok||d.result===false) throw new Error(d.message||`CJ respondeu ${r.status}.`); return d;}
async function criarPedido({pedidoId,itens,moradaEntrega}){
 const body={orderNumber:String(pedidoId),shippingZip:moradaEntrega.codigoPostal||'',shippingCountryCode:moradaEntrega.pais,shippingCountry:moradaEntrega.pais,shippingProvince:moradaEntrega.provincia||'',shippingCity:moradaEntrega.cidade,shippingAddress:moradaEntrega.linha1,shippingCustomerName:moradaEntrega.nome||'Cliente Lúmina',email:moradaEntrega.email||'',shippingPhone:moradaEntrega.telefone||'',payType:3,logisticName:process.env.CJ_LOGISTIC_NAME||'Standard',fromCountryCode:process.env.CJ_FROM_COUNTRY_CODE||'CN',platform:'Api',shopLogisticsType:2,orderFlow:1,products:itens.map(i=>({vid:i.skuFornecedor||i.idFornecedor,quantity:i.quantidade,storeLineItemId:String(i.produtoId)}))};
 const d=await req('/shopping/order/createOrderV3',{method:'POST',body:JSON.stringify(body)}); const data=d.data||{}; return {idPedidoFornecedor:data.orderId||data.cjOrderId||data.orderNum,prazoEstimadoDias:null,dados:data};
}
async function consultarProduto(id){const d=await req(`/product/query?pid=${encodeURIComponent(id)}`);const x=d.data||{};return {nome:x.productName||x.name,descricao:x.description||'',idFornecedor:x.pid||id,skuFornecedor:x.sku||null,precoCustoEUR:null,precoVendaSugeridoEUR:null,imagemPrincipal:x.productImage||x.image||null,imagens:x.productImageList||[],dados:x};}
async function consultarEstoque(idProdutoFornecedor){const d=await req(`/product/stock/queryByVid?vid=${encodeURIComponent(idProdutoFornecedor)}`);return{idProdutoFornecedor,stock:Number(d.data?.stock??0),dados:d.data};}
async function consultarRastreio(idPedidoFornecedor){const d=await req(`/logistic/trackInfo?orderId=${encodeURIComponent(idPedidoFornecedor)}`);const data=d.data||{};return{idPedidoFornecedor,codigoRastreio:data.trackNumber||data.trackingNumber||null,estado:data.status||null,dados:data};}
module.exports={criarPedido,consultarProduto,consultarEstoque,consultarRastreio};
