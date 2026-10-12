const BASE='https://developers.cjdropshipping.com/api2.0/v1'; let tokenCache=null,tokenPromise=null;
// A CJ limita a 1 pedido/segundo: fila global com espaçamento mínimo e novas tentativas em 429.
let filaCJ=Promise.resolve(),ultimoCJ=0;
const MIN_INTERVALO_MS=Number(process.env.CJ_MIN_INTERVALO_MS||1200);
function limitado(fn){const run=filaCJ.then(async()=>{const espera=ultimoCJ+MIN_INTERVALO_MS-Date.now();if(espera>0)await new Promise(r=>setTimeout(r,espera));try{return await fn();}finally{ultimoCJ=Date.now();}});filaCJ=run.catch(()=>{});return run;}
const eLimite=(status,msg)=>status===429||/too many requests|qps limit/i.test(String(msg||''));
async function getToken(){
 if(tokenCache?.expires>Date.now()+86400000)return tokenCache.value;
 if(!tokenPromise)tokenPromise=obterToken().finally(()=>{tokenPromise=null;});
 return tokenPromise;
}
async function obterToken(){
 if(tokenCache?.expires>Date.now()+86400000)return tokenCache.value;
 if(!process.env.CJ_API_KEY) throw new Error('CJ_API_KEY não configurada.');
 let d;for(let t=0;t<4;t++){const r=await limitado(()=>fetch(`${BASE}/authentication/getAccessToken`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:process.env.CJ_API_KEY})}));d=await r.json().catch(()=>({}));if(eLimite(r.status,d.message)&&t<3){await new Promise(x=>setTimeout(x,2000*(t+1)));continue;}if(!r.ok||!d.result) throw new Error(d.message||'Falha na autenticação CJ.');break;}
 tokenCache={value:d.data.accessToken,expires:Date.now()+Math.min(170,Number(process.env.CJ_TOKEN_CACHE_DAYS||170))*86400000}; return tokenCache.value;
}
async function req(path,opts={}){const t=await getToken();for(let tentativa=0;;tentativa++){const r=await limitado(()=>fetch(BASE+path,{...opts,headers:{'CJ-Access-Token':t,'Content-Type':'application/json',...(opts.headers||{})}}));const d=await r.json().catch(()=>({}));if(eLimite(r.status,d.message)&&tentativa<4){await new Promise(x=>setTimeout(x,1500*(tentativa+1)));continue;}if(!r.ok||d.result===false)throw new Error(d.message||`CJ respondeu ${r.status}.`);return d;}}
async function criarPedido({pedidoId,itens,moradaEntrega,logisticName,origem:origemParam}){
 const origem=String(origemParam||process.env.CJ_FROM_COUNTRY_CODE||'').trim().toUpperCase();const logistica=String(logisticName||process.env.CJ_LOGISTIC_NAME||'').trim();if(!origem)throw new Error('CJ_FROM_COUNTRY_CODE não configurado; envio bloqueado.');if(!logistica)throw new Error('CJ_LOGISTIC_NAME não configurado; envio bloqueado.');if(!moradaEntrega.nome||!moradaEntrega.pais||!moradaEntrega.cidade||!moradaEntrega.linha1||!moradaEntrega.telefone)throw new Error('Morada de expedição incompleta; envio bloqueado.');if(itens.some(i=>!i.idFornecedorVariante||!Number.isInteger(Number(i.quantidade))||Number(i.quantidade)<1))throw new Error('Variant ID ou quantidade inválida; envio bloqueado.');
 const body={orderNumber:String(pedidoId),shippingZip:moradaEntrega.codigoPostal||'',shippingCountryCode:moradaEntrega.pais,shippingCountry:moradaEntrega.pais,shippingProvince:moradaEntrega.provincia||'',shippingCity:moradaEntrega.cidade,shippingAddress:moradaEntrega.linha1,shippingCustomerName:moradaEntrega.nome,email:moradaEntrega.email||'',shippingPhone:moradaEntrega.telefone,payType:3,logisticName:logistica,fromCountryCode:origem,platform:'Api',shopLogisticsType:2,orderFlow:1,products:itens.map(i=>({vid:i.idFornecedorVariante,quantity:i.quantidade,storeLineItemId:String(i.produtoId)}))};
 const UE=new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);
 if(UE.has(String(moradaEntrega.pais||'').trim().toUpperCase())){
  // IOSS (IVA em importações até 150 EUR): 1=sem IOSS (cliente paga IVA), 2=IOSS próprio, 3=IOSS da CJ.
  const t=String(process.env.CJ_IOSS_TYPE||'3').trim();
  if(!['1','2','3'].includes(t))throw new Error('CJ_IOSS_TYPE inválido (use 1, 2 ou 3); envio bloqueado.');
  body.iossType=Number(t);
  if(t==='3')body.iossNumber='CJ-IOSS';
  else if(t==='2'){const n=String(process.env.CJ_IOSS_NUMBER||'').trim();if(!n)throw new Error('CJ_IOSS_NUMBER não configurado (CJ_IOSS_TYPE=2); envio bloqueado.');body.iossNumber=n;}
 }
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
async function consultarEstoque(idProdutoFornecedor,{origem}={}){
 const d=await req(`/product/stock/queryByVid?vid=${encodeURIComponent(idProdutoFornecedor)}`);
 const linhas=Array.isArray(d.data)?d.data:(d.data&&typeof d.data==='object'?[d.data]:[]);
 const alvo=origem?String(origem).trim().toUpperCase():'';
 const num=v=>(v===undefined||v===null||v==='')?null:Number(v);
 const quantidade=l=>{const t=num(l.totalInventory??l.storageNum??l.stock);if(t!==null&&Number.isFinite(t))return t;const a=num(l.cjInventoryNum??l.cjInventory),b=num(l.factoryInventoryNum??l.factoryInventory);return(a===null&&b===null)?null:(a||0)+(b||0);};
 const uteis=(alvo&&linhas.some(l=>l.countryCode))?linhas.filter(l=>String(l.countryCode||'').toUpperCase()===alvo):linhas;
 const reconhecido=linhas.length===0||linhas.some(l=>quantidade(l)!==null);
 const stock=uteis.reduce((s,l)=>s+(quantidade(l)||0),0);
 return{idProdutoFornecedor,stock,reconhecido,origem:alvo||null,dados:d.data};
}
async function consultarRastreio(idPedidoFornecedor){const d=await req(`/logistic/trackInfo?orderId=${encodeURIComponent(idPedidoFornecedor)}`);const data=d.data||{};return{idPedidoFornecedor,codigoRastreio:data.trackNumber||data.trackingNumber||null,estado:data.status||null,dados:data};}

