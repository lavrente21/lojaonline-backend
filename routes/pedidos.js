const express = require('express');
const { ler, guardar } = require('../config/db');
const { exigirAutenticacao } = require('../middleware/auth');

const router = express.Router();

// ---------- Público: rastrear pedido por número + e-mail (sem precisar de login) ----------
router.get('/rastrear/:numeroPedido', (req, res) => {
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === req.params.numeroPedido);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json({
    numeroPedido: pedido.id,
    estado: pedido.estado,
    rotaEnvio: pedido.rotaEnvio,
    fornecedores: pedido.fornecedores
  });
});

// ---------- Cliente: ver os seus próprios pedidos ----------
router.get('/meus', exigirAutenticacao('cliente'), (req, res) => {
  const db = ler();
  const pedidos = db.pedidos.filter(p => p.clienteId === req.utilizador.id);
  res.json(pedidos);
});

// ---------- Admin: listar todos os pedidos ----------
router.get('/', exigirAutenticacao('admin'), (req, res) => {
  const db = ler();
  res.json(db.pedidos);
});

// ---------- Admin: ver detalhe de um pedido ----------
router.get('/:numeroPedido', exigirAutenticacao('admin'), (req, res) => {
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === req.params.numeroPedido);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json(pedido);
});

// ---------- Admin: atualizar manualmente o estado de um sub-pedido (exceções) ----------
router.put('/:numeroPedido/fornecedor/:fornecedor', exigirAutenticacao('admin'), (req, res) => {
  const db = ler();
  const pedido = db.pedidos.find(p => p.id === req.params.numeroPedido);
  if (!pedido || !pedido.fornecedores[req.params.fornecedor]) {
    return res.status(404).json({ erro: 'Pedido ou fornecedor não encontrado.' });
  }
  Object.assign(pedido.fornecedores[req.params.fornecedor], req.body);
  guardar(db);
  res.json(pedido.fornecedores[req.params.fornecedor]);
});

module.exports = router;
