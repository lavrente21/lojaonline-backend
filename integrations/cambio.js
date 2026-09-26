const URL = process.env.EXCHANGE_RATE_API_URL;
const KEY = process.env.EXCHANGE_RATE_API_KEY;
async function obterTaxaAtual(){
  if(!URL) throw new Error('EXCHANGE_RATE_API_URL não configurada; checkout em AOA bloqueado até haver uma fonte real de câmbio.');
  const u=new URL(URL); if(KEY) u.searchParams.set('api_key',KEY);
  const r=await fetch(u); if(!r.ok) throw new Error(`Fonte de câmbio respondeu ${r.status}.`); const d=await r.json();
  const taxa=Number(d.rates?.AOA ?? d.conversion_rates?.AOA); if(!Number.isFinite(taxa)||taxa<=0) throw new Error('A fonte de câmbio não devolveu EUR→AOA.'); return taxa;
}
async function travarCambioParaPedido(valorEUR){const taxa=await obterTaxaAtual();return{taxaUsada:taxa,valorEUR,valorAOA:Math.round(valorEUR*taxa*100)/100,dataCambio:new Date().toISOString()}}
module.exports={obterTaxaAtual,travarCambioParaPedido};