async function calcularFrete({destino, produtos, zip, taxId, origem}){
 const start=String(origem||process.env.CJ_FROM_COUNTRY_CODE||'').trim().toUpperCase();if(!start)throw new Error('País de origem do produto não definido (campo país de origem no admin); cotação bloqueada.');
 const payload={startCountryCode:start,endCountryCode:String(destino).toUpperCase(),zip:zip||undefined,taxId:taxId||undefined,products:produtos.map(p=>({quantity:Number(p.quantity)||1,vid:String(p.vid)}))};
 const d=await req('/logistic/freightCalculate',{method:'POST',body:JSON.stringify(payload)});
 const rows=Array.isArray(d.data)?d.data:(Array.isArray(d.data?.freightTrialList)?d.data.freightTrialList:[]);
 return rows.map(x=>({nome:x.logisticName||x.enName||'Método de envio',custoUSD:Number(x.logisticPrice??x.shippingCost??x.totalPostageFee??0),prazo:x.logisticAging||x.deliveryTime||null,taxesUSD:x.taxesFee==null?null:Number(x.taxesFee),desalfandegamentoUSD:x.clearanceOperationFee==null?null:Number(x.clearanceOperationFee),totalUSD:x.totalPostageFee==null?Number(x.logisticPrice??x.shippingCost??0):Number(x.totalPostageFee)})).filter(x=>Number.isFinite(x.totalUSD)&&x.totalUSD>=0);
}
async function consultarAvaliacoes(pid,{page=1,pageSize=10,score}={}){
 let q=`?pid=${encodeURIComponent(pid)}&pageNum=${page}&pageSize=${pageSize}`; if(score) q+=`&score=${encodeURIComponent(score)}`;
 const d=await req(`/product/productComments${q}`); const data=d.data||{};
 return {total:Number(data.total||0),pagina:Number(data.pageNum||page),tamanho:Number(data.pageSize||pageSize),lista:Array.isArray(data.list)?data.list:[]};
}
module.exports={criarPedido,consultarProduto,consultarEstoque,consultarRastreio,calcularFrete,consultarAvaliacoes};
