const express = require('express');
const { pool } = require('../config/db');
const cjApi = require('../integrations/cj-api');
const buckydropApi = require('../integrations/buckydrop-api');

const router = express.Router();

async function buscarPedidoPorNumero(numero) {
  const { rows } = await pool.query('SELECT * FROM pedidos WHERE numero = $1', [numero]);
  return rows[0] || null;
}

async function buscarItensDoPedido(pedidoId) {
  const { rows } = await pool.query('SELECT * FROM pedido_itens WHERE pedido_id = $1', [pedidoId]);
  return rows;
}

// Agrupa os itens do pedido por fornecedor, porque um único pedido pode ter
// produtos do CJ e do Buckydrop ao mesmo tempo — cada fornecedor recebe o
// seu próprio sub-pedido.
function agruparItensPorFornecedor(itens) {
  const grupos = {};
  for (const item of itens) {
    if (item.fornecedor !== 'cj' && item.fornecedor !== 'buckydrop') continue; // 'proprio' não vai a fornecedor externo
    if (!grupos[item.fornecedor]) grupos[item.fornecedor] = [];
    grupos[item.fornecedor].push(item);
  }
  return grupos;
}

async function criarPedidosNosFornecedores(pedido) {
  const itens = await buscarItensDoPedido(pedido.id);
  const grupos = agruparItensPorFornecedor(itens);

  const moradaEnviada = {
    nome: pedido.fornecedor_morada_nome || pedido.entrega_linha1 && 'Cliente Lúmina',
    linha1: pedido.fornecedor_morada_linha1 || pedido.entrega_linha1,
    cidade: pedido.fornecedor_morada_cidade || pedido.entrega_cidade,
    codigoPostal: pedido.fornecedor_morada_cp || pedido.entrega_codigo_postal,
    pais: pedido.fornecedor_morada_pais || pedido.entrega_pais,
    telefone: pedido.fornecedor_morada_telefone || pedido.entrega_telefone
  };

  for (const fornecedor of Object.keys(grupos)) {
    const api = fornecedor === 'cj' ? cjApi : buckydropApi;

    // Precisamos do id_fornecedor real (ex: pid da CJ), não só do nome — vai buscar aos produtos.
    const idsProdutos = grupos[fornecedor].map((i) => i.produto_id).filter(Boolean);
    const { rows: produtosDb } = idsProdutos.length
      ? await pool.query('SELECT id, id_fornecedor FROM produtos WHERE id = ANY($1::bigint[])', [idsProdutos])
      : { rows: [] };

    const itensParaFornecedor = grupos[fornecedor].map((i) => {
      const produtoDb = produtosDb.find((p) => String(p.id) === String(i.produto_id));
      return { idFornecedor: produtoDb ? produtoDb.id_fornecedor : null, quantidade: i.quantidade };
    });

    let resposta;
    try {
      resposta = await api.criarPedido({ pedidoId: pedido.numero, itens: itensParaFornecedor, moradaEntrega: moradaEnviada });
    } catch (erro) {
      console.error(`[Webhook] Falha ao criar pedido no fornecedor ${fornecedor}:`, erro.message);
      resposta = { idPedidoFornecedor: null, prazoEstimadoDias: null };
    }

    await pool.query(`
      INSERT INTO pedido_fornecedores (pedido_id, fornecedor, id_pedido_fornecedor, prazo_estimado_dias, estado)
      VALUES ($1,$2,$3,$4,'processando')
      ON CONFLICT (pedido_id, fornecedor) DO UPDATE SET id_pedido_fornecedor = EXCLUDED.id_pedido_fornecedor, prazo_estimado_dias = EXCLUDED.prazo_estimado_dias
    `, [pedido.id, fornecedor, resposta.idPedidoFornecedor, resposta.prazoEstimadoDias]);
  }
}

// Lógica partilhada: marca o pedido como pago e cria os pedidos reais nos
// fornecedores. Usada tanto pelo endpoint manual /pagamento-confirmado
// (útil para PayPal, ou para testares à mão) como pelo webhook oficial do
// Stripe com assinatura verificada (ver routes/webhook-stripe.js).
async function confirmarPagamentoEUR(numeroPedido) {
  const pedido = await buscarPedidoPorNumero(numeroPedido);
  if (!pedido) throw Object.assign(new Error('Pedido não encontrado.'), { status: 404 });

  await pool.query('UPDATE pedido_pagamentos SET estado = $1 WHERE pedido_id = $2', ['pago', pedido.id]);
  await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', ['processando', pedido.id]);
  await criarPedidosNosFornecedores(pedido);
  console.log(`[Webhook] Pedido ${numeroPedido} pago (EUR) — pedidos criados nos fornecedores.`);
}

