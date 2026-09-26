const { pool } = require('../config/db');

const LIMITE_HORAS_SEM_ATUALIZACAO = 96; // 4 dias

async function verificarPedidosParados() {
  const { rows: parados } = await pool.query(`
    SELECT numero, estado, criado_em FROM pedidos
    WHERE estado NOT IN ('entregue', 'novo', 'cancelado')
      AND criado_em < now() - ($1 || ' hours')::interval
    ORDER BY criado_em ASC
  `, [LIMITE_HORAS_SEM_ATUALIZACAO]);

  if (parados.length > 0) {
    console.log(`[Job] ⚠️  ${parados.length} pedido(s) sem atualização há mais de ${LIMITE_HORAS_SEM_ATUALIZACAO}h:`);
    parados.forEach((p) => console.log(`   - ${p.numero} (estado: ${p.estado})`));
    // TODO produção: enviar e-mail/notificação real ao admin em vez de só logar
  }
}

module.exports = verificarPedidosParados;
