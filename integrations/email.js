const EMAIL_API='https://api.resend.com/emails';
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function enviarEmail({to,subject,html,text}){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return {enviado:false,razao:'email_nao_configurado'};
 const r=await fetch(EMAIL_API,{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:Array.isArray(to)?to:[to],subject,html,text,reply_to:process.env.EMAIL_REPLY_TO||undefined})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.message||`Serviço de e-mail respondeu ${r.status}.`);
 return {enviado:true,id:data.id||null};
}
async function notificarNovaEncomenda({numeroPedido,nome,email,totalEUR,moeda}){
 const numero=escapeHtml(numeroPedido),cliente=escapeHtml(nome),mail=escapeHtml(email),total=escapeHtml(Number(totalEUR).toFixed(2)),cur=escapeHtml(moeda);
 const customer=await enviarEmail({to:email,subject:`Recebemos a sua encomenda ${numeroPedido} — Lumina`,html:`<p>Olá ${cliente},</p><p>Recebemos a sua encomenda <strong>${numero}</strong>.</p><p>Subtotal dos produtos: <strong>${total} ${cur}</strong>.</p><p>Esta encomenda ainda não foi paga nem enviada. A nossa equipa irá confirmar a disponibilidade, os portes e as opções de pagamento antes de avançar.</p>${process.env.EMAIL_REPLY_TO?`<p>Em caso de dúvida, contacte <a href="mailto:${escapeHtml(process.env.EMAIL_REPLY_TO)}">${escapeHtml(process.env.EMAIL_REPLY_TO)}</a>.</p>`:''}<p>Equipa Lumina</p>`,text:`Olá ${nome}, recebemos a encomenda ${numeroPedido}. Subtotal dos produtos: ${Number(totalEUR).toFixed(2)} ${moeda}. A encomenda ainda não foi paga nem enviada; a equipa confirmará disponibilidade, portes e pagamento.`});
 let loja={enviado:false,razao:'email_nao_configurado'};
 if(process.env.STORE_ORDER_NOTIFICATION_EMAIL){loja=await enviarEmail({to:process.env.STORE_ORDER_NOTIFICATION_EMAIL,subject:`Nova encomenda pendente ${numeroPedido}`,html:`<p>Nova encomenda recebida sem cobrança.</p><p>Referência: <strong>${numero}</strong><br>Cliente: ${cliente} (${mail})<br>Subtotal: ${total} ${cur}</p><p>Confirmar disponibilidade e portes antes de qualquer pagamento ou envio ao fornecedor.</p>`,text:`Nova encomenda ${numeroPedido}; cliente ${nome} (${email}); subtotal ${Number(totalEUR).toFixed(2)} ${moeda}. Pendente de confirmação.`});}
 return {cliente,loja};
}
async function enviarCampanha({to,assunto,conteudo,unsubscribeUrl}){
 const corpo=String(conteudo||'');
 const html=`<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(corpo).replace(/\n/g,'<br>')}<hr><p style="font-size:12px;color:#666">Recebeu esta mensagem porque subscreveu as novidades da Lúmina. <a href="${escapeHtml(unsubscribeUrl||'#')}">Cancelar subscrição</a>.</p></div>`;
 return enviarEmail({to,subject:String(assunto||'Novidades Lúmina'),html,text:`${corpo}\n\nCancelar subscrição: ${unsubscribeUrl||''}`});
}
module.exports={enviarEmail,notificarNovaEncomenda,enviarCampanha};
