const express=require('express');const {rateLimitPersistente}=require('../middleware/rate-limit-persistente');
const {query,transaction}=require('../config/db');
const {exigirAutenticacao}=require('../middleware/auth');
const router=express.Router();
const email=e=>String(e||'').trim().toLowerCase();
const text=v=>String(v??'').trim();


const CAMPOS_EMPRESA_PUBLICOS = Object.freeze({
  denominacao: 'EMPRESA_DENOMINACAO',
  nif: 'EMPRESA_NIF',
  morada: 'EMPRESA_MORADA',
  email: 'EMPRESA_EMAIL',
  telefone: 'EMPRESA_TELEFONE',
  representante: 'EMPRESA_REPRESENTANTE',
  horario: 'EMPRESA_HORARIO',
  livroReclamacoes: 'EMPRESA_LIVRO_RECLAMACOES',
  iva: 'EMPRESA_IVA'
});

router.get('/empresa', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const empresa = {};
  for (const [campo, variavel] of Object.entries(CAMPOS_EMPRESA_PUBLICOS)) {
    const valor = String(process.env[variavel] || '').trim();
    if (valor) empresa[campo] = valor;
  }
  res.json({ configurada: Object.keys(empresa).length === Object.keys(CAMPOS_EMPRESA_PUBLICOS).length, empresa });
});


router.get('/conteudos',async(req,res,next)=>{try{
 const limite=Math.min(50,Math.max(1,Number.parseInt(req.query.limite||'20',10)||20));
 const r=await query(`SELECT id,titulo,slug,categoria,corpo,estado,imagem_url,seo_title,seo_description,criado_em,atualizado_em FROM conteudos WHERE estado='publicado' ORDER BY criado_em DESC LIMIT $1`,[limite]);
 res.json(r.rows);
}catch(e){next(e)}});
router.get('/conteudos/:slug',async(req,res,next)=>{try{
 const r=await query(`SELECT id,titulo,slug,categoria,corpo,estado,imagem_url,seo_title,seo_description,criado_em,atualizado_em FROM conteudos WHERE estado='publicado' AND slug=$1 LIMIT 1`,[String(req.params.slug)]);
 if(!r.rowCount)return res.status(404).json({erro:'Artigo não encontrado.'}); res.json(r.rows[0]);
}catch(e){next(e)}});

router.post('/contactos',rateLimitPersistente({nome:'contactos',limite:5,janelaSegundos:3600}),async(req,res,next)=>{try{
  const nome=text(req.body.nome),mail=email(req.body.email),assunto=text(req.body.assunto),mensagem=text(req.body.mensagem);
  if(!nome||!mail||!/^\S+@\S+\.\S+$/.test(mail)||!assunto||!mensagem)return res.status(400).json({erro:'Nome, e-mail, assunto e mensagem são obrigatórios.'});
  if(mensagem.length>5000)return res.status(400).json({erro:'A mensagem é demasiado longa.'});
  const r=await query(`INSERT INTO contactos(nome,email,assunto,mensagem,estado) VALUES($1,$2,$3,$4,'novo') RETURNING id,criado_em`,[nome,mail,assunto,mensagem]);
  res.status(201).json({sucesso:true,id:r.rows[0].id,criadoEm:r.rows[0].criado_em});
}catch(e){next(e)}});