// ---------- Webhook: pagamento confirmado (chamada manual / PayPal) ----------
router.post('/pagamento-confirmado', async (req, res, next) => {
  try {
    await confirmarPagamentoEUR(req.body.numeroPedido);
    res.json({ sucesso: true });
  } catch (erro) {
    if (erro.status) return res.status(erro.status).json({ erro: erro.message });
    next(erro);
  }
});

// ---------- Webhook: pagamento confirmado em Kwanza (AppyPay) ----------
router.post('/pagamento-aoa-confirmado', async (req, res, next) => {
  try {
    const { numeroPedido, idCobranca } = req.body;
    const pedido = await buscarPedidoPorNumero(numeroPedido);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    await pool.query('UPDATE pedido_pagamentos SET estado = $1, id_cobranca_confirmada = $2 WHERE pedido_id = $3', ['pago', idCobranca, pedido.id]);
    await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', ['processando', pedido.id]);
    await criarPedidosNosFornecedores(pedido);

    console.log(`[Webhook] Pedido ${numeroPedido} pago (AOA via AppyPay) — pedidos criados nos fornecedores.`);
    res.json({ sucesso: true });
  } catch (erro) { next(erro); }
});

// ---------- Webhook: rastreio do CJ (fornecedor -> agente de carga OU -> cliente) ----------
router.post('/cj-tracking', (req, res, next) => {
  const { numeroPedido, codigoRastreio } = req.body;
  atualizarRastreio1(numeroPedido, 'cj', codigoRastreio, res, next);
});

// ---------- Webhook: rastreio do Buckydrop ----------
router.post('/buckydrop-tracking', (req, res, next) => {
  const { numeroPedido, codigoRastreio } = req.body;
  atualizarRastreio1(numeroPedido, 'buckydrop', codigoRastreio, res, next);
});

async function atualizarRastreio1(numeroPedido, fornecedor, codigoRastreio, res, next) {
  try {
    const pedido = await buscarPedidoPorNumero(numeroPedido);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    const novoEstado = pedido.rota_envio === 'agente_de_carga' ? 'enviado_ao_agente' : 'a_caminho';
    await pool.query('UPDATE pedido_fornecedores SET rastreio1 = $1, estado = $2 WHERE pedido_id = $3 AND fornecedor = $4', [codigoRastreio, novoEstado, pedido.id, fornecedor]);
    await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [novoEstado, pedido.id]);
    res.json({ sucesso: true });
  } catch (erro) { next(erro); }
}

// ---------- Webhook: rastreio do agente de carga (agente -> cliente final, ex: Angola) ----------
router.post('/agente-tracking', async (req, res, next) => {
  try {
    const { numeroPedido, fornecedor, codigoRastreio } = req.body;
    const pedido = await buscarPedidoPorNumero(numeroPedido);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    await pool.query('UPDATE pedido_fornecedores SET rastreio2 = $1, estado = $2 WHERE pedido_id = $3 AND fornecedor = $4', [codigoRastreio, 'a_caminho_destino_final', pedido.id, fornecedor]);
    await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', ['a_caminho_destino_final', pedido.id]);
    console.log(`[Webhook] Agente de carga despachou pedido ${numeroPedido} (${fornecedor}) para o destino final.`);
    res.json({ sucesso: true });
  } catch (erro) { next(erro); }
});

// ---------- Webhook: entrega confirmada ----------
router.post('/entrega-confirmada', async (req, res, next) => {
  try {
    const { numeroPedido } = req.body;
    const pedido = await buscarPedidoPorNumero(numeroPedido);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', ['entregue', pedido.id]);
    await pool.query('UPDATE pedido_fornecedores SET estado = $1 WHERE pedido_id = $2', ['entregue', pedido.id]);
    res.json({ sucesso: true });
  } catch (erro) { next(erro); }
});

module.exports = router;
module.exports.confirmarPagamentoEUR = confirmarPagamentoEUR;
