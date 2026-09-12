const express = require('express');
const { ler, guardar } = require('../config/db');
const { exigirAutenticacao } = require('../middleware/auth');

const router = express.Router();

// ---------- Público: listar produtos ----------
router.get('/', (req, res) => {
  const db = ler();
  res.json(db.produtos);
});

router.get('/:id', (req, res) => {
  const db = ler();
  const produto = db.produtos.find(p => p.id === req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' });
  res.json(produto);
});

// ---------- Admin: criar produto ----------
router.post('/', exigirAutenticacao('admin'), (req, res) => {
  const db = ler();
  const { nome, categoria, precoVendaEUR, precoCustoEUR, fornecedor, idFornecedor, stock } = req.body;
  if (!nome || !fornecedor || !['cj', 'buckydrop'].includes(fornecedor)) {
    return res.status(400).json({ erro: 'Nome e fornecedor (cj|buckydrop) são obrigatórios.' });
  }
  const produto = {
    id: `prod_${Date.now()}`,
    nome, categoria: categoria || '',
    precoVendaEUR: Number(precoVendaEUR) || 0,
    precoCustoEUR: Number(precoCustoEUR) || 0,
    fornecedor, idFornecedor: idFornecedor || '',
    stock: Number(stock) || 0
  };
  db.produtos.push(produto);
  guardar(db);
  res.status(201).json(produto);
});

// ---------- Admin: editar produto ----------
router.put('/:id', exigirAutenticacao('admin'), (req, res) => {
  const db = ler();
  const produto = db.produtos.find(p => p.id === req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' });
  Object.assign(produto, req.body);
  guardar(db);
  res.json(produto);
});

// ---------- Admin: apagar produto ----------
router.delete('/:id', exigirAutenticacao('admin'), (req, res) => {
  const db = ler();
  db.produtos = db.produtos.filter(p => p.id !== req.params.id);
  guardar(db);
  res.json({ sucesso: true });
});

module.exports = router;
