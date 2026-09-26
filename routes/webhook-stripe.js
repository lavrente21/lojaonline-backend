// Webhook OFICIAL do Stripe. Diferente dos outros webhooks deste projeto:
// tem de receber o corpo em bruto (raw), não já convertido em JSON, para a
// verificação de assinatura funcionar — por isso é montado à parte em
// server.js, ANTES do app.use(express.json()) global.
//
// Configuração no dashboard do Stripe (Developers -> Webhooks -> Add endpoint):
//   URL: https://o-teu-backend.onrender.com/api/webhooks/stripe
//   Evento: checkout.session.completed
// Depois copia o "Signing secret" (whsec_...) para STRIPE_WEBHOOK_SECRET no .env.

const express = require('express');
const Stripe = require('stripe');
const { confirmarPagamentoEUR } = require('./webhooks');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

router.post('/', async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[Webhook Stripe] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET não configurados.');
    return res.status(500).send('Stripe não configurado.');
  }

  let evento;
  try {
    const assinatura = req.headers['stripe-signature'];
    evento = stripe.webhooks.constructEvent(req.body, assinatura, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (erro) {
    console.error('[Webhook Stripe] Assinatura inválida:', erro.message);
    return res.status(400).send(`Webhook Error: ${erro.message}`);
  }

  if (evento.type === 'checkout.session.completed') {
    const sessao = evento.data.object;
    const numeroPedido = sessao.client_reference_id;
    try {
      await confirmarPagamentoEUR(numeroPedido);
    } catch (erro) {
      console.error(`[Webhook Stripe] Falha ao processar o pedido ${numeroPedido}:`, erro.message);
      // Devolve 200 na mesma para o Stripe não ficar a tentar reenviar
      // indefinidamente um pedido que já não existe — mas fica registado no log.
    }
  }

  res.json({ recebido: true });
});

module.exports = router;
