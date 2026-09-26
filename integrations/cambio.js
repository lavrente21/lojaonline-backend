const DEFAULT_CURRENCIES=['EUR','USD','GBP','CHF','CAD','BRL','MXN','CLP','COP','PLN','SEK','DKK','NOK','CZK','RON','ZAR','AOA'];
const FX_BASE='https://api.frankfurter.dev/v2';

async function fetchJson(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Fonte de câmbio respondeu ${r.status}.`);return r.json();}
async function obterTaxasEUR(currencies=DEFAULT_CURRENCIES){
 const normal=currencies.filter(c=>c!=='EUR'&&c!=='AOA');
 const rates={EUR:1};
 let rateDate=null;
 if(normal.length){
  const rows=await fetchJson(`${FX_BASE}/rates?base=EUR&quotes=${encodeURIComponent(normal.join(','))}`);
  if(Array.isArray(rows)){for(const row of rows){if(row&&row.quote)rates[String(row.quote).toUpperCase()]=Number(row.rate);if(row?.date)rateDate=rateDate&&rateDate>row.date?rateDate:row.date;}}
  else if(rows?.rates){Object.assign(rates,rows.rates);rateDate=rows.date||null;}
 }
 const aoa=await fetchJson(`${FX_BASE}/rate/EUR/AOA?providers=BNA`);
 if(Number.isFinite(Number(aoa.rate)))rates.AOA=Number(aoa.rate);
 if(aoa?.date)rateDate=rateDate&&rateDate>aoa.date?rateDate:aoa.date;
 for(const c of currencies)if(!Number.isFinite(Number(rates[c]))||Number(rates[c])<=0)throw new Error(`Não existe cotação real disponível para ${c}.`);
 return {rates,rateDate};
}
async function obterTaxaAtual(){return (await obterTaxasEUR(['EUR','AOA'])).rates.AOA;}
async function converterEUR(valorEUR,moeda){const x=await obterTaxasEUR(['EUR',moeda]);return {taxa:Number(x.rates[moeda]),valor:Number((Number(valorEUR)*Number(x.rates[moeda])).toFixed(2)),data:x.rateDate||new Date().toISOString()};}
async function travarCambioParaPedido(valorEUR){const x=await converterEUR(valorEUR,'AOA');return{taxaUsada:x.taxa,valorEUR:Number(valorEUR),valorAOA:x.valor,dataCambio:x.data};}
async function obterTaxaUsdEur(){const x=await obterTaxasEUR(['EUR','USD']);return 1/Number(x.rates.USD);}
module.exports={DEFAULT_CURRENCIES,obterTaxasEUR,converterEUR,obterTaxaAtual,travarCambioParaPedido,obterTaxaUsdEur};
