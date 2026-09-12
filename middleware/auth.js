const jwt = require('jsonwebtoken');
const SEGREDO = process.env.JWT_SECRET || 'lumina_segredo_dev_trocar_em_producao';

function gerarToken(payload) {
  return jwt.sign(payload, SEGREDO, { expiresIn: '7d' });
}

function exigirAutenticacao(tipoEsperado) {
  return (req, res, next) => {
    const cabecalho = req.headers.authorization || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;
    if (!token) return res.status(401).json({ erro: 'Token em falta.' });
    try {
      const dados = jwt.verify(token, SEGREDO);
      if (tipoEsperado && dados.tipo !== tipoEsperado) {
        return res.status(403).json({ erro: 'Sem permissão para este recurso.' });
      }
      req.utilizador = dados;
      next();
    } catch (e) {
      return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
  };
}

module.exports = { gerarToken, exigirAutenticacao, SEGREDO };
