// Módulo de câmbio — AGORA REAL.
//
// Fonte: open.er-api.com (ExchangeRate-API, ponto de acesso aberto, sem
// necessidade de chave, atualizado uma vez por dia). Se quiseres uma fonte
// com atualizações mais frequentes (ex: de hora a hora), troca por um plano
// pago do mesmo fornecedor (https://www.exchangerate-api.com) e define
// EXCHANGE_API_KEY no .env — o código abaixo já usa essa chave se existir.
//
// Se a chamada falhar (sem internet, fornecedor em baixo, etc.), cai para
// uma taxa fixa de segurança (TAXA_RESERVA) para o checkout nunca partir.

const TAXA_RESERVA_AOA_POR_EUR = Number(process.env.TAXA_RESERVA_AOA_POR_EUR || 1100);
const CACHE_MS = 10 * 60 * 1000; // 10 minutos — evita pedir a taxa em todos os checkouts

let cache = { taxa: null, expiraEm: 0 };

async function obterTaxaAtual() {
  if (cache.taxa && Date.now() < cache.expiraEm) {
    return cache.taxa;
  }

  const url = process.env.EXCHANGE_API_KEY
    ? `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_API_KEY}/latest/EUR`
    : 'https://open.er-api.com/v6/latest/EUR';

  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados = await resposta.json();

    const taxa = process.env.EXCHANGE_API_KEY
      ? dados.conversion_rates && dados.conversion_rates.AOA
      : dados.rates && dados.rates.AOA;

    if (!taxa) throw new Error('A resposta não trouxe a taxa AOA.');

    cache = { taxa, expiraEm: Date.now() + CACHE_MS };
    return taxa;
  } catch (erro) {
    console.error('[Câmbio] Falha ao obter taxa real, a usar taxa de reserva:', erro.message);
    return TAXA_RESERVA_AOA_POR_EUR;
  }
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

module.exports = { obterTaxaAtual, converterEURparaAOA, travarCambioParaPedido };
