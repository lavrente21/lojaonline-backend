const DEFAULT_CURRENCIES=['EUR','USD','GBP','CHF','CAD','BRL','MXN','CLP','COP','PLN','SEK','DKK','NOK','CZK','RON','ZAR','AOA'];
const FX_BASE='https://api.frankfurter.dev/v2';
async function fetchJson(url){const r=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'}});if(!r.ok)throw new Error(`Fonte de câmbio respondeu ${r.status}.`);return r.json();}
async function obterTaxasEUR(currencies=DEFAULT_CURRENCIES){
 const requested=[...new Set(currencies.map(c=>String(c).toUpperCase()))];
 const normal=requested.filter(c=>c!=='EUR'&&c!=='AOA');
 const rates={EUR:1}; let rateDate=null;
 if(normal.length){
  const rows=await fetchJson(`${FX_BASE}/rates?base=EUR&quotes=${encodeURIComponent(normal.join(','))}`);
  const list=Array.isArray(rows)?rows:(Array.isArray(rows?.rates)?rows.rates:[]);
  for(const row of list){const q=String(row?.quote||'').toUpperCase();const rate=Number(row?.rate);if(q&&Number.isFinite(rate)&&rate>0)rates[q]=rate;if(row?.date&&(!rateDate||row.date>rateDate))rateDate=row.date;}
 }
 if(requested.includes('AOA')){
  const aoa=await fetchJson(`${FX_BASE}/rate/EUR/AOA?providers=BNA`);
  if(!Number.isFinite(Number(aoa?.rate))||Number(aoa.rate)<=0)throw new Error('A cotação EUR/AOA do BNA não está disponível.');
  rates.AOA=Number(aoa.rate); if(aoa?.date&&(!rateDate||aoa.date>rateDate))rateDate=aoa.date;
 }
 for(const c of requested)if(!Number.isFinite(Number(rates[c]))||Number(rates[c])<=0)throw new Error(`Não existe cotação real disponível para ${c}.`);
 return {rates,rateDate};
}
async function obterTaxaAtual(){return (await obterTaxasEUR(['EUR','AOA'])).rates.AOA;}
async function converterEUR(valorEUR,moeda){const x=await obterTaxasEUR(['EUR',String(moeda).toUpperCase()]);return {taxa:Number(x.rates[String(moeda).toUpperCase()]),valor:Number((Number(valorEUR)*Number(x.rates[String(moeda).toUpperCase()])).toFixed(2)),data:x.rateDate||null};}
async function travarCambioParaPedido(valorEUR){const x=await converterEUR(valorEUR,'AOA');return{taxaUsada:x.taxa,valorEUR:Number(valorEUR),valorAOA:x.valor,dataCambio:x.data};}
async function obterTaxaUsdEur(){const x=await obterTaxasEUR(['EUR','USD']);return 1/Number(x.rates.USD);}
module.exports={DEFAULT_CURRENCIES,obterTaxasEUR,converterEUR,obterTaxaAtual,travarCambioParaPedido,obterTaxaUsdEur};
