// Motor de decisão de rota de envio.
//
// Regra de negócio central: se o destino final for Angola (ou outro país
// não coberto diretamente pelo CJ/Buckydrop), o pedido é criado no fornecedor
// com a MORADA DO AGENTE DE CARGA como destino — não a morada do cliente.
// O agente depois consolida e reenvia para o destino final.
//
// AJUSTAR: substituir os dados do agente de carga pelos reais, e a lista
// PAISES_COM_ENVIO_DIRETO pelos países que o CJ/Buckydrop cobrem de facto.

const PAISES_COM_ENVIO_DIRETO = [
  'PT', 'ES', 'FR', 'DE', 'IT', 'NL', 'BE', 'US', 'GB', 'IE'
];

const MORADA_AGENTE_CARGA = {
  nome: 'Agente de Carga — a preencher',
  linha1: 'Morada do armazém do agente (a confirmar)',
  cidade: 'A confirmar',
  codigoPostal: '000000',
  pais: 'A confirmar', // ex: 'US' ou 'PT', consoante o agente escolhido
  telefone: '+000000000',
  referenciaInterna: 'LUMINA-CONSOLIDACAO' // referência para o agente identificar o pacote
};

function precisaDeAgenteDeCarga(paisDestinoFinal) {
  return !PAISES_COM_ENVIO_DIRETO.includes(paisDestinoFinal.toUpperCase());
}

// Devolve a morada que deve ser enviada ao fornecedor (CJ/Buckydrop)
function resolverMoradaParaFornecedor(paisDestinoFinal, moradaCliente) {
  if (precisaDeAgenteDeCarga(paisDestinoFinal)) {
    return { tipo: 'agente_de_carga', morada: MORADA_AGENTE_CARGA };
  }
  return { tipo: 'direto', morada: moradaCliente };
}

module.exports = { precisaDeAgenteDeCarga, resolverMoradaParaFornecedor, MORADA_AGENTE_CARGA };
