const express = require('express');
const { pool, transacao } = require('../config/db');
const { travarCambioParaPedido } = require('../integrations/cambio');
const { resolverMoradaParaFornecedor } = require('../integrations/roteamento-envio');
const { criarSessaoStripe } = require('../integrations/pagamentos-eur');
const { criarCobranca } = require('../integrations/appypay');

const router = express.Router();

/**
 * POST /api/checkout
 * body: {
 *   itens: [{ produtoId, quantidade }],
 *   moradaEntrega: { linha1, cidade, codigoPostal, pais, telefone, nome },
 *   moeda: "EUR" | "AOA",
 *   telefoneCliente: "+244...",   // obrigatório se moeda = AOA
 *   clienteId
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { itens, moradaEntrega, moeda, telefoneCliente, clienteId } = req.body;

    if (!itens || itens.length === 0) return res.status(400).json({ erro: 'Carrinho vazio.' });
    if (!moradaEntrega || !moradaEntrega.pais) return res.status(400).json({ erro: 'Morada de entrega incompleta.' });

    // 1. Buscar produtos reais e calcular total em EUR
    const ids = itens.map((i) => i.produtoId);
    const { rows: produtos } = await pool.query('SELECT * FROM produtos WHERE id = ANY($1::bigint[])', [ids]);

    const itensResolvidos = [];
    let totalEUR = 0;
    for (const item of itens) {
      const produto = produtos.find((p) => String(p.id) === String(item.produtoId));
      if (!produto) return res.status(404).json({ erro: `Produto ${item.produtoId} não encontrado.` });
      const subtotal = Number(produto.preco_venda_eur) * item.quantidade;
      totalEUR += subtotal;
      itensResolvidos.push({
        produtoId: produto.id, nome: produto.nome, fornecedor: produto.fornecedor,
        idFornecedor: produto.id_fornecedor, quantidade: item.quantidade, precoUnitarioEUR: Number(produto.preco_venda_eur)
      });
    }

    // 2. Decidir rota de envio: direto ou via agente de carga (ex: Angola)
    const rota = resolverMoradaParaFornecedor(moradaEntrega.pais, moradaEntrega);

    // 3. Se pagamento em AOA, travar câmbio agora (fica gravado no pedido, não muda depois)
    let infoCambio = null;
    if (moeda === 'AOA') {
      if (!telefoneCliente) return res.status(400).json({ erro: 'Telefone é obrigatório para pagamento em Kwanza.' });
      infoCambio = await travarCambioParaPedido(totalEUR);
    }

    // 4. Gravar o pedido + itens numa transação
    const pedido = await transacao(async (cliente) => {
      const { rows } = await cliente.query(`
        INSERT INTO pedidos (
          cliente_id, total_eur, moeda,
          cambio_taxa_usada, cambio_valor_eur, cambio_valor_aoa, cambio_data,
          entrega_linha1, entrega_linha2, entrega_cidade, entrega_codigo_postal, entrega_pais, entrega_telefone,
          rota_envio,
          fornecedor_morada_nome, fornecedor_morada_linha1, fornecedor_morada_cidade,
          fornecedor_morada_cp, fornecedor_morada_pais, fornecedor_morada_telefone, fornecedor_morada_ref,
          estado
        ) VALUES ($1,$2,$3, $4,$5,$6,$7, $8,$9,$10,$11,$12,$13, $14, $15,$16,$17,$18,$19,$20,$21, 'novo')
        RETURNING id, numero
      `, [
        clienteId || null, totalEUR, moeda,
        infoCambio ? infoCambio.taxaUsada : null, infoCambio ? infoCambio.valorEUR : null, infoCambio ? infoCambio.valorAOA : null, infoCambio ? infoCambio.dataCambio : null,
        moradaEntrega.linha1, moradaEntrega.linha2 || null, moradaEntrega.cidade, moradaEntrega.codigoPostal || null, moradaEntrega.pais, moradaEntrega.telefone || null,
        rota.tipo,
        rota.morada.nome || null, rota.morada.linha1 || null, rota.morada.cidade || null,
        rota.morada.codigoPostal || null, rota.morada.pais || null, rota.morada.telefone || null, rota.morada.referenciaInterna || null
      ]);

      const pedidoRow = rows[0];
      for (const item of itensResolvidos) {
        await cliente.query(`
          INSERT INTO pedido_itens (pedido_id, produto_id, nome_produto, fornecedor, quantidade, preco_unitario_eur)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [pedidoRow.id, item.produtoId, item.nome, item.fornecedor, item.quantidade, item.precoUnitarioEUR]);
      }
      return pedidoRow;
    });

    // 5. Iniciar o pagamento na forma escolhida (chamadas reais)
    let dadosPagamento;
    let registoPagamento;
    if (moeda === 'AOA') {
      dadosPagamento = await criarCobranca({ pedidoId: pedido.numero, valorAOA: infoCambio.valorAOA, telefoneCliente });
      registoPagamento = { metodo: 'appypay', id_cobranca: dadosPagamento.idCobranca, estado: 'pendente' };
    } else {
      dadosPagamento = await criarSessaoStripe({ pedidoId: pedido.numero, valorEUR: totalEUR, rotaEnvio: rota.tipo });
      registoPagamento = { metodo: 'stripe', id_cobranca: dadosPagamento.idSessaoStripe, url_checkout: dadosPagamento.urlCheckout, estado: 'pendente' };
    }

    await pool.query(`
      INSERT INTO pedido_pagamentos (pedido_id, metodo, estado, id_cobranca, url_checkout)
      VALUES ($1,$2,$3,$4,$5)
    `, [pedido.id, registoPagamento.metodo, registoPagamento.estado, registoPagamento.id_cobranca || null, registoPagamento.url_checkout || null]);

    res.status(201).json({
      numeroPedido: pedido.numero,
      totalEUR,
      totalAOA: infoCambio ? infoCambio.valorAOA : null,
      rotaEnvio: rota.tipo,
      pagamento: {
        metodo: registoPagamento.metodo,
        estado: registoPagamento.estado,
        idCobranca: registoPagamento.id_cobranca,
        urlCheckout: registoPagamento.url_checkout || null
      }
    });
  } catch (erro) { next(erro); }
});

module.exports = router;
