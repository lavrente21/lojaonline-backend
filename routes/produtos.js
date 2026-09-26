const express = require('express');
const { pool, transacao } = require('../config/db');
const { exigirAutenticacao, autenticacaoOpcional } = require('../middleware/auth');
const cjApi = require('../integrations/cj-api');

const router = express.Router();

function mapearProduto(row) {
  return {
    id: String(row.id),
    nome: row.nome,
    categoria: row.categoria_nome || null,
    descricao: row.descricao || '',
    precoVendaEUR: Number(row.preco_venda_eur),
    precoCustoEUR: Number(row.preco_custo_eur),
    fornecedor: row.fornecedor,
    idFornecedor: row.id_fornecedor,
    skuFornecedor: row.sku_fornecedor,
    stock: row.stock,
    ativo: row.ativo,
    imagemUrl: row.imagem_url || null
  };
}

// ---------- Público: listar produtos (admin autenticado também vê os inativos) ----------
router.get('/', autenticacaoOpcional, async (req, res, next) => {
  try {
    const souAdmin = req.utilizador && req.utilizador.tipo === 'admin';
    const { rows } = await pool.query(`
      SELECT p.*, c.nome AS categoria_nome,
        (SELECT url FROM produto_imagens pi WHERE pi.produto_id = p.id ORDER BY principal DESC, ordem ASC LIMIT 1) AS imagem_url
      FROM produtos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      ${souAdmin ? '' : 'WHERE p.ativo = true'}
      ORDER BY p.criado_em DESC
    `);
    res.json(rows.map(mapearProduto));
  } catch (erro) { next(erro); }
});

// ---------- Admin: importar produto real da CJ Dropshipping ----------
// Tem de vir ANTES de "/:id" para não ser interpretado como um ID de produto.
router.get('/importar/cj', exigirAutenticacao('admin'), async (req, res, next) => {
  try {
    const idOuLink = req.query.id;
    if (!idOuLink) return res.status(400).json({ erro: 'Falta o parâmetro id (ID ou link do produto na CJ).' });
    const produto = await cjApi.buscarProdutoPorIdOuLink(idOuLink);
    res.json(produto);
  } catch (erro) {
    res.status(502).json({ erro: erro.message });
  }
});

// ---------- Público: detalhe de um produto (com imagens e variantes) ----------
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, c.nome AS categoria_nome
      FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Produto não encontrado.' });

    const [{ rows: imagens }, { rows: variantes }] = await Promise.all([
      pool.query('SELECT url, principal, ordem FROM produto_imagens WHERE produto_id = $1 ORDER BY principal DESC, ordem ASC', [req.params.id]),
      pool.query('SELECT id, nome_opcao, valor_opcao, preco_extra_eur, stock FROM produto_variantes WHERE produto_id = $1', [req.params.id])
    ]);

    res.json({
      ...mapearProduto(rows[0]),
      imagens: imagens.map((i) => i.url),
      variantes: variantes.map((v) => ({
        id: String(v.id), nomeOpcao: v.nome_opcao, valorOpcao: v.valor_opcao,
        precoExtraEUR: Number(v.preco_extra_eur), stock: v.stock
      }))
    });
  } catch (erro) { next(erro); }
});

// ---------- Admin: criar produto (manual ou a partir de uma importação da CJ) ----------
router.post('/', exigirAutenticacao('admin'), async (req, res, next) => {
  try {
    const {
      nome, categoria, precoVendaEUR, precoCustoEUR, fornecedor, idFornecedor,
      skuFornecedor, stock, descricao, imagemUrl, imagens, variantes
    } = req.body;

    if (!nome || !fornecedor || !['cj', 'buckydrop', 'proprio'].includes(fornecedor)) {
      return res.status(400).json({ erro: 'Nome e fornecedor (cj|buckydrop|proprio) são obrigatórios.' });
    }

    const resultado = await transacao(async (cliente) => {
      let categoriaId = null;
      if (categoria) {
        const slug = String(categoria).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
        const { rows } = await cliente.query(
          `INSERT INTO categorias (nome, slug) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
          [categoria, slug]
        );
        categoriaId = rows[0].id;
      }

      const { rows: prodRows } = await cliente.query(`
        INSERT INTO produtos (nome, categoria_id, descricao, preco_custo_eur, preco_venda_eur, fornecedor, id_fornecedor, sku_fornecedor, stock)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
      `, [nome, categoriaId, descricao || '', Number(precoCustoEUR) || 0, Number(precoVendaEUR) || 0, fornecedor, idFornecedor || null, skuFornecedor || null, Number(stock) || 0]);

      const produtoId = prodRows[0].id;

      const listaImagens = Array.isArray(imagens) && imagens.length ? imagens : (imagemUrl ? [imagemUrl] : []);
      for (let i = 0; i < listaImagens.length; i++) {
        await cliente.query(
          'INSERT INTO produto_imagens (produto_id, url, principal, ordem) VALUES ($1,$2,$3,$4)',
          [produtoId, listaImagens[i], i === 0, i]
        );
      }

      if (Array.isArray(variantes)) {
        for (const v of variantes) {
          await cliente.query(
            `INSERT INTO produto_variantes (produto_id, nome_opcao, valor_opcao, sku_variante, preco_extra_eur, stock)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (produto_id, nome_opcao, valor_opcao) DO NOTHING`,
            [produtoId, v.nomeOpcao || 'Opção', v.valorOpcao, v.sku || null, Number(v.precoEUR) || 0, Number(v.stock) || 0]
          );
        }
      }

      return produtoId;
    });

    const { rows } = await pool.query('SELECT p.*, c.nome AS categoria_nome FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.id=$1', [resultado]);
    res.status(201).json(mapearProduto(rows[0]));
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um produto com este fornecedor + ID de fornecedor.' });
    next(erro);
  }
});

// ---------- Admin: editar produto ----------
router.put('/:id', exigirAutenticacao('admin'), async (req, res, next) => {
  try {
    const camposDiretos = { nome: 'nome', precoVendaEUR: 'preco_venda_eur', precoCustoEUR: 'preco_custo_eur', stock: 'stock', descricao: 'descricao', ativo: 'ativo', fornecedor: 'fornecedor', idFornecedor: 'id_fornecedor', skuFornecedor: 'sku_fornecedor' };
    const sets = [];
    const valores = [];
    let i = 1;

    if (req.body.categoria !== undefined) {
      const slug = String(req.body.categoria).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
      const { rows: catRows } = await pool.query(
        `INSERT INTO categorias (nome, slug) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
        [req.body.categoria, slug]
      );
      sets.push(`categoria_id = $${i++}`);
      valores.push(catRows[0].id);
    }

    for (const [chaveJs, colunaSql] of Object.entries(camposDiretos)) {
      if (req.body[chaveJs] !== undefined) {
        sets.push(`${colunaSql} = $${i++}`);
        valores.push(req.body[chaveJs]);
      }
    }
    if (!sets.length) return res.status(400).json({ erro: 'Nada para atualizar.' });
    valores.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE produtos SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Produto não encontrado.' });
    const { rows: comCategoria } = await pool.query('SELECT p.*, c.nome AS categoria_nome FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.id=$1', [rows[0].id]);
    res.json(mapearProduto(comCategoria[0]));
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um produto com este fornecedor + ID de fornecedor.' });
    next(erro);
  }
});

// ---------- Admin: apagar produto ----------
router.delete('/:id', exigirAutenticacao('admin'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM produtos WHERE id = $1', [req.params.id]);
    res.json({ sucesso: true });
  } catch (erro) { next(erro); }
});

module.exports = router;
