// Motor de decisão de rota de envio.
//
// Regra de negócio central: se o destino final for Angola (ou outro país
// não coberto diretamente pelo CJ/Buckydrop), o pedido é criado no fornecedor
// com a MORADA DO AGENTE DE CARGA como destino — não a morada do cliente.
// O agente depois consolida e reenvia para o destino final.
//
// A morada do agente de carga já não está fixa no código — vem do .env
// (preenche com os dados reais do agente que escolheres, ex: um freight
// forwarder com armazém nos EUA ou em Portugal que entregue em Angola).
//
// PAISES_COM_ENVIO_DIRETO: os países que o CJ/Buckydrop cobrem sem precisar
// de agente. Ajusta esta lista consoante os países que a tua conta CJ/
// Buckydrop consegue de facto enviar (confirma na tua conta CJ em
// "Logistics" -> países suportados pelas transportadoras que usas).

const PAISES_COM_ENVIO_DIRETO = (process.env.PAISES_ENVIO_DIRETO || 'PT,ES,FR,DE,IT,NL,BE,US,GB,IE')
  .split(',').map((p) => p.trim().toUpperCase()).filter(Boolean);

function moradaAgenteDeCarga() {
  return {
    nome: process.env.AGENTE_NOME || '',
    linha1: process.env.AGENTE_LINHA1 || '',
    cidade: process.env.AGENTE_CIDADE || '',
    codigoPostal: process.env.AGENTE_CODIGO_POSTAL || '',
    pais: process.env.AGENTE_PAIS || '',
    telefone: process.env.AGENTE_TELEFONE || '',
    referenciaInterna: process.env.AGENTE_REFERENCIA || 'LUMINA-CONSOLIDACAO'
  };
}

function precisaDeAgenteDeCarga(paisDestinoFinal) {
  return !PAISES_COM_ENVIO_DIRETO.includes(String(paisDestinoFinal).toUpperCase());
}

// Devolve a morada que deve ser enviada ao fornecedor (CJ/Buckydrop)
function resolverMoradaParaFornecedor(paisDestinoFinal, moradaCliente) {
  if (precisaDeAgenteDeCarga(paisDestinoFinal)) {
    const morada = moradaAgenteDeCarga();
    if (!morada.linha1 || !morada.pais) {
      console.warn('[Roteamento] AVISO: a morada do agente de carga ainda não está preenchida no .env (AGENTE_*).');
    }
    return { tipo: 'agente_de_carga', morada };
  }
  return { tipo: 'direto', morada: moradaCliente };
}

module.exports = { precisaDeAgenteDeCarga, resolverMoradaParaFornecedor, moradaAgenteDeCarga };
