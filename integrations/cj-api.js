// Integração com o CJ Dropshipping.
//
// Esta versão está em modo SIMULADO (mock): não faz chamadas reais à internet.
// Para ligar à API real do CJ:
//   1. Colocar CJ_API_KEY e CJ_API_SECRET no ficheiro .env
//   2. Substituir o corpo de cada função pela chamada real à API v2.0 do CJ
//      (documentação: https://developers.cjdropshipping.com)
//   3. Manter a mesma assinatura de função para não ter de mexer no resto do código

const CJ_API_KEY = process.env.CJ_API_KEY || null;

async function criarPedido({ pedidoId, itens, moradaEntrega }) {
  if (!CJ_API_KEY) {
    console.log(`[CJ-API][MOCK] A criar pedido ${pedidoId} no CJ com ${itens.length} item(ns) para: ${moradaEntrega.linha1}, ${moradaEntrega.cidade}`);
  }
  // TODO produção: chamar POST /product/order/createOrder da API do CJ
  return {
    sucesso: true,
    idPedidoFornecedor: `CJ-${Math.floor(Math.random() * 900000 + 100000)}`,
    prazoEstimadoDias: '8-14'
  };
}

async function consultarEstoque(idProdutoFornecedor) {
  // TODO produção: chamar GET /product/stock da API do CJ
  return { idProdutoFornecedor, stock: Math.floor(Math.random() * 80 + 5) };
}

async function consultarRastreio(idPedidoFornecedor) {
  // TODO produção: chamar GET /logistic/trackInfo da API do CJ
  return {
    idPedidoFornecedor,
    codigoRastreio: `CJTRACK${Math.floor(Math.random() * 900000)}`,
    estado: 'em_transito'
  };
}

module.exports = { criarPedido, consultarEstoque, consultarRastreio };
