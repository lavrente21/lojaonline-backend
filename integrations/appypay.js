// A AppyPay exige credenciais e contrato/API habilitados na conta do comerciante.
// Não há fallback MOCK: sem configuração real o checkout AOA falha explicitamente.
async function criarCobranca({pedidoId,valorAOA,telefoneCliente}){
 const base=process.env.APPYPAY_API_URL, key=process.env.APPYPAY_API_KEY;
 if(!base||!key) throw new Error('AppyPay não configurado. Defina APPYPAY_API_URL e APPYPAY_API_KEY no Render.');
 const r=await fetch(`${base.replace(/\/$/,'')}/charges`,{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({externalReference:String(pedidoId),amount:valorAOA,currency:'AOA',customer:{phone:telefoneCliente}})});
 const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.message||`AppyPay respondeu ${r.status}.`);
 const id=d.id||d.reference||d.chargeId; if(!id) throw new Error('Resposta AppyPay sem identificador de cobrança.'); return {idCobranca:id,estado:'pendente',dados:d};
}
module.exports={criarCobranca};
