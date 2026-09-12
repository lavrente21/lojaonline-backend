const express = require('express');
const bcrypt = require('bcryptjs');
const { ler, guardar } = require('../config/db');
const { gerarToken } = require('../middleware/auth');

const router = express.Router();

// ---------- Registo de cliente ----------
router.post('/clientes/registar', async (req, res) => {
  const { nome, email, palavraPasse } = req.body;
  if (!nome || !email || !palavraPasse) {
    return res.status(400).json({ erro: 'Nome, e-mail e palavra-passe são obrigatórios.' });
  }
  const db = ler();
  if (db.clientes.find(c => c.email === email)) {
    return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
  }
  const passwordHash = await bcrypt.hash(palavraPasse, 10);
  const cliente = { id: `cli_${Date.now()}`, nome, email, passwordHash, enderecos: [] };
  db.clientes.push(cliente);
  guardar(db);
  const token = gerarToken({ id: cliente.id, tipo: 'cliente' });
  res.json({ token, cliente: { id: cliente.id, nome, email } });
});

// ---------- Login de cliente ----------
router.post('/clientes/login', async (req, res) => {
  const { email, palavraPasse } = req.body;
  const db = ler();
  const cliente = db.clientes.find(c => c.email === email);
  if (!cliente || !(await bcrypt.compare(palavraPasse, cliente.passwordHash))) {
    return res.status(401).json({ erro: 'E-mail ou palavra-passe incorretos.' });
  }
  const token = gerarToken({ id: cliente.id, tipo: 'cliente' });
  res.json({ token, cliente: { id: cliente.id, nome: cliente.nome, email: cliente.email } });
});

// ---------- Login de admin ----------
router.post('/admin/login', async (req, res) => {
  const { email, palavraPasse } = req.body;
  const db = ler();
  const admin = db.admins.find(a => a.email === email);
  if (!admin || !admin.passwordHash || !(await bcrypt.compare(palavraPasse, admin.passwordHash))) {
    return res.status(401).json({ erro: 'E-mail ou palavra-passe incorretos.' });
  }
  const token = gerarToken({ id: admin.id, tipo: 'admin' });
  res.json({ token, admin: { id: admin.id, nome: admin.nome, email: admin.email } });
});

module.exports = router;
