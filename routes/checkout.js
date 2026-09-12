const express = require('express');
const { ler, guardar, proximoNumeroPedido } = require('../config/db');
const { travarCambioParaPedido } = require('../integrations/cambio');
const { resolverMoradaParaFornecedor } = require('../integrations/roteamento-envio');
const { criarSessaoStripe } = require('../integrations/pagamentos-eur');
const { criarCobranca } = require('../integrations/appypay');

const router = express.Router();

/**
 * POST /api/checkout
 * body: {
 *   itens: [{ produtoId, quantidade }],
 *   moradaEntrega: { linha1, cidade, codigoPostal, pais },  // pais em ISO2, ex: "AO", "PT", "US"
 *   moeda: "EUR" | "AOA",
 *   telefoneCliente: "+244..."   // obrigatório se moeda = AOA
 * }
 */
router.post('/', async (req, res) => {
  const { itens, moradaEntrega, moeda, telefoneCliente, clienteId } = req.body;

  if (!itens || itens.length === 0) return res.status(400).json({ erro: 'Carrinho vazio.' });
  if (!moradaEntrega || !moradaEntrega.pais) return res.status(400).json({ erro: 'Morada de entrega incompleta.' });

  const db = ler();

  // 1. Calcular itens e total em EUR (moeda base do catálogo)
  const itensResolvidos = [];
  let totalEUR = 0;
  for (const item of itens) {
    const produto = db.produtos.find(p => p.id === item.produtoId);
    if (!produto) return res.status(404).json({ erro: `Produto ${item.produtoId} não encontrado.` });
    const subtotal = produto.precoVendaEUR * item.quantidade;
    totalEUR += subtotal;
    itensResolvidos.push({
      produtoId: produto.id, nome: produto.nome, fornecedor: produto.fornecedor,
      quantidade: item.quantidade, precoUnitarioEUR: produto.precoVendaEUR
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

  // 4. Criar o pedido em estado "novo" (aguarda confirmação de pagamento)
  const numeroPedido = proximoNumeroPedido();
  const pedido = {
    id: numeroPedido,
    clienteId: clienteId || null,
    itens: itensResolvidos,
    totalEUR,
    moeda,
    cambio: infoCambio, // null se pagou em EUR
    moradaEntregaFinal: moradaEntrega,
    rotaEnvio: rota.tipo, // "direto" | "agente_de_carga"
    moradaEnviadaAoFornecedor: rota.morada,
    estado: 'novo', // novo -> pago -> processando -> enviado_fornecedor -> [enviado_agente] -> a_caminho -> entregue
    pagamento: { estado: 'pendente' },
    fornecedores: {}, // preenchido depois de pago, por fornecedor: { idPedidoFornecedor, rastreio1, rastreio2, estado }
    criadoEm: new Date().toISOString()
  };
  db.pedidos.push(pedido);
  guardar(db);

  // 5. Iniciar o pagamento na forma escolhida
  let dadosPagamento;
  if (moeda === 'AOA') {
    dadosPagamento = await criarCobranca({
      pedidoId: numeroPedido,
      valorAOA: infoCambio.valorAOA,
      telefoneCliente
    });
    pedido.pagamento = { metodo: 'appypay', idCobranca: dadosPagamento.idCobranca, estado: 'pendente' };
  } else {
    dadosPagamento = await criarSessaoStripe({ pedidoId: numeroPedido, valorEUR: totalEUR });
    pedido.pagamento = { metodo: 'stripe', urlCheckout: dadosPagamento.urlCheckout, estado: 'pendente' };
  }
  guardar(db);

  res.status(201).json({
    numeroPedido,
    totalEUR,
    totalAOA: infoCambio ? infoCambio.valorAOA : null,
    rotaEnvio: rota.tipo,
    pagamento: pedido.pagamento
  });
});

module.exports = router;
