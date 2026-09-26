const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { gerarToken } = require('../middleware/auth');

const router = express.Router();

// ---------- Registo de cliente ----------
router.post('/clientes/registar', async (req, res, next) => {
  try {
    const { nome, email, palavraPasse } = req.body;
    if (!nome || !email || !palavraPasse) {
      return res.status(400).json({ erro: 'Nome, e-mail e palavra-passe são obrigatórios.' });
    }
    const existente = await pool.query('SELECT id FROM clientes WHERE email = $1', [email]);
    if (existente.rows[0]) return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });

    const passwordHash = await bcrypt.hash(palavraPasse, 10);
    const { rows } = await pool.query(
      'INSERT INTO clientes (nome, email, password_hash) VALUES ($1,$2,$3) RETURNING id',
      [nome, email, passwordHash]
    );
    const token = gerarToken({ id: String(rows[0].id), tipo: 'cliente' });
    res.json({ token, cliente: { id: String(rows[0].id), nome, email } });
  } catch (erro) { next(erro); }
});

// ---------- Login de cliente ----------
router.post('/clientes/login', async (req, res, next) => {
  try {
    const { email, palavraPasse } = req.body;
    const { rows } = await pool.query('SELECT * FROM clientes WHERE email = $1', [email]);
    const cliente = rows[0];
    if (!cliente || !(await bcrypt.compare(palavraPasse, cliente.password_hash))) {
      return res.status(401).json({ erro: 'E-mail ou palavra-passe incorretos.' });
    }
    const token = gerarToken({ id: String(cliente.id), tipo: 'cliente' });
    res.json({ token, cliente: { id: String(cliente.id), nome: cliente.nome, email: cliente.email } });
  } catch (erro) { next(erro); }
});

// ---------- Login de admin ----------
router.post('/admin/login', async (req, res, next) => {
  try {
    const { email, palavraPasse } = req.body;
    const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(palavraPasse, admin.password_hash))) {
      return res.status(401).json({ erro: 'E-mail ou palavra-passe incorretos.' });
    }
    const token = gerarToken({ id: String(admin.id), tipo: 'admin' });
    res.json({ token, admin: { id: String(admin.id), nome: admin.nome, email: admin.email } });
  } catch (erro) { next(erro); }
});

module.exports = router;
