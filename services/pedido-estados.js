'use strict';
const TRANSICOES = Object.freeze({
  novo:['aguarda_confirmacao_portes','aguarda_pagamento','cancelado'],
  aguarda_confirmacao_portes:['aguarda_pagamento','cancelado','expirado'],
  aguarda_pagamento:['comprovativo_enviado','pago','cancelado','expirado','aguarda_confirmacao_portes'],
  comprovativo_enviado:['aguarda_pagamento','pago','cancelado','expirado'],
  pago:['em_processamento','reembolsado','reembolso_parcial'],
  processando:['em_processamento','enviado_ao_agente','a_caminho','cancelado'],
  em_processamento:['enviado_ao_agente','a_caminho','cancelado'],
  enviado_ao_agente:['a_caminho','a_caminho_destino_final','entregue'],
  a_caminho:['a_caminho_destino_final','entregue'],
  a_caminho_destino_final:['entregue'],
  entregue:['reembolsado','reembolso_parcial'],
  reembolso_parcial:['reembolsado'],
  cancelado:[], expirado:[], reembolsado:[]
});
function validarTransicao(antes,depois){if(!TRANSICOES[antes]||!TRANSICOES[antes].includes(depois)){const e=new Error(`Transição de estado não permitida: ${antes} → ${depois}.`);e.status=409;throw e;}return true;}
module.exports={TRANSICOES,validarTransicao};
