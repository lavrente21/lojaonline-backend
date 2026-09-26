async function criarCobranca({pedidoId,valorAOA,telefoneCliente}){
 const base=process.env.APPYPAY_API_URL||'https://gwy-api.appypay.co.ao/v2.0'; const token=process.env.APPYPAY_ACCESS_TOKEN; const paymentMethod=process.env.APPYPAY_PAYMENT_METHOD;
 if(!token||!paymentMethod)throw new Error('AppyPay não configurado: defina APPYPAY_ACCESS_TOKEN e APPYPAY_PAYMENT_METHOD no Render.');
 const merchantTransactionId=String(pedidoId).replace(/[^A-Za-z0-9]/g,'').slice(0,15); if(merchantTransactionId.length<1)throw new Error('Identificador de transação inválido.');
 const r=await fetch(`${base.replace(/\/$/,'')}/charges`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({amount:Number(valorAOA),currency:'AOA',description:`Pagamento ${merchantTransactionId}`,merchantTransactionId,paymentMethod,paymentInfo:{phoneNumber:telefoneCliente}})});
 const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d?.message||d?.responseStatus?.message||`AppyPay respondeu ${r.status}.`); const id=d.id||d.reference||d.chargeId;if(!id)throw new Error('Resposta AppyPay sem identificador de cobrança.');return{idCobranca:id,estado:'pendente',dados:d};
}
module.exports={criarCobranca};
