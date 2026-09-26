const DEFAULT_CURRENCIES=['EUR','USD','GBP','CHF','CAD','BRL','MXN','CLP','COP','PLN','SEK','DKK','NOK','CZK','RON','ZAR','AOA'];
const FX_BASE='https://api.frankfurter.dev/v2';

async function fetchJson(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Fonte de câmbio respondeu ${r.status}.`);return r.json();}
async function obterTaxasEUR(currencies=DEFAULT_CURRENCIES){
 const normal=currencies.filter(c=>c!=='EUR'&&c!=='AOA');
 const rates={EUR:1};
 if(normal.length){const d=await fetchJson(`${FX_BASE}/rates?base=EUR&quotes=${encodeURIComponent(normal.join(','))}`);Object.assign(rates,d.rates||{});}
 // AOA: referência do Banco Nacional de Angola, através do provedor BNA do Frankfurter.
 const aoa=await fetchJson(`${FX_BASE}/rate/EUR/AOA?providers=BNA`); if(Number.isFinite(Number(aoa.rate)))rates.AOA=Number(aoa.rate);
 for(const c of currencies)if(!Number.isFinite(Number(rates[c]))||Number(rates[c])<=0)throw new Error(`Não existe cotação real disponível para ${c}.`);
 return rates;
}
async function obterTaxaAtual(){return (await obterTaxasEUR(['EUR','AOA'])).AOA;}
async function converterEUR(valorEUR,moeda){const rates=await obterTaxasEUR(['EUR',moeda]);return {taxa:Number(rates[moeda]),valor:Number((Number(valorEUR)*Number(rates[moeda])).toFixed(2)),data:new Date().toISOString()};}
async function travarCambioParaPedido(valorEUR){const x=await converterEUR(valorEUR,'AOA');return{taxaUsada:x.taxa,valorEUR:Number(valorEUR),valorAOA:x.valor,dataCambio:x.data};}
async function obterTaxaUsdEur(){const rates=await obterTaxasEUR(['EUR','USD']);return 1/Number(rates.USD);}
module.exports={DEFAULT_CURRENCIES,obterTaxasEUR,converterEUR,obterTaxaAtual,travarCambioParaPedido,obterTaxaUsdEur};
