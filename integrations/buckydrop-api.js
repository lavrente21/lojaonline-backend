// Integração com o Buckydrop.
//
// AVISO IMPORTANTE (diferente das outras integrações deste projeto):
// a Buckydrop, ao contrário da CJ, NÃO tem uma API pública com documentação
// aberta — o acesso é dado caso a caso pelo suporte deles, normalmente
// depois de pedires "API custom" à tua account manager. Por isso este
// ficheiro já faz chamadas HTTP reais (não é mock), mas os CAMINHOS exatos
// dos endpoints (abaixo) são um placeholder até teres a documentação deles
// na mão — troca BUCKYDROP_ENDPOINT_CRIAR_PEDIDO e
// BUCKYDROP_ENDPOINT_RASTREIO no .env pelos que o suporte te confirmar.
//
// .env necessário:
//   BUCKYDROP_API_BASE_URL          (ex: https://api.buckydrop.com)
//   BUCKYDROP_API_KEY
//   BUCKYDROP_ENDPOINT_CRIAR_PEDIDO (ex: /openapi/order/create)
//   BUCKYDROP_ENDPOINT_RASTREIO     (ex: /openapi/order/tracking)

function credenciaisConfiguradas() {
  return Boolean(process.env.BUCKYDROP_API_BASE_URL && process.env.BUCKYDROP_API_KEY);
}

function exigirCredenciais() {
  if (!credenciaisConfiguradas()) {
    throw new Error('BUCKYDROP_API_BASE_URL / BUCKYDROP_API_KEY não estão definidos no .env.');
  }
}

async function bkFetch(caminho, opcoes = {}) {
  exigirCredenciais();
  const resposta = await fetch(`${process.env.BUCKYDROP_API_BASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.BUCKYDROP_API_KEY}`,
      ...(opcoes.headers || {})
    }
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(`[Buckydrop-API] ${caminho} -> HTTP ${resposta.status}: ${dados.message || 'erro desconhecido'}`);
  }
  return dados;
}

async function criarPedido({ pedidoId, itens, moradaEntrega }) {
  const caminho = process.env.BUCKYDROP_ENDPOINT_CRIAR_PEDIDO || '/openapi/order/create';
  const dados = await bkFetch(caminho, {
    method: 'POST',
    body: JSON.stringify({
      outOrderNo: pedidoId,
      items: itens.map((i) => ({ sku: i.idFornecedor, quantity: i.quantidade })),
      receiver: {
        name: moradaEntrega.nome || 'Cliente Lúmina',
        address1: moradaEntrega.linha1,
        city: moradaEntrega.cidade,
        zip: moradaEntrega.codigoPostal || '',
        country: moradaEntrega.pais,
        phone: moradaEntrega.telefone || ''
      }
    })
  });

  return {
    sucesso: true,
    idPedidoFornecedor: dados.orderId || dados.data?.orderId || null,
    prazoEstimadoDias: dados.estimatedDays || '10-18'
  };
}

async function consultarRastreio(idPedidoFornecedor) {
  const caminho = process.env.BUCKYDROP_ENDPOINT_RASTREIO || '/openapi/order/tracking';
  const dados = await bkFetch(`${caminho}?orderId=${encodeURIComponent(idPedidoFornecedor)}`);
  return {
    idPedidoFornecedor,
    codigoRastreio: dados.trackingNumber || dados.data?.trackingNumber || null,
    estado: dados.status || 'em_transito'
  };
}

module.exports = { credenciaisConfiguradas, criarPedido, consultarRastreio };
