// Integração REAL com a API v2.0 da CJ Dropshipping.
// Documentação oficial: https://developers.cjdropshipping.com/en/api/api2/
//
// Precisa no .env:
//   CJ_API_EMAIL = o e-mail da tua conta CJ
//   CJ_API_KEY   = a API Key gerada em "My CJ" -> "API" -> "Generate"
//
// Sem estas duas variáveis, todas as funções deste ficheiro lançam erro —
// não há modo simulado aqui, é a chamada real à API da CJ.

const BASE_URL = 'https://developers.cjdropshipping.com/api2.0/v1';

let tokenCache = { accessToken: null, refreshToken: null, expiraEm: 0 };

function credenciaisConfiguradas() {
  return Boolean(process.env.CJ_API_EMAIL && process.env.CJ_API_KEY);
}

function exigirCredenciais() {
  if (!credenciaisConfiguradas()) {
    throw new Error('CJ_API_EMAIL / CJ_API_KEY não estão definidos no .env — não é possível chamar a API da CJ.');
  }
}

// ---------- Autenticação (token válido durante ~15 dias, com refresh token) ----------
async function obterAccessToken() {
  exigirCredenciais();

  if (tokenCache.accessToken && Date.now() < tokenCache.expiraEm) {
    return tokenCache.accessToken;
  }

  // Se já temos um refresh token válido, tenta renovar em vez de pedir um novo
  // (a CJ só deixa pedir um accessToken novo de 5 em 5 minutos).
  if (tokenCache.refreshToken) {
    try {
      const resposta = await fetch(`${BASE_URL}/authentication/refreshAccessToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokenCache.refreshToken })
      });
      const dados = await resposta.json();
      if (dados.result) {
        guardarToken(dados.data);
        return tokenCache.accessToken;
      }
    } catch (e) {
      // se falhar o refresh, cai para o login normal abaixo
    }
  }

  const resposta = await fetch(`${BASE_URL}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.CJ_API_EMAIL, apiKey: process.env.CJ_API_KEY })
  });
  const dados = await resposta.json();
  if (!dados.result) {
    throw new Error(`[CJ-API] Falha na autenticação: ${dados.message || 'erro desconhecido'}`);
  }
  guardarToken(dados.data);
  return tokenCache.accessToken;
}

function guardarToken(data) {
  tokenCache.accessToken = data.accessToken;
  tokenCache.refreshToken = data.refreshToken || tokenCache.refreshToken;
  // Renova 1 hora antes de expirar, por segurança.
  const expiryDate = data.accessTokenExpiryDate ? new Date(data.accessTokenExpiryDate).getTime() : Date.now() + 14 * 24 * 60 * 60 * 1000;
  tokenCache.expiraEm = expiryDate - 60 * 60 * 1000;
}

// Wrapper que já injeta o header CJ-Access-Token e trata erros da API de forma uniforme.
async function cjFetch(caminho, opcoes = {}) {
  const token = await obterAccessToken();
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': token,
      ...(opcoes.headers || {})
    }
  });
  const dados = await resposta.json();
  if (!dados.result) {
    throw new Error(`[CJ-API] ${caminho} -> ${dados.message || 'erro desconhecido'} (código ${dados.code})`);
  }
  return dados.data;
}

// ---------- Produtos ----------

// Aceita o ID do produto (pid) ou o link da página do produto na CJ, e devolve
// já no formato que a rota /produtos/importar/cj precisa para pré-preencher o
// formulário do admin (ver routes/produtos.js).
async function buscarProdutoPorIdOuLink(idOuLink) {
  const pid = extrairPidDoLink(idOuLink);
  const dados = await cjFetch(`/product/query?pid=${encodeURIComponent(pid)}`);

  // A CJ devolve as variantes dentro do próprio produto nalgumas versões da
  // API, e à parte (endpoint /product/variant/query) noutras. Tentamos as
  // duas formas para não deixar o admin sem tamanhos/cores.
  let variantes = dados.variants || dados.variantList || [];
  if (!variantes.length) {
    try {
      variantes = await cjFetch(`/product/variant/query?pid=${encodeURIComponent(pid)}`);
    } catch (e) {
      variantes = [];
    }
  }

  const imagens = (dados.productImageSet || dados.productImages || []).filter(Boolean);
  if (dados.productImage && !imagens.includes(dados.productImage)) imagens.unshift(dados.productImage);

  return {
    idFornecedor: pid,
    nome: dados.productNameEn || dados.productName || '',
    descricao: dados.description || dados.productDescriptionEn || '',
    categoria: dados.categoryName || '',
    sku: dados.productSku || '',
    imagemPrincipal: imagens[0] || dados.productImage || '',
    imagens,
    pesoGramas: dados.productWeight || null,
    // A CJ trabalha em USD/CNY consoante a conta — o admin deve rever este
    // valor antes de criar o produto (ver preco_custo_eur na tabela produtos).
    precoCustoEUR: Number(dados.sellPrice || dados.productPrice || 0),
    precoVendaSugeridoEUR: Number(dados.sellPrice || dados.productPrice || 0) * 2.2,
    variantes: (variantes || []).map((v) => ({
      vid: v.vid,
      sku: v.variantSku,
      nomeOpcao: v.variantNameEn || v.variantKey || 'Variante',
      valorOpcao: v.variantKey || v.variantNameEn || v.variantSku,
      precoEUR: Number(v.variantSellPrice || v.sellPrice || 0),
      imagem: v.variantImage || ''
    })),
    bruto: dados // guardado em atributos_cj (jsonb) para depuração futura
  };
}

