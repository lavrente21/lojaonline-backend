// Integração REAL com o AppyPay (gateway de pagamentos angolano — Multicaixa
// Express, referência, etc.). Usa o fluxo OAuth2 "client_credentials" que é
// o documentado/usado pelos SDKs do AppyPay.
//
// IMPORTANTE: a AppyPay não tem documentação pública aberta — precisas de ir
// à tua área de developer/parceiro na AppyPay (a mesma de onde tiraste a
// referência no README original: "o utilizador já tem esta API pronta") e
// confirmar 2 coisas contra o Postman/Swagger que te deram:
//   1. O(s) ID(s) de "paymentMethod" da tua conta (GPO Express, Referência, QR)
//   2. Os nomes exatos dos campos no corpo do POST de criação de cobrança
//      (o corpo abaixo segue o padrão mais comum: merchantTransactionId,
//      amount, currency, paymentMethod, description)
//
// .env necessário:
//   APPYPAY_TOKEN_URL   (ex: https://auth.appypay.co.ao/connect/token)
//   APPYPAY_BASE_URL    (ex: https://gwy-api.appypay.co.ao/v2.0)
//   APPYPAY_CLIENT_ID
//   APPYPAY_CLIENT_SECRET
//   APPYPAY_RESOURCE            (o "resource"/"scope" que a AppyPay te deu)
//   APPYPAY_PAYMENT_METHOD_ID   (ID do método "Multicaixa Express" na tua conta)

let tokenCache = { accessToken: null, expiraEm: 0 };

function credenciaisConfiguradas() {
  return Boolean(
    process.env.APPYPAY_TOKEN_URL &&
    process.env.APPYPAY_BASE_URL &&
    process.env.APPYPAY_CLIENT_ID &&
    process.env.APPYPAY_CLIENT_SECRET
  );
}

function exigirCredenciais() {
  if (!credenciaisConfiguradas()) {
    throw new Error('Faltam variáveis APPYPAY_* no .env — não é possível chamar o AppyPay.');
  }
}

async function obterAccessToken() {
  exigirCredenciais();
  if (tokenCache.accessToken && Date.now() < tokenCache.expiraEm) {
    return tokenCache.accessToken;
  }

  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.APPYPAY_CLIENT_ID,
    client_secret: process.env.APPYPAY_CLIENT_SECRET,
    resource: process.env.APPYPAY_RESOURCE || ''
  });

  const resposta = await fetch(process.env.APPYPAY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo
  });
  const dados = await resposta.json();
  if (!resposta.ok || !dados.access_token) {
    throw new Error(`[AppyPay] Falha na autenticação OAuth2: ${dados.error_description || dados.error || resposta.status}`);
  }
  tokenCache.accessToken = dados.access_token;
  tokenCache.expiraEm = Date.now() + (Number(dados.expires_in || 3300) * 1000);
  return tokenCache.accessToken;
}

// Cria uma cobrança em Kwanza via Multicaixa Express. O cliente recebe um
// pedido de pagamento diretamente na app Multicaixa Express (push) e
// confirma lá — a confirmação chega ao nosso backend pelo webhook
// (ver routes/webhooks.js -> /webhooks/pagamento-aoa-confirmado).
async function criarCobranca({ pedidoId, valorAOA, telefoneCliente }) {
  const token = await obterAccessToken();

  const resposta = await fetch(`${process.env.APPYPAY_BASE_URL}/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      merchantTransactionId: pedidoId,
      amount: valorAOA,
      currency: 'AOA',
      paymentMethod: process.env.APPYPAY_PAYMENT_METHOD_ID,
      mobile: telefoneCliente,
      description: `Pedido Lúmina ${pedidoId}`
    })
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`[AppyPay] Falha ao criar cobrança: ${dados.message || dados.error || resposta.status}`);
  }

  return {
    sucesso: true,
    idCobranca: dados.id || dados.chargeId || dados.reference,
    estado: 'pendente' // muda para "pago" via webhook quando o cliente confirmar no telemóvel
  };
}

async function consultarEstadoCobranca(idCobranca) {
  const token = await obterAccessToken();
  const resposta = await fetch(`${process.env.APPYPAY_BASE_URL}/charges/${encodeURIComponent(idCobranca)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const dados = await resposta.json();
  return { idCobranca, estado: dados.status || dados.state || 'desconhecido' };
}

module.exports = { credenciaisConfiguradas, criarCobranca, consultarEstadoCobranca };
