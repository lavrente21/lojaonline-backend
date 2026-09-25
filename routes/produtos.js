const express = require('express');
const { ler, guardar } = require('../config/db');
const { exigirAutenticacao } = require('../middleware/auth');
const cjApi = require('../integrations/cj-api');

const router = express.Router();

// ---------- Público: listar produtos ----------
router.get('/', (req, res) => {
  const db = ler();
  res.json(db.produtos);
});

// ---------- Admin: pré-visualizar um produto da CJ antes de importar ----------
// Não grava nada — só busca os dados na CJ para pré-preencher o formulário
// "Novo produto". Fica antes de "/:id" para não ser interpretada como um id.
// GET /produtos/importar/cj?id=<ID ou link do produto na CJ>
router.get('/importar/cj', exigirAutenticacao('admin'), async (req, res) => {
  const { id } = req.query;
  if (!id || !id.trim()) {
    return res.status(400).json({ erro: 'Indica o ID ou o link do produto na CJ.' });
  }
  try {
    const produtoCJ = await cjApi.buscarProdutoPorId(id);
    res.json(produtoCJ);
  } catch (e) {
    // 502: a nossa API está bem, quem falhou foi a CJ (ID inválido, token, etc.)
    res.status(502).json({ erro: e.message });
  }
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
  const {
    nome, categoria, precoVendaEUR, precoCustoEUR, fornecedor, idFornecedor, stock,
    // Opcionais — normalmente vêm preenchidos quando o produto foi importado da CJ
    descricao, imagemUrl, imagens, skuFornecedor
  } = req.body;
  if (!nome || !fornecedor || !['cj', 'buckydrop'].includes(fornecedor)) {
    return res.status(400).json({ erro: 'Nome e fornecedor (cj|buckydrop) são obrigatórios.' });
  }
  const produto = {
    id: `prod_${Date.now()}`,
    nome, categoria: categoria || '',
    precoVendaEUR: Number(precoVendaEUR) || 0,
    precoCustoEUR: Number(precoCustoEUR) || 0,
    fornecedor, idFornecedor: idFornecedor || '',
    stock: Number(stock) || 0,
    descricao: descricao || '',
    imagemUrl: imagemUrl || '',
    imagens: Array.isArray(imagens) ? imagens : [],
    skuFornecedor: skuFornecedor || ''
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
