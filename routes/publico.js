const express=require('express');
const {query,transaction}=require('../config/db');
const {exigirAutenticacao}=require('../middleware/auth');
const router=express.Router();
const email=e=>String(e||'').trim().toLowerCase();
const text=v=>String(v??'').trim();


router.get('/conteudos',async(req,res,next)=>{try{
 const limite=Math.min(50,Math.max(1,Number.parseInt(req.query.limite||'20',10)||20));
 const r=await query(`SELECT id,titulo,slug,categoria,corpo,estado,imagem_url,seo_title,seo_description,criado_em,atualizado_em FROM conteudos WHERE estado='publicado' ORDER BY criado_em DESC LIMIT $1`,[limite]);
 res.json(r.rows);
}catch(e){next(e)}});
router.get('/conteudos/:slug',async(req,res,next)=>{try{
 const r=await query(`SELECT id,titulo,slug,categoria,corpo,estado,imagem_url,seo_title,seo_description,criado_em,atualizado_em FROM conteudos WHERE estado='publicado' AND slug=$1 LIMIT 1`,[String(req.params.slug)]);
 if(!r.rowCount)return res.status(404).json({erro:'Artigo não encontrado.'}); res.json(r.rows[0]);
}catch(e){next(e)}});

router.post('/contactos',async(req,res,next)=>{try{
  const nome=text(req.body.nome),mail=email(req.body.email),assunto=text(req.body.assunto),mensagem=text(req.body.mensagem);
  if(!nome||!mail||!/^\S+@\S+\.\S+$/.test(mail)||!assunto||!mensagem)return res.status(400).json({erro:'Nome, e-mail, assunto e mensagem são obrigatórios.'});
  if(mensagem.length>5000)return res.status(400).json({erro:'A mensagem é demasiado longa.'});
  const r=await query(`INSERT INTO contactos(nome,email,assunto,mensagem,estado) VALUES($1,$2,$3,$4,'novo') RETURNING id,criado_em`,[nome,mail,assunto,mensagem]);
  res.status(201).json({sucesso:true,id:r.rows[0].id,criadoEm:r.rows[0].criado_em});
}catch(e){next(e)}});

router.post('/newsletter',async(req,res,next)=>{try{
  const mail=email(req.body.email);if(!/^\S+@\S+\.\S+$/.test(mail))return res.status(400).json({erro:'Indique um e-mail válido.'});
  const r=await query(`INSERT INTO newsletter_subscritores(email,ativo) VALUES($1,true) ON CONFLICT(email) DO UPDATE SET ativo=true,atualizado_em=now() RETURNING id,email,ativo`,[mail]);
  res.status(201).json({sucesso:true,subscritor:r.rows[0]});
}catch(e){next(e)}});

router.post('/devolucoes',exigirAutenticacao('cliente'),async(req,res,next)=>{try{
  const numero=text(req.body.numeroPedido),motivo=text(req.body.motivo),detalhes=text(req.body.detalhes);
  if(!numero||!motivo)return res.status(400).json({erro:'Encomenda e motivo são obrigatórios.'});
  const p=(await query(`SELECT id,numero,estado,criado_em FROM pedidos WHERE numero=$1 AND cliente_id=$2`,[numero,req.utilizador.id])).rows[0];
  if(!p)return res.status(404).json({erro:'Encomenda não encontrada na sua conta.'});
  if(p.estado!=='entregue')return res.status(400).json({erro:'A devolução só pode ser solicitada após a encomenda ser marcada como entregue.'});
  const duplicada=(await query(`SELECT id FROM devolucoes WHERE pedido_id=$1 AND estado NOT IN ('rejeitada','cancelada')`,[p.id])).rows[0];
  if(duplicada)return res.status(409).json({erro:'Já existe um pedido de devolução em análise para esta encomenda.'});
  const r=await query(`INSERT INTO devolucoes(pedido_id,cliente_id,motivo,detalhes,estado) VALUES($1,$2,$3,$4,'solicitada') RETURNING id,estado,criado_em`,[p.id,req.utilizador.id,motivo,detalhes||null]);
  res.status(201).json({sucesso:true,devolucao:r.rows[0]});
}catch(e){next(e)}});

