const Stripe=require('stripe');
let stripe;
function client(){ if(!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurada.'); return stripe ||= new Stripe(process.env.STRIPE_SECRET_KEY); }
async function criarSessaoStripe({pedidoId,valorEUR,email}){
 const s=await client().checkout.sessions.create({mode:'payment',currency:'eur',line_items:[{price_data:{currency:'eur',product_data:{name:`Encomenda ${pedidoId}`},unit_amount:Math.round(valorEUR*100)},quantity:1}],customer_email:email||undefined,client_reference_id:String(pedidoId),metadata:{pedidoId:String(pedidoId)},success_url:`${process.env.FRONTEND_URL}/confirmacao.html?numero=${encodeURIComponent(pedidoId)}&pagamento=processado`,cancel_url:`${process.env.FRONTEND_URL}/checkout.html?cancelado=1`});
 return {idCobranca:s.id,urlCheckout:s.url};
}
module.exports={criarSessaoStripe,client};
