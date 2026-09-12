// Integração com a API de pagamento em Kwanza (AppyPay / Multicaixa Express).
//
// O utilizador já tem esta API pronta — este ficheiro é o ponto único de
// ligação a ela. Substituir APPYPAY_API_KEY no .env pela chave real, e o
// corpo de `criarCobranca` pela chamada HTTP real à API do AppyPay.
//
// Fluxo típico do AppyPay: cria-se uma "cobrança" (charge) em AOA, o cliente
// confirma no telemóvel via Multicaixa Express, e a confirmação chega por
// webhook (ver routes/webhooks.js -> /webhooks/pagamento-aoa-confirmado).

const APPYPAY_API_KEY = process.env.APPYPAY_API_KEY || null;

async function criarCobranca({ pedidoId, valorAOA, telefoneCliente }) {
  if (!APPYPAY_API_KEY) {
    console.log(`[AppyPay][MOCK] A criar cobrança de ${valorAOA} AOA para o pedido ${pedidoId}, telefone ${telefoneCliente}`);
  }
  // TODO produção: chamar a API real do AppyPay para gerar a cobrança
  // (normalmente devolve um ID de referência que o cliente confirma na app MCX Express)
  return {
    sucesso: true,
    idCobranca: `APPY-${Math.floor(Math.random() * 900000)}`,
    estado: 'pendente' // muda para "pago" via webhook
  };
}

async function consultarEstadoCobranca(idCobranca) {
  // TODO produção: consultar estado real na API do AppyPay
  return { idCobranca, estado: 'pago' };
}

module.exports = { criarCobranca, consultarEstadoCobranca };
