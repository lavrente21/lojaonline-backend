const crypto=require('crypto');
const BASE=process.env.BUCKYDROP_API_URL;
function cfg(){if(!BASE||!process.env.BUCKYDROP_APPCODE||!process.env.BUCKYDROP_APPSECRET)throw new Error('BuckyDrop não configurado: BUCKYDROP_API_URL/APPCODE/APPSECRET.');}
function signPost(body,t){return crypto.createHash('md5').update(process.env.BUCKYDROP_APPCODE+JSON.stringify(body)+t+process.env.BUCKYDROP_APPSECRET).digest('hex')}
async function post(path,body){cfg();const t=Date.now(),s=signPost(body,t);const r=await fetch(BASE.replace(/\/$/,'')+path+`?appCode=${encodeURIComponent(process.env.BUCKYDROP_APPCODE)}&timestamp=${t}&sign=${s}`,{method:'POST',headers:{'Content-Type':'application/json',lang:'en'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw new Error(d.message||`BuckyDrop respondeu ${r.status}.`);return d}
async function criarPedido({pedidoId,itens,moradaEntrega}){const body={platformOrderId:String(pedidoId),shippingCountry:moradaEntrega.pais,shippingCity:moradaEntrega.cidade,shippingAddress:moradaEntrega.linha1,shippingZip:moradaEntrega.codigoPostal||'',shippingPhone:moradaEntrega.telefone||'',items:itens.map(i=>({sku:i.skuFornecedor||i.idFornecedor,quantity:i.quantidade}))};const d=await post(process.env.BUCKYDROP_ORDER_PATH||'/api/rest/v2/order/create',body);const data=d.data||d;return{idPedidoFornecedor:data.orderId||data.id,prazoEstimadoDias:null,dados:data}}
async function consultarRastreio(id){const d=await post(process.env.BUCKYDROP_TRACK_PATH||'/api/rest/v2/logistics/track',{orderId:id});const data=d.data||d;return{idPedidoFornecedor:id,codigoRastreio:data.trackingNumber||data.trackNumber||null,estado:data.status||null,dados:data}}
// BuckyDrop exposes account-specific API capabilities. Configure the exact freight endpoint
// and payload shape from the API center; never estimate a price when the API is unavailable.
async function calcularFrete({destino,produtos,zip}){
 const path=process.env.BUCKYDROP_FREIGHT_PATH;
 if(!path)throw new Error('Configure BUCKYDROP_FREIGHT_PATH com o endpoint de cálculo de portes indicado no centro API da BuckyDrop.');
 const body={shippingCountry:String(destino).toUpperCase(),shippingZip:zip||'',items:produtos.map(p=>({sku:String(p.sku),quantity:Number(p.quantity)}))};
 const d=await post(path,body); const raw=d.data||d; const rows=Array.isArray(raw)?raw:(Array.isArray(raw.methods)?raw.methods:(Array.isArray(raw.shippingMethods)?raw.shippingMethods:[]));
 return rows.map(x=>({nome:x.name||x.logisticsName||x.shippingMethod||'BuckyDrop',custoUSD:Number(x.shippingFee??x.freight??x.price??x.totalFee),prazo:x.estimatedDays||x.deliveryTime||null,totalUSD:Number(x.totalFee??x.shippingFee??x.freight??x.price)})).filter(x=>Number.isFinite(x.totalUSD)&&x.totalUSD>=0);
}
module.exports={criarPedido,consultarRastreio,calcularFrete};
