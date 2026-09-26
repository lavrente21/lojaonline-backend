const { pool } = require('../config/db');
const cjApi = require('../integrations/cj-api');

// Corre periodicamente (ver server.js) para manter o stock do site
// alinhado com o stock real no fornecedor.
async function sincronizarEstoque() {
  if (!cjApi.credenciaisConfiguradas()) {
    console.log('[Job] Sincronização de stock ignorada — CJ_API_EMAIL/CJ_API_KEY não configurados.');
    return;
  }

  const { rows: produtos } = await pool.query("SELECT id, id_fornecedor FROM produtos WHERE fornecedor = 'cj' AND ativo = true");

  for (const produto of produtos) {
    if (!produto.id_fornecedor) continue;
    const info = await cjApi.consultarEstoque(produto.id_fornecedor);
    if (info.stock !== null) {
      await pool.query('UPDATE produtos SET stock = $1 WHERE id = $2', [info.stock, produto.id]);
    }
  }
  // Buckydrop: adicionar chamada equivalente quando tiveres os endpoints reais deles.
  console.log(`[Job] Stock sincronizado às ${new Date().toLocaleTimeString('pt-PT')}`);
}

module.exports = sincronizarEstoque;
