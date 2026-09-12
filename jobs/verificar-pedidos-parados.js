const { ler } = require('../config/db');

const LIMITE_HORAS_SEM_ATUALIZACAO = 96; // 4 dias

function verificarPedidosParados() {
  const db = ler();
  const agora = Date.now();
  const parados = db.pedidos.filter(p => {
    if (['entregue', 'novo'].includes(p.estado)) return false;
    const horasDesde = (agora - new Date(p.criadoEm).getTime()) / (1000 * 60 * 60);
    return horasDesde > LIMITE_HORAS_SEM_ATUALIZACAO;
  });

  if (parados.length > 0) {
    console.log(`[Job] ⚠️  ${parados.length} pedido(s) sem atualização há mais de ${LIMITE_HORAS_SEM_ATUALIZACAO}h:`);
    parados.forEach(p => console.log(`   - ${p.id} (estado: ${p.estado})`));
    // TODO produção: enviar e-mail/notificação real ao admin em vez de só logar
  }
}

module.exports = verificarPedidosParados;
