const { ler, guardar } = require('../config/db');
const cjApi = require('../integrations/cj-api');

// Corre periodicamente (ver server.js) para manter o stock do site
// alinhado com o stock real no fornecedor.
async function sincronizarEstoque() {
  const db = ler();
  for (const produto of db.produtos) {
    if (produto.fornecedor === 'cj') {
      const info = await cjApi.consultarEstoque(produto.idFornecedor);
      produto.stock = info.stock;
    }
    // Buckydrop: adicionar chamada equivalente quando a API estiver ligada de verdade
  }
  guardar(db);
  console.log(`[Job] Stock sincronizado às ${new Date().toLocaleTimeString('pt-PT')}`);
}

module.exports = sincronizarEstoque;
