const paisesDiretos=(process.env.PAISES_COM_ENVIO_DIRETO||'PT,ES,FR,DE,IT,NL,BE,AT,IE,SE,DK,FI,PL,CZ,RO,GB,US,CA,MX,BR,CL,AR,CO').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
function precisaDeAgenteDeCarga(p){return !paisesDiretos.includes(String(p).toUpperCase())}
function resolverMoradaParaFornecedor(pais,m){
 if(!precisaDeAgenteDeCarga(pais)) return {tipo:'direto',morada:m};
 const a={nome:process.env.AGENTE_NOME,linha1:process.env.AGENTE_LINHA1,cidade:process.env.AGENTE_CIDADE,codigoPostal:process.env.AGENTE_CODIGO_POSTAL,pais:process.env.AGENTE_PAIS,telefone:process.env.AGENTE_TELEFONE,referenciaInterna:process.env.AGENTE_REFERENCIA||'LUMINA'};
 if(!a.nome||!a.linha1||!a.cidade||!a.pais) throw new Error('Destino fora da lista direta, mas o agente de carga não está configurado.');
 return {tipo:'agente_de_carga',morada:a};
}
module.exports={precisaDeAgenteDeCarga,resolverMoradaParaFornecedor};
