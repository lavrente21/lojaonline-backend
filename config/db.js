// Base de dados simples em ficheiro JSON.
// Em produção, isto seria substituído por PostgreSQL/MySQL — a interface
// (ler, guardar, gerar id) mantém-se igual, só a implementação muda.

const fs = require('fs');
const path = require('path');

const CAMINHO_DB = path.join(__dirname, '..', 'data', 'db.json');

function estadoInicial() {
  return {
    produtos: [
      {
        id: 'prod_001',
        nome: 'Sérum de vitamina C 20%',
        categoria: 'Skincare',
        precoVendaEUR: 32.90,
        precoCustoEUR: 14.20,
        fornecedor: 'cj',
        idFornecedor: 'CJ-8823741',
        stock: 48
      },
      {
        id: 'prod_002',
        nome: 'Máscara capilar reparadora',
        categoria: 'Hair care',
        precoVendaEUR: 24.50,
        precoCustoEUR: 9.80,
        fornecedor: 'buckydrop',
        idFornecedor: 'BKY-55210',
        stock: 32
      }
    ],
    pedidos: [],
    clientes: [],
    admins: [
      // password: "admin123" (hash gerado com bcryptjs, ver seed.js)
      { id: 'admin_001', nome: 'Ana Ribeiro', email: 'ana@lumina-beauty.com', passwordHash: null }
    ],
    contadores: { pedido: 48213 }
  };
}

function ler() {
  if (!fs.existsSync(CAMINHO_DB)) {
    guardar(estadoInicial());
  }
  const conteudo = fs.readFileSync(CAMINHO_DB, 'utf-8');
  return JSON.parse(conteudo);
}

function guardar(estado) {
  fs.writeFileSync(CAMINHO_DB, JSON.stringify(estado, null, 2));
}

function proximoNumeroPedido() {
  const estado = ler();
  estado.contadores.pedido += 1;
  guardar(estado);
  return `LUM-${estado.contadores.pedido}`;
}

module.exports = { ler, guardar, proximoNumeroPedido, CAMINHO_DB };
