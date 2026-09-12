// Integração com Stripe/PayPal para pagamentos em EUR (Europa/EUA).
// Modo SIMULADO (mock) — substituir pelas SDKs oficiais em produção:
//   npm install stripe  →  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

async function criarSessaoStripe({ pedidoId, valorEUR }) {
  console.log(`[Stripe][MOCK] A criar sessão de checkout de ${valorEUR}€ para o pedido ${pedidoId}`);
  // TODO produção: stripe.checkout.sessions.create({...})
  return { sucesso: true, urlCheckout: `https://checkout.stripe.com/mock/${pedidoId}` };
}

async function criarPagamentoPaypal({ pedidoId, valorEUR }) {
  console.log(`[PayPal][MOCK] A criar pagamento de ${valorEUR}€ para o pedido ${pedidoId}`);
  // TODO produção: chamar PayPal Orders API
  return { sucesso: true, urlAprovacao: `https://paypal.com/mock-approve/${pedidoId}` };
}

module.exports = { criarSessaoStripe, criarPagamentoPaypal };