router.post('/newsletter',rateLimitPersistente({nome:'newsletter',limite:5,janelaSegundos:3600}),async(req,res,next)=>{try{
  const mail=email(req.body.email);if(!/^\S+@\S+\.\S+$/.test(mail))return res.status(400).json({erro:'Indique um e-mail válido.'});if(req.body.consentimento!==true)return res.status(400).json({erro:'É necessário consentir explicitamente com a subscrição.'});
  if(!process.env.BACKEND_PUBLIC_URL||!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return res.status(503).json({erro:'A confirmação por e-mail está temporariamente indisponível. Tente mais tarde.'});
  const crypto=require('crypto'),token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
  await query(`INSERT INTO newsletter_subscritores(email,ativo,token_cancelamento,cancelado_em,token_confirmacao_hash,confirmacao_expira_em,confirmado_em,consentimento_em) VALUES($1,false,$2,NULL,$3,now()+interval '24 hours',NULL,now()) ON CONFLICT(email) DO UPDATE SET ativo=false,token_confirmacao_hash=EXCLUDED.token_confirmacao_hash,confirmacao_expira_em=EXCLUDED.confirmacao_expira_em,confirmado_em=NULL,consentimento_em=now(),cancelado_em=NULL,atualizado_em=now()`,[mail,crypto.randomBytes(32).toString('hex'),hash]);
  const base=String(process.env.BACKEND_PUBLIC_URL||'').replace(/\/$/,'');
  const link=`${base}/api/publico/newsletter/confirmar/${token}`;const sent=await require('../integrations/email').enviarEmail({to:mail,subject:'Confirme a sua subscrição — Lúmina',html:`<p>Recebemos um pedido de subscrição da newsletter Lúmina.</p><p><a href="${link}">Confirmar subscrição</a></p><p>O link expira em 24 horas. Se não fez este pedido, ignore esta mensagem.</p>`,text:`Confirme a subscrição Lúmina em: ${link}\nO link expira em 24 horas.`});if(!sent.enviado)return res.status(503).json({erro:'Não foi possível enviar o e-mail de confirmação. Tente mais tarde.'});res.status(202).json({sucesso:true,mensagem:'Se o endereço puder receber mensagens, será enviado um e-mail para confirmar a subscrição.'});
}catch(e){next(e)}});
router.get('/newsletter/confirmar/:token',rateLimitPersistente({nome:'newsletter-confirmar',limite:10,janelaSegundos:900}),async(req,res,next)=>{try{const crypto=require('crypto'),hash=crypto.createHash('sha256').update(String(req.params.token||'')).digest('hex');const r=await query("UPDATE newsletter_subscritores SET ativo=true,confirmado_em=now(),token_confirmacao_hash=NULL,confirmacao_expira_em=NULL,atualizado_em=now() WHERE token_confirmacao_hash=$1 AND confirmacao_expira_em>now() RETURNING id",[hash]);res.setHeader('Cache-Control','no-store');res.type('html');if(!r.rowCount)return res.status(400).send('<!doctype html><html lang="pt"><meta charset="utf-8"><title>Link inválido — Lúmina</title><h1>Link inválido ou expirado</h1><p>Volte à loja e solicite uma nova confirmação.</p></html>');res.send('<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Subscrição confirmada — Lúmina</title><h1>Subscrição confirmada</h1><p>Obrigado. A sua subscrição da newsletter Lúmina está ativa.</p><p><a href="/">Voltar à loja</a></p></html>');}catch(e){next(e)}});
router.post('/devolucoes',rateLimitPersistente({nome:'cliente-devolucao',limite:5,janelaSegundos:3600}),exigirAutenticacao('cliente'),async(req,res,next)=>{try{
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
router.get('/favoritos',exigirAutenticacao('cliente'),async(req,res,next)=>{try{const r=await query(`SELECT p.*,c.nome categoria_nome,(SELECT url FROM produto_imagens i WHERE i.produto_id=p.id ORDER BY i.principal DESC,i.ordem LIMIT 1) imagem_principal FROM favoritos f JOIN produtos p ON p.id=f.produto_id LEFT JOIN categorias c ON c.id=p.categoria_id WHERE f.cliente_id=$1 AND p.ativo=true ORDER BY f.criado_em DESC`,[req.utilizador.id]);res.json(r.rows.map(p=>({id:Number(p.id),nome:p.nome,slug:p.slug,descricao:p.descricao,descricaoCurta:p.descricao_curta,precoVendaEUR:Number(p.preco_venda_eur||0),precoCompareEUR:Number(p.preco_compare_eur||0),precoAtualEUR:(p.promocao_ativa&&Number(p.promocao_preco_eur)>0)?Number(p.promocao_preco_eur):Number(p.preco_venda_eur||0),promocaoAtiva:!!p.promocao_ativa,promocaoPrecoEUR:Number(p.promocao_preco_eur||0),imagemPrincipal:p.imagem_principal||null,categoria:p.categoria_nome||'',stockDisponivel:Number(p.stock||0),destaque:!!p.destaque,etiqueta:p.etiqueta||''})));}catch(e){next(e)}});

router.get('/contactos',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('SELECT * FROM contactos ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});
router.put('/contactos/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const estados=['novo','em_atendimento','resolvido','arquivado'];const estado=text(req.body.estado);if(!estados.includes(estado))return res.status(400).json({erro:'Estado inválido.'});const r=await query('UPDATE contactos SET estado=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[estado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Contacto não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});
router.get('/newsletter',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('SELECT * FROM newsletter_subscritores ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});
router.put('/newsletter/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('UPDATE newsletter_subscritores SET ativo=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[!!req.body.ativo,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Subscritor não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});
router.get('/devolucoes',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query(`SELECT d.*,p.numero, c.nome cliente_nome,c.email cliente_email FROM devolucoes d JOIN pedidos p ON p.id=d.pedido_id JOIN clientes c ON c.id=d.cliente_id ORDER BY d.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});
router.put('/devolucoes/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const estados=['solicitada','em_analise','aprovada','rejeitada','recebida','reembolsada','cancelada'];const estado=text(req.body.estado);if(!estados.includes(estado))return res.status(400).json({erro:'Estado inválido.'});const r=await query('UPDATE devolucoes SET estado=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[estado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Devolução não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});
router.get('/avaliacoes',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query(`SELECT a.*,p.nome produto_nome FROM avaliacoes a JOIN produtos p ON p.id=a.produto_id ORDER BY a.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});
router.put('/avaliacoes/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('UPDATE avaliacoes SET aprovado=$1 WHERE id=$2 RETURNING *',[!!req.body.aprovado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Avaliação não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});
module.exports=router;
