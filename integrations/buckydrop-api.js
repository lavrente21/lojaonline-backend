// Integração com o Buckydrop.
//
// Modo SIMULADO (mock) — ver nota igual em cj-api.js.
// Para ligar à API real: colocar BUCKYDROP_API_KEY no .env e confirmar os
// endpoints exatos com o suporte do Buckydrop (documentação pública é mais
// focada em apps prontas para Shopify/WooCommerce do que em API custom).

const BUCKYDROP_API_KEY = process.env.BUCKYDROP_API_KEY || null;

async function criarPedido({ pedidoId, itens, moradaEntrega }) {
  if (!BUCKYDROP_API_KEY) {
    console.log(`[Buckydrop-API][MOCK] A criar pedido ${pedidoId} no Buckydrop com ${itens.length} item(ns) para: ${moradaEntrega.linha1}, ${moradaEntrega.cidade}`);
  }
  // TODO produção: chamar o endpoint real de criação de pedido do Buckydrop
  return {
    sucesso: true,
    idPedidoFornecedor: `BKY-${Math.floor(Math.random() * 900000 + 100000)}`,
    prazoEstimadoDias: '10-18'
  };
}

async function consultarRastreio(idPedidoFornecedor) {
  // TODO produção: chamar o endpoint real de rastreio do Buckydrop
  return {
    idPedidoFornecedor,
    codigoRastreio: `BKYTRACK${Math.floor(Math.random() * 900000)}`,
    estado: 'em_transito'
  };
}

module.exports = { criarPedido, consultarRastreio };
