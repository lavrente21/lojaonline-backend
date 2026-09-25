// Integração com o CJ Dropshipping — API v2.0 (real).
//
// Requer CJ_API_KEY no .env — é a "API Key" gerada em:
//   CJ > Apps > instalar a app "API" > Get API Key
// Documentação: https://developers.cjdropshipping.com
//
// O que já está LIGADO À API REAL:
//   - buscarProdutoPorId()  → GET /product/query (importar produto por ID/link)
//
// O que continua em modo SIMULADO (fora do pedido atual, não mexido):
//   - criarPedido(), consultarEstoque(), consultarRastreio()
//   Para ligar estas à API real, seguir os TODOs abaixo — a base de
//   autenticação (obterAccessToken) já está pronta e pode ser reutilizada.

const { converterUSDparaEUR } = require('./cambio');

const CJ_API_KEY = process.env.CJ_API_KEY || null;
const CJ_BASE_URL = 'https://developers.cjdropshipping.com/api2.0/v1';

// ---------- Autenticação: obtém e guarda em cache o access token da CJ ----------
// O token da CJ dura até 180 dias; aqui basta pedir um novo quando o que
// temos em memória estiver a menos de 1 dia de expirar (ou não existir ainda).
let tokenCache = { accessToken: null, refreshToken: null, expiraEm: 0 };

async function obterAccessToken() {
  if (!CJ_API_KEY) {
    throw new Error('CJ_API_KEY não está definida no .env. Vai a CJ > Apps > API para gerar a chave.');
  }

  const UM_DIA_MS = 24 * 60 * 60 * 1000;
  if (tokenCache.accessToken && tokenCache.expiraEm - Date.now() > UM_DIA_MS) {
    return tokenCache.accessToken;
  }

  const pedidoNovo = () => fetch(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: CJ_API_KEY })
  });
  const pedidoRefresh = () => fetch(`${CJ_BASE_URL}/authentication/refreshAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokenCache.refreshToken })
  });

  const resposta = await (tokenCache.refreshToken ? pedidoRefresh() : pedidoNovo());
  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok || !dados.result) {
    // Se o refresh falhou (ex: expirou), tenta uma vez do zero antes de desistir.
    if (tokenCache.refreshToken) {
      tokenCache = { accessToken: null, refreshToken: null, expiraEm: 0 };
      return obterAccessToken();
    }
    throw new Error(`Falha na autenticação com a CJ: ${dados.message || resposta.statusText}`);
  }

  tokenCache = {
    accessToken: dados.data.accessToken,
    refreshToken: dados.data.refreshToken,
    expiraEm: new Date(dados.data.accessTokenExpiryDate).getTime()
  };
  return tokenCache.accessToken;
}

// ---------- Extrai o PID da CJ a partir de um ID direto ou de um link de produto ----------
// Aceita:
//   - o próprio ID (ex: "04A22450-67F0-4617-A132-E7AE7F8963B0" ou um ID numérico longo)
//   - um link com "?pid=..." ou "&pid=..."
//   - um link do tipo .../product/nome-do-produto-p-<id>.html
// Se não reconhecer nenhum padrão, devolve o texto tal como veio e deixa a
// própria API da CJ dizer se é válido ou não.
function extrairPid(idOuLink) {
  const valor = (idOuLink || '').trim();
  if (!valor) return null;

  if (!valor.startsWith('http')) return valor; // já parece ser o ID em si

  const porQuery = valor.match(/[?&]pid=([^&]+)/i);
  if (porQuery) return decodeURIComponent(porQuery[1]);

  const porSufixoP = valor.match(/-p-([0-9A-Za-z-]+)\.html/i);
  if (porSufixoP) return porSufixoP[1];

  const porSegmento = valor.match(/\/([0-9A-Za-z-]{16,})(?:[/?#]|$)/);
  if (porSegmento) return porSegmento[1];

  return valor;
}

// ---------- Buscar um produto na CJ pelo ID ou link, para importar para a loja ----------
async function buscarProdutoPorId(idOuLink) {
  const pid = extrairPid(idOuLink);
  if (!pid) throw new Error('ID ou link do produto da CJ em falta.');

  const token = await obterAccessToken();
  const resposta = await fetch(`${CJ_BASE_URL}/product/query?pid=${encodeURIComponent(pid)}`, {
    headers: { 'CJ-Access-Token': token }
  });
  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok || !dados.result) {
    throw new Error(`Produto não encontrado na CJ: ${dados.message || resposta.statusText} (id/link usado: "${idOuLink}")`);
  }

  const p = dados.data;
  const precoCustoUSD = Number(p.sellPrice) || 0;
  const precoCustoEUR = await converterUSDparaEUR(precoCustoUSD);
  // Margem de sugestão só para pré-preencher o formulário — o admin pode
  // (e deve) ajustar o preço de venda antes de gravar o produto.
  const precoVendaSugeridoEUR = Math.round(precoCustoEUR * 2.3 * 100) / 100;

  return {
    idFornecedor: p.pid,
    sku: p.productSku || '',
    nome: p.productNameEn || p.productName || '',
    categoria: (p.categoryName || '').split('/').pop().trim(),
    descricao: p.description || '',
    precoCustoUSD,
    precoCustoEUR,
    precoVendaSugeridoEUR,
    imagemPrincipal: p.bigImage || '',
    imagens: Array.isArray(p.productImageSet) && p.productImageSet.length ? p.productImageSet : (p.bigImage ? [p.bigImage] : []),
    variantes: (p.variants || []).map(v => ({
      variantSku: v.variantSku,
      opcoes: v.variantKey,
      precoUSD: v.variantSellPrice,
      imagem: v.variantImage || null
    }))
  };
}

// ---------- Continuam em modo SIMULADO (mock) — fora do âmbito deste pedido ----------

async function criarPedido({ pedidoId, itens, moradaEntrega }) {
  if (!CJ_API_KEY) {
    console.log(`[CJ-API][MOCK] A criar pedido ${pedidoId} no CJ com ${itens.length} item(ns) para: ${moradaEntrega.linha1}, ${moradaEntrega.cidade}`);
  }
  // TODO produção: chamar POST /shopping/order/batchCreateOrder da API do CJ
  return {
    sucesso: true,
    idPedidoFornecedor: `CJ-${Math.floor(Math.random() * 900000 + 100000)}`,
    prazoEstimadoDias: '8-14'
  };
}

async function consultarEstoque(idProdutoFornecedor) {
  // TODO produção: chamar GET /product/stock/queryByVid da API do CJ
  return { idProdutoFornecedor, stock: Math.floor(Math.random() * 80 + 5) };
}

async function consultarRastreio(idPedidoFornecedor) {
  // TODO produção: chamar GET /logistic/getTrackInfo da API do CJ
  return {
    idPedidoFornecedor,
    codigoRastreio: `CJTRACK${Math.floor(Math.random() * 900000)}`,
    estado: 'em_transito'
  };
}

module.exports = {
  buscarProdutoPorId,
  extrairPid,
  obterAccessToken,
  criarPedido,
  consultarEstoque,
  consultarRastreio
};
