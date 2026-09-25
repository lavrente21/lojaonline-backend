// Módulo de câmbio.
//
// IMPORTANTE: a taxa abaixo é um valor fixo de exemplo. Em produção, substituir
// `obterTaxaAtual()` por uma chamada a uma fonte de câmbio real (ex: API do
// Banco Nacional de Angola, ou um provedor tipo exchangerate.host), e considerar
// cache de alguns minutos para não pedir a taxa em cada checkout.

const TAXA_EXEMPLO_AOA_POR_EUR = 1100; // 1 EUR ≈ 1100 AOA (AJUSTAR com taxa real)
const TAXA_EXEMPLO_EUR_POR_USD = 0.92; // 1 USD ≈ 0.92 EUR (AJUSTAR com taxa real)

async function obterTaxaAtual() {
  // TODO produção: chamar fonte de câmbio real aqui.
  return TAXA_EXEMPLO_AOA_POR_EUR;
}

// Usado para converter preços de fornecedores que vêm em USD (ex: CJ Dropshipping)
// para EUR, ao importar um produto. Mesma nota do TODO acima: trocar por uma
// fonte de câmbio real antes de produção.
async function converterUSDparaEUR(valorUSD) {
  return Math.round(valorUSD * TAXA_EXEMPLO_EUR_POR_USD * 100) / 100;
}

async function converterEURparaAOA(valorEUR) {
  const taxa = await obterTaxaAtual();
  return Math.round(valorEUR * taxa * 100) / 100;
}

// Trava a taxa usada no pedido — guardada no próprio pedido para nunca mudar depois.
async function travarCambioParaPedido(valorEUR) {
  const taxa = await obterTaxaAtual();
  return {
    taxaUsada: taxa,
    valorEUR,
    valorAOA: Math.round(valorEUR * taxa * 100) / 100,
    dataCambio: new Date().toISOString()
  };
}

module.exports = { obterTaxaAtual, converterEURparaAOA, converterUSDparaEUR, travarCambioParaPedido };
