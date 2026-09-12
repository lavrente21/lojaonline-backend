const express = require('express');
const { ler, guardar } = require('../config/db');
const cjApi = require('../integrations/cj-api');
const buckydropApi = require('../integrations/buckydrop-api');

const router = express.Router();

// Agrupa os itens do pedido por fornecedor, porque um único pedido pode ter
// produtos do CJ e do Buckydrop ao mesmo tempo — cada fornecedor recebe o
// seu próprio sub-pedido.
function agruparItensPorFornecedor(itens) {
  const grupos = {};
  for (const item of itens) {
    if (!grupos[item.fornecedor]) grupos[item.fornecedor] = [];
    grupos[item.fornecedor].push(item);
  }
  return grupos;
}

async function criarPedidosNosFornecedores(pedido) {
  const grupos = agruparItensPorFornecedor(pedido.itens);
  const resultados = {};

  for (const fornecedor of Object.keys(grupos)) {
    const api = fornecedor === 'cj' ? cjApi : buckydropApi;
    const resposta = await api.criarPedido({
      pedidoId: pedido.id,
      itens: grupos[fornecedor],
      moradaEntrega: pedido.moradaEnviadaAoFornecedor
    });
    resultados[fornecedor] = {
      idPedidoFornecedor: resposta.idPedidoFornecedor,
      prazoEstimadoDias: resposta.prazoEstimadoDias,
      rastreio1: null, // fornecedor -> agente de carga (ou -> cliente, se rota direta)
      rastreio2: null, // agente de carga -> cliente final (só existe se rotaEnvio = agente_de_carga)
      estado: 'processando'
    };
  }
  return resultados;
}

// ---------- Webhook: pagamento confirmado (Stripe/PayPal, EUR) ----------
router.post('/pagamento-confirmado', async (req, res) => {
  const { numeroPedido } = req.body;
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === numeroPedido);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  pedido.pagamento.estado = 'pago';
  pedido.estado = 'processando';
  pedido.fornecedores = await criarPedidosNosFornecedores(pedido);
  guardar(db);

  console.log(`[Webhook] Pedido ${numeroPedido} pago (EUR) — pedidos criados nos fornecedores.`);
  res.json({ sucesso: true, fornecedores: pedido.fornecedores });
});

// ---------- Webhook: pagamento confirmado em Kwanza (AppyPay) ----------
router.post('/pagamento-aoa-confirmado', async (req, res) => {
  const { numeroPedido, idCobranca } = req.body;
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === numeroPedido);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  pedido.pagamento.estado = 'pago';
  pedido.pagamento.idCobrancaConfirmada = idCobranca;
  pedido.estado = 'processando';
  pedido.fornecedores = await criarPedidosNosFornecedores(pedido);
  guardar(db);

  console.log(`[Webhook] Pedido ${numeroPedido} pago (AOA via AppyPay) — pedidos criados nos fornecedores.`);
  res.json({ sucesso: true, fornecedores: pedido.fornecedores });
});

// ---------- Webhook: rastreio do CJ (fornecedor -> agente de carga OU -> cliente) ----------
router.post('/cj-tracking', (req, res) => {
  const { numeroPedido, codigoRastreio } = req.body;
  atualizarRastreio1(numeroPedido, 'cj', codigoRastreio, res);
});

// ---------- Webhook: rastreio do Buckydrop ----------
router.post('/buckydrop-tracking', (req, res) => {
  const { numeroPedido, codigoRastreio } = req.body;
  atualizarRastreio1(numeroPedido, 'buckydrop', codigoRastreio, res);
});

function atualizarRastreio1(numeroPedido, fornecedor, codigoRastreio, res) {
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === numeroPedido);
  if (!pedido || !pedido.fornecedores[fornecedor]) {
    return res.status(404).json({ erro: 'Pedido ou fornecedor não encontrado.' });
  }
  pedido.fornecedores[fornecedor].rastreio1 = codigoRastreio;

  if (pedido.rotaEnvio === 'agente_de_carga') {
    // ainda falta uma etapa: agente -> cliente final
    pedido.fornecedores[fornecedor].estado = 'enviado_ao_agente';
    pedido.estado = 'enviado_ao_agente';
  } else {
    // rota direta: este já é o rastreio final
    pedido.fornecedores[fornecedor].estado = 'a_caminho';
    pedido.estado = 'a_caminho';
  }
  guardar(db);
  res.json({ sucesso: true });
}

// ---------- Webhook: rastreio do agente de carga (agente -> cliente final, ex: Angola) ----------
router.post('/agente-tracking', (req, res) => {
  const { numeroPedido, fornecedor, codigoRastreio } = req.body;
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === numeroPedido);
  if (!pedido || !pedido.fornecedores[fornecedor]) {
    return res.status(404).json({ erro: 'Pedido ou fornecedor não encontrado.' });
  }
  pedido.fornecedores[fornecedor].rastreio2 = codigoRastreio;
  pedido.fornecedores[fornecedor].estado = 'a_caminho_destino_final';
  pedido.estado = 'a_caminho_destino_final';
  guardar(db);
  console.log(`[Webhook] Agente de carga despachou pedido ${numeroPedido} (${fornecedor}) para o destino final.`);
  res.json({ sucesso: true });
});

// ---------- Webhook: entrega confirmada ----------
router.post('/entrega-confirmada', (req, res) => {
  const { numeroPedido } = req.body;
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === numeroPedido);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  pedido.estado = 'entregue';
  Object.values(pedido.fornecedores).forEach(f => f.estado = 'entregue');
  guardar(db);
  res.json({ sucesso: true });
});

module.exports = router;
