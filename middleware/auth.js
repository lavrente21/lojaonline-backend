const jwt = require('jsonwebtoken');
const SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) throw new Error('JWT_SECRET não configurado.');
function gerarToken(payload) { return jwt.sign(payload, SEGREDO, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }); }
function exigirAutenticacao(tipoEsperado) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    if (!token) return res.status(401).json({ erro: 'Token em falta.' });
    try {
      const dados = jwt.verify(token, SEGREDO);
      if (tipoEsperado && dados.tipo !== tipoEsperado) return res.status(403).json({ erro: 'Sem permissão.' });
      req.utilizador = dados; next();
    } catch { return res.status(401).json({ erro: 'Token inválido ou expirado.' }); }
  };
}
function tentarAutenticacao(req,res,next){const token=(req.headers.authorization||'').startsWith('Bearer ')?req.headers.authorization.slice(7):null;if(!token)return next();try{const dados=jwt.verify(token,SEGREDO);req.utilizador=dados;}catch{}next();}
module.exports = { gerarToken, exigirAutenticacao, tentarAutenticacao };