router.get('/devolucoes/minhas',exigirAutenticacao('cliente'),async(req,res,next)=>{try{const r=await query(`SELECT d.id,p.numero,d.motivo,d.detalhes,d.estado,d.criado_em,d.atualizado_em FROM devolucoes d JOIN pedidos p ON p.id=d.pedido_id WHERE d.cliente_id=$1 ORDER BY d.criado_em DESC`,[req.utilizador.id]);res.json(r.rows)}catch(e){next(e)}});

router.post('/favoritos/:produtoId',exigirAutenticacao('cliente'),async(req,res,next)=>{try{const pid=Number(req.params.produtoId);if(!Number.isInteger(pid)||pid<1)return res.status(400).json({erro:'Produto inválido.'});const p=(await query('SELECT id FROM produtos WHERE id=$1 AND ativo=true',[pid])).rows[0];if(!p)return res.status(404).json({erro:'Produto não encontrado.'});await query(`INSERT INTO favoritos(cliente_id,produto_id) VALUES($1,$2) ON CONFLICT(cliente_id,produto_id) DO NOTHING`,[req.utilizador.id,pid]);res.status(201).json({favorito:true,produtoId:pid})}catch(e){next(e)}});
router.delete('/favoritos/:produtoId',exigirAutenticacao('cliente'),async(req,res,next)=>{try{await query('DELETE FROM favoritos WHERE cliente_id=$1 AND produto_id=$2',[req.utilizador.id,Number(req.params.produtoId)]);res.json({favorito:false,produtoId:Number(req.params.produtoId)})}catch(e){next(e)}});
router.get('/favoritos',exigirAutenticacao('cliente'),async(req,res,next)=>{try{const r=await query(`SELECT p.*,c.nome categoria_nome,(SELECT url FROM produto_imagens i WHERE i.produto_id=p.id ORDER BY i.principal DESC,i.ordem LIMIT 1) imagem_principal FROM favoritos f JOIN produtos p ON p.id=f.produto_id LEFT JOIN categorias c ON c.id=p.categoria_id WHERE f.cliente_id=$1 AND p.ativo=true ORDER BY f.criado_em DESC`,[req.utilizador.id]);res.json(r.rows.map(p=>({...p,id:Number(p.id),stock:Number(p.stock),precoVendaEUR:Number(p.preco_venda_eur||0),precoAtualEUR:(p.promocao_ativa&&Number(p.promocao_preco_eur)>0)?Number(p.promocao_preco_eur):Number(p.preco_venda_eur||0),imagemPrincipal:p.imagem_principal||null,categoria:p.categoria_nome||''})));}catch(e){next(e)}});

router.get('/contactos',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('SELECT * FROM contactos ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});
router.put('/contactos/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const estados=['novo','em_atendimento','resolvido','arquivado'];const estado=text(req.body.estado);if(!estados.includes(estado))return res.status(400).json({erro:'Estado inválido.'});const r=await query('UPDATE contactos SET estado=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[estado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Contacto não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});
router.get('/newsletter',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('SELECT * FROM newsletter_subscritores ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});
router.put('/newsletter/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('UPDATE newsletter_subscritores SET ativo=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[!!req.body.ativo,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Subscritor não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});
router.get('/devolucoes',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query(`SELECT d.*,p.numero, c.nome cliente_nome,c.email cliente_email FROM devolucoes d JOIN pedidos p ON p.id=d.pedido_id JOIN clientes c ON c.id=d.cliente_id ORDER BY d.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});
router.put('/devolucoes/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const estados=['solicitada','em_analise','aprovada','rejeitada','recebida','reembolsada','cancelada'];const estado=text(req.body.estado);if(!estados.includes(estado))return res.status(400).json({erro:'Estado inválido.'});const r=await query('UPDATE devolucoes SET estado=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[estado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Devolução não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});
router.get('/avaliacoes',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query(`SELECT a.*,p.nome produto_nome FROM avaliacoes a JOIN produtos p ON p.id=a.produto_id ORDER BY a.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});
router.put('/avaliacoes/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('UPDATE avaliacoes SET aprovado=$1 WHERE id=$2 RETURNING *',[!!req.body.aprovado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Avaliação não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});
module.exports=router;
