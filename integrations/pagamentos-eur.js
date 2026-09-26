// Integração REAL com Stripe e PayPal para pagamentos em EUR (Europa/EUA).
//
// .env necessário:
//   STRIPE_SECRET_KEY        (sk_live_... ou sk_test_... para testar primeiro)
//   URL_LOJA                 (ex: https://www.lumina-beauty.com — usada nos redirects)
//   PAYPAL_CLIENT_ID
//   PAYPAL_CLIENT_SECRET
//   PAYPAL_AMBIENTE           "sandbox" (default) ou "live"

const Stripe = require('stripe');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function criarSessaoStripe({ pedidoId, valorEUR, rotaEnvio }) {
  if (!stripe) {
    throw new Error('STRIPE_SECRET_KEY não está definida no .env — não é possível criar a sessão de checkout.');
  }
  const urlBase = process.env.URL_LOJA || 'http://localhost:5500';

  // Os parâmetros aqui têm de bater certo com o que confirmacao.html lê
  // (numero, totalEUR, moeda, rota) — é a mesma página usada quer o cliente
  // venha do fluxo AOA/AppyPay quer do fluxo EUR/Stripe.
  const paramsSucesso = new URLSearchParams({ numero: pedidoId, totalEUR: valorEUR.toFixed(2), moeda: 'EUR', rota: rotaEnvio || 'direto' });

  const sessao = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(valorEUR * 100), // Stripe trabalha em cêntimos
          product_data: { name: `Pedido Lúmina ${pedidoId}` }
        },
        quantity: 1
      }
    ],
    client_reference_id: pedidoId,
    success_url: `${urlBase}/confirmacao.html?${paramsSucesso.toString()}`,
    cancel_url: `${urlBase}/carrinho.html?pedido=${pedidoId}&estado=cancelado`,
    // O webhook real do Stripe (evento checkout.session.completed) tem de
    // apontar para POST /api/webhooks/pagamento-confirmado no dashboard do
    // Stripe (Developers -> Webhooks), com o STRIPE_WEBHOOK_SECRET a validar
    // a assinatura — ver nota em routes/webhooks.js.
  });

  return { sucesso: true, urlCheckout: sessao.url, idSessaoStripe: sessao.id };
}

// ---------- PayPal (Orders API v2) ----------
const PAYPAL_BASE_URL = process.env.PAYPAL_AMBIENTE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function obterTokenPaypal() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET não estão definidos no .env.');
  }
  const credenciais = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const resposta = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credenciais}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(`[PayPal] Falha na autenticação: ${dados.error_description || resposta.status}`);
  return dados.access_token;
}

async function criarPagamentoPaypal({ pedidoId, valorEUR }) {
  const token = await obterTokenPaypal();
  const urlBase = process.env.URL_LOJA || 'http://localhost:5500';

  const resposta = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: pedidoId,
          amount: { currency_code: 'EUR', value: valorEUR.toFixed(2) }
        }
      ],
      application_context: {
        return_url: `${urlBase}/confirmacao.html?pedido=${pedidoId}&estado=sucesso`,
        cancel_url: `${urlBase}/checkout.html?pedido=${pedidoId}&estado=cancelado`
      }
    })
  });

  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(`[PayPal] Falha ao criar pedido: ${dados.message || resposta.status}`);

  const linkAprovacao = (dados.links || []).find((l) => l.rel === 'approve');
  return { sucesso: true, idPedidoPaypal: dados.id, urlAprovacao: linkAprovacao ? linkAprovacao.href : null };
}

module.exports = { criarSessaoStripe, criarPagamentoPaypal };
