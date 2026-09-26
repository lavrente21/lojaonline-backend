const express = require('express');
const { pool } = require('../config/db');
const { exigirAutenticacao } = require('../middleware/auth');

const router = express.Router();

async function montarFornecedores(pedidoId) {
  const { rows } = await pool.query('SELECT * FROM pedido_fornecedores WHERE pedido_id = $1', [pedidoId]);
  const objeto = {};
  for (const f of rows) {
    objeto[f.fornecedor] = {
      idPedidoFornecedor: f.id_pedido_fornecedor,
      prazoEstimadoDias: f.prazo_estimado_dias,
      rastreio1: f.rastreio1,
      rastreio2: f.rastreio2,
      estado: f.estado
    };
  }
  return objeto;
}

async function montarPedidoCompleto(row) {
  const [{ rows: itens }, fornecedores, { rows: pagamentoRows }] = await Promise.all([
    pool.query('SELECT * FROM pedido_itens WHERE pedido_id = $1', [row.id]),
    montarFornecedores(row.id),
    pool.query('SELECT * FROM pedido_pagamentos WHERE pedido_id = $1', [row.id])
  ]);
  const pagamento = pagamentoRows[0];

  return {
    id: row.numero,
    clienteId: row.cliente_id ? String(row.cliente_id) : null,
    itens: itens.map((i) => ({
      produtoId: i.produto_id ? String(i.produto_id) : null,
      nome: i.nome_produto,
      fornecedor: i.fornecedor,
      quantidade: i.quantidade,
      precoUnitarioEUR: Number(i.preco_unitario_eur)
    })),
    totalEUR: Number(row.total_eur),
    moeda: row.moeda,
    cambio: row.cambio_taxa_usada ? {
      taxaUsada: Number(row.cambio_taxa_usada),
      valorEUR: Number(row.cambio_valor_eur),
      valorAOA: Number(row.cambio_valor_aoa),
      dataCambio: row.cambio_data
    } : null,
    moradaEntregaFinal: {
      linha1: row.entrega_linha1, linha2: row.entrega_linha2, cidade: row.entrega_cidade,
      codigoPostal: row.entrega_codigo_postal, pais: row.entrega_pais, telefone: row.entrega_telefone
    },
    rotaEnvio: row.rota_envio,
    moradaEnviadaAoFornecedor: {
      nome: row.fornecedor_morada_nome, linha1: row.fornecedor_morada_linha1, cidade: row.fornecedor_morada_cidade,
      codigoPostal: row.fornecedor_morada_cp, pais: row.fornecedor_morada_pais, telefone: row.fornecedor_morada_telefone,
      referenciaInterna: row.fornecedor_morada_ref
    },
    estado: row.estado,
    pagamento: pagamento ? {
      metodo: pagamento.metodo, estado: pagamento.estado, idCobranca: pagamento.id_cobranca,
      idCobrancaConfirmada: pagamento.id_cobranca_confirmada, urlCheckout: pagamento.url_checkout
    } : null,
    fornecedores,
    criadoEm: row.criado_em
  };
}

// ---------- Público: rastrear pedido por número (sem precisar de login) ----------
router.get('/rastrear/:numeroPedido', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pedidos WHERE numero = $1', [req.params.numeroPedido]);
    if (!rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const fornecedores = await montarFornecedores(rows[0].id);
    res.json({ numeroPedido: rows[0].numero, estado: rows[0].estado, rotaEnvio: rows[0].rota_envio, fornecedores });
  } catch (erro) { next(erro); }
});

// ---------- Cliente: ver os seus próprios pedidos ----------
router.get('/meus', exigirAutenticacao('cliente'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pedidos WHERE cliente_id = $1 ORDER BY criado_em DESC', [req.utilizador.id]);
    const pedidos = await Promise.all(rows.map(montarPedidoCompleto));
    res.json(pedidos);
  } catch (erro) { next(erro); }
});

// ---------- Admin: listar todos os pedidos ----------
router.get('/', exigirAutenticacao('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT 200');
    const pedidos = await Promise.all(rows.map(montarPedidoCompleto));
    res.json(pedidos);
  } catch (erro) { next(erro); }
});

// ---------- Admin: ver detalhe de um pedido ----------
router.get('/:numeroPedido', exigirAutenticacao('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pedidos WHERE numero = $1', [req.params.numeroPedido]);
    if (!rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(await montarPedidoCompleto(rows[0]));
  } catch (erro) { next(erro); }
});

// ---------- Admin: atualizar manualmente o estado de um sub-pedido (exceções) ----------
router.put('/:numeroPedido/fornecedor/:fornecedor', exigirAutenticacao('admin'), async (req, res, next) => {
  try {
    const { rows: pedidoRows } = await pool.query('SELECT id FROM pedidos WHERE numero = $1', [req.params.numeroPedido]);
    if (!pedidoRows[0]) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    const mapaColunas = { idPedidoFornecedor: 'id_pedido_fornecedor', prazoEstimadoDias: 'prazo_estimado_dias', rastreio1: 'rastreio1', rastreio2: 'rastreio2', estado: 'estado' };
    const sets = [];
    const valores = [];
    let i = 1;
    for (const [chaveJs, coluna] of Object.entries(mapaColunas)) {
      if (req.body[chaveJs] !== undefined) { sets.push(`${coluna} = $${i++}`); valores.push(req.body[chaveJs]); }
    }
    if (!sets.length) return res.status(400).json({ erro: 'Nada para atualizar.' });
    valores.push(pedidoRows[0].id, req.params.fornecedor);

    const { rows } = await pool.query(
      `UPDATE pedido_fornecedores SET ${sets.join(', ')} WHERE pedido_id = $${i++} AND fornecedor = $${i} RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Fornecedor não encontrado neste pedido.' });
    res.json({
      idPedidoFornecedor: rows[0].id_pedido_fornecedor, prazoEstimadoDias: rows[0].prazo_estimado_dias,
      rastreio1: rows[0].rastreio1, rastreio2: rows[0].rastreio2, estado: rows[0].estado
    });
  } catch (erro) { next(erro); }
});

module.exports = router;