function extrairPidDoLink(idOuLink) {
  // Aceita tanto um pid puro como um link tipo
  // https://cjdropshipping.com/product/nome-p-04A22450-67F0....html
  const match = String(idOuLink).match(/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/);
  return match ? match[1] : String(idOuLink).trim();
}

// ---------- Pedidos ----------

// itens: [{ idFornecedor (pid), vid?, quantidade }]
// moradaEntrega: { linha1, cidade, codigoPostal, pais, nome, telefone }
async function criarPedido({ pedidoId, itens, moradaEntrega }) {
  const products = [];
  for (const item of itens) {
    let vid = item.vid;
    // Se não sabemos a variante exata, usamos a primeira variante do produto
    // (obrigatório: a CJ encomenda sempre ao nível da variante, nunca do produto "pai").
    if (!vid) {
      const produto = await buscarProdutoPorIdOuLink(item.idFornecedor);
      vid = produto.variantes[0] && produto.variantes[0].vid;
      if (!vid) throw new Error(`[CJ-API] Não foi possível determinar a variante (vid) do produto ${item.idFornecedor}.`);
    }
    products.push({ vid, quantity: item.quantidade });
  }

  const corpo = {
    orderNumber: pedidoId,
    shippingCountryCode: moradaEntrega.pais,
    shippingCountry: moradaEntrega.pais,
    shippingProvince: moradaEntrega.provincia || moradaEntrega.cidade,
    shippingCity: moradaEntrega.cidade,
    shippingAddress: moradaEntrega.linha1,
    shippingCustomerName: moradaEntrega.nome || 'Cliente Lúmina',
    shippingZip: moradaEntrega.codigoPostal || '000000',
    shippingPhone: moradaEntrega.telefone || '',
    remark: `Pedido Lúmina ${pedidoId}`,
    fromCountryCode: process.env.CJ_ARMAZEM_ORIGEM || 'CN',
    logisticName: process.env.CJ_LOGISTICA_PADRAO || 'CJPacket Ordinary',
    houseNumber: moradaEntrega.numeroPorta || '',
    email: moradaEntrega.email || '',
    products
  };

  const idPedidoFornecedor = await cjFetch('/shopping/order/createOrder', {
    method: 'POST',
    body: JSON.stringify(corpo)
  });

  return {
    sucesso: true,
    idPedidoFornecedor, // a CJ devolve o ID do pedido diretamente em "data"
    prazoEstimadoDias: '8-14' // a CJ só dá prazo exato via /logistic/freight depois de escolhida a logística
  };
}

// ---------- Estoque ----------
async function consultarEstoque(idFornecedor) {
  try {
    const produto = await buscarProdutoPorIdOuLink(idFornecedor);
    // Sem vid específico, soma o estoque de todas as variantes.
    let total = 0;
    for (const v of produto.variantes) {
      try {
        const info = await cjFetch(`/product/stock/queryByVid?vid=${encodeURIComponent(v.vid)}`);
        total += Number((info && (info.storageNum || info.stock)) || 0);
      } catch (e) { /* variante sem estoque reportado, ignora */ }
    }
    return { idProdutoFornecedor: idFornecedor, stock: total };
  } catch (erro) {
    console.error(`[CJ-API] Falha ao consultar estoque de ${idFornecedor}:`, erro.message);
    return { idProdutoFornecedor: idFornecedor, stock: null };
  }
}

// ---------- Rastreio ----------
async function consultarRastreio(idPedidoFornecedor) {
  const dados = await cjFetch(`/shopping/order/getOrderDetail?orderId=${encodeURIComponent(idPedidoFornecedor)}`);
  return {
    idPedidoFornecedor,
    // Nome do campo pode variar consoante a versão da API — confirma com uma
    // chamada real e ajusta aqui se necessário (ver logs da resposta bruta).
    codigoRastreio: dados.trackNumber || dados.logisticNo || null,
    estado: dados.orderStatus || dados.status || 'desconhecido'
  };
}

module.exports = {
  credenciaisConfiguradas,
  buscarProdutoPorIdOuLink,
  criarPedido,
  consultarEstoque,
  consultarRastreio
};
