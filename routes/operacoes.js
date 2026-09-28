const express=require('express');
const {query,transaction}=require('../config/db');
const {exigirAutenticacao}=require('../middleware/auth');
const {fulfillPedido}=require('./webhooks');
const cj=require('../integrations/cj-api');
const bucky=require('../integrations/buckydrop-api');
const router=express.Router();
const admin=exigirAutenticacao('admin');
const slugify=s=>String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,140);
const tags=s=>String(s||'').split(/[,\s]+/).map(x=>x.trim()).filter(Boolean).map(x=>x.startsWith('#')?x:'#'+x).join(' ');

router.get('/admin/categorias',admin,async(req,res,next)=>{try{const r=await query(`SELECT c.id,c.nome,c.slug,c.descricao,COUNT(p.id)::int produtos FROM categorias c LEFT JOIN produtos p ON p.categoria_id=c.id AND p.ativo=true GROUP BY c.id ORDER BY c.nome`);res.json(r.rows)}catch(e){next(e)}});
router.post('/admin/categorias',admin,async(req,res,next)=>{try{const nome=String(req.body.nome||'').trim();if(!nome)return res.status(400).json({erro:'Nome obrigatório.'});const r=await query('INSERT INTO categorias(nome,slug,descricao) VALUES($1,$2,$3) RETURNING *',[nome,slugify(req.body.slug||nome),req.body.descricao||null]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
router.put('/admin/categorias/:id',admin,async(req,res,next)=>{try{const sets=[],v=[];if(req.body.nome!==undefined){v.push(String(req.body.nome).trim());sets.push(`nome=$${v.length}`)}if(req.body.slug!==undefined){v.push(slugify(req.body.slug));sets.push(`slug=$${v.length}`)}if(req.body.descricao!==undefined){v.push(req.body.descricao||null);sets.push(`descricao=$${v.length}`)}if(!sets.length)return res.status(400).json({erro:'Nenhuma alteração.'});v.push(req.params.id);const r=await query(`UPDATE categorias SET ${sets.join(',')} WHERE id=$${v.length} RETURNING *`,v);if(!r.rowCount)return res.status(404).json({erro:'Categoria não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});
router.delete('/admin/categorias/:id',admin,async(req,res,next)=>{try{const r=await query('DELETE FROM categorias WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Categoria não encontrada.'});res.json({sucesso:true})}catch(e){next(e)}});

router.get('/admin/stock',admin,async(req,res,next)=>{try{const r=await query(`SELECT p.id,p.nome,p.fornecedor,p.stock,p.ativo,COALESCE(json_agg(json_build_object('id',v.id,'valor',v.valor_opcao,'stock',v.stock,'sku',v.sku_variante) ORDER BY v.id) FILTER(WHERE v.id IS NOT NULL),'[]') variantes FROM produtos p LEFT JOIN produto_variantes v ON v.produto_id=p.id WHERE p.ativo=true GROUP BY p.id ORDER BY p.nome`);res.json(r.rows)}catch(e){next(e)}});
router.put('/admin/stock/:id',admin,async(req,res,next)=>{try{const stock=Math.max(0,Math.trunc(Number(req.body.stock)));const r=await query('UPDATE produtos SET stock=$1 WHERE id=$2 RETURNING id,stock',[stock,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Produto não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});
router.put('/admin/stock/variante/:id',admin,async(req,res,next)=>{try{const stock=Math.max(0,Math.trunc(Number(req.body.stock)));const r=await query('UPDATE produto_variantes SET stock=$1 WHERE id=$2 RETURNING id,stock',[stock,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Variante não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});

router.get('/admin/clientes',admin,async(req,res,next)=>{try{const r=await query(`SELECT c.id,c.nome,c.email,c.telefone,c.criado_em,COUNT(p.id)::int encomendas,COALESCE(SUM(CASE WHEN pp.estado='pago' THEN p.total_eur ELSE 0 END),0)::numeric total_eur FROM clientes c LEFT JOIN pedidos p ON p.cliente_id=c.id LEFT JOIN pedido_pagamentos pp ON pp.pedido_id=p.id GROUP BY c.id ORDER BY c.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});

router.get('/admin/avaliacoes',admin,async(req,res,next)=>{try{const r=await query(`SELECT a.*,p.nome produto_nome FROM avaliacoes a LEFT JOIN produtos p ON p.id=a.produto_id ORDER BY a.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});
router.put('/admin/avaliacoes/:id',admin,async(req,res,next)=>{try{const r=await query('UPDATE avaliacoes SET aprovado=$1 WHERE id=$2 RETURNING *',[!!req.body.aprovado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Avaliação não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});

router.get('/admin/cupons',admin,async(req,res,next)=>{try{const r=await query('SELECT * FROM cupons ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});
router.post('/admin/cupons',admin,async(req,res,next)=>{try{const codigo=String(req.body.codigo||'').trim().toUpperCase();const tipo=req.body.tipo==='valor_fixo'?'valor_fixo':'percentagem';const valor=Number(req.body.valor);if(!codigo||!(valor>0)|| (tipo==='percentagem'&&valor>100))return res.status(400).json({erro:'Cupão inválido.'});const r=await query('INSERT INTO cupons(codigo,tipo,valor,usos_maximos,validade_inicio,validade_fim) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[codigo,tipo,valor,req.body.usosMaximos?Number(req.body.usosMaximos):null,req.body.validadeInicio||null,req.body.validadeFim||null]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
router.put('/admin/cupons/:id',admin,async(req,res,next)=>{try{const allowed=['ativo','validade_inicio','validade_fim','usos_maximos'];const sets=[],v=[];for(const k of allowed)if(req.body[k]!==undefined){v.push(req.body[k]);sets.push(`${k}=$${v.length}`)}if(!sets.length)return res.status(400).json({erro:'Nenhuma alteração.'});v.push(req.params.id);const r=await query(`UPDATE cupons SET ${sets.join(',')} WHERE id=$${v.length} RETURNING *`,v);if(!r.rowCount)return res.status(404).json({erro:'Cupão não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});

router.get('/admin/devolucoes',admin,async(req,res,next)=>{try{const r=await query(`SELECT d.*,p.numero,c.nome cliente_nome,c.email cliente_email FROM devolucoes d JOIN pedidos p ON p.id=d.pedido_id LEFT JOIN clientes c ON c.id=p.cliente_id ORDER BY d.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});
router.put('/admin/devolucoes/:id',admin,async(req,res,next)=>{try{const allowed=['solicitada','em_analise','aprovada','rejeitada','recebida','reembolsada','cancelada'];if(!allowed.includes(req.body.estado))return res.status(400).json({erro:'Estado inválido.'});const r=await query('UPDATE devolucoes SET estado=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[req.body.estado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Devolução não encontrada.'});res.json(r.rows[0])}catch(e){next(e)}});

router.get('/admin/contactos',admin,async(req,res,next)=>{try{const r=await query('SELECT * FROM contactos ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});
router.put('/admin/contactos/:id',admin,async(req,res,next)=>{try{const allowed=['novo','em_atendimento','resolvido','arquivado'];if(!allowed.includes(req.body.estado))return res.status(400).json({erro:'Estado inválido.'});const r=await query('UPDATE contactos SET estado=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[req.body.estado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Contacto não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});

router.get('/admin/newsletter',admin,async(req,res,next)=>{try{const r=await query(`SELECT COUNT(*) FILTER(WHERE ativo)::int total,COUNT(*)::int total_registos FROM newsletter_subscritores`);const env=await query('SELECT * FROM newsletter_campanhas ORDER BY criado_em DESC LIMIT 50');res.json({total:r.rows[0].total,totalRegistos:r.rows[0].total_registos,campanhas:env.rows})}catch(e){next(e)}});

router.get('/admin/conteudo',admin,async(req,res,next)=>{try{const r=await query('SELECT * FROM conteudos ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});
router.post('/admin/conteudo',admin,async(req,res,next)=>{try{const titulo=String(req.body.titulo||'').trim();if(!titulo)return res.status(400).json({erro:'Título obrigatório.'});const r=await query('INSERT INTO conteudos(titulo,slug,categoria,corpo,estado,imagem_url,seo_title,seo_description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[titulo,slugify(req.body.slug||titulo),req.body.categoria||null,req.body.corpo||'',req.body.estado||'rascunho',req.body.imagemUrl||null,req.body.seoTitle||null,req.body.seoDescription||null]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
router.put('/admin/conteudo/:id',admin,async(req,res,next)=>{try{const keys={titulo:'titulo',slug:'slug',categoria:'categoria',corpo:'corpo',estado:'estado',imagemUrl:'imagem_url',seoTitle:'seo_title',seoDescription:'seo_description'};const sets=[],v=[];for(const k of Object.keys(keys))if(req.body[k]!==undefined){v.push(k==='slug'?slugify(req.body[k]):req.body[k]);sets.push(`${keys[k]}=$${v.length}`)}if(!sets.length)return res.status(400).json({erro:'Nenhuma alteração.'});v.push(req.params.id);const r=await query(`UPDATE conteudos SET ${sets.join(',')},atualizado_em=now() WHERE id=$${v.length} RETURNING *`,v);if(!r.rowCount)return res.status(404).json({erro:'Conteúdo não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});
router.delete('/admin/conteudo/:id',admin,async(req,res,next)=>{try{const r=await query('DELETE FROM conteudos WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Conteúdo não encontrado.'});res.json({sucesso:true})}catch(e){next(e)}});

router.get('/admin/configuracoes',admin,async(req,res,next)=>{try{const r=await query('SELECT chave,valor FROM configuracoes_loja ORDER BY chave');res.json(Object.fromEntries(r.rows.map(x=>[x.chave,x.valor])))}catch(e){next(e)}});
router.put('/admin/configuracoes',admin,async(req,res,next)=>{try{const entries=Object.entries(req.body||{});await transaction(async c=>{for(const [k,v] of entries)await c.query(`INSERT INTO configuracoes_loja(chave,valor) VALUES($1,$2) ON CONFLICT(chave) DO UPDATE SET valor=EXCLUDED.valor,atualizado_em=now()`,[k,String(v??'')])});res.json({sucesso:true})}catch(e){next(e)}});
router.get('/admin/pagamentos',admin,async(req,res,next)=>{try{
  const r=await query(`SELECT pp.pedido_id,p.numero,p.total_eur,p.moeda,pp.metodo,pp.estado,pp.id_cobranca,pp.id_cobranca_confirmada,pp.nota,pp.atualizado_em criado_em FROM pedido_pagamentos pp JOIN pedidos p ON p.id=pp.pedido_id ORDER BY pp.atualizado_em DESC`);
  const soma=(estado)=>r.rows.filter(x=>x.estado===estado).reduce((s,x)=>s+Number(x.total_eur||0),0);
  res.json({stats:{recebido_eur:soma('pago'),reembolsado_eur:soma('reembolsado'),pendente_eur:soma('pendente')},pedidos:r.rows});
}catch(e){next(e)}});
router.put('/admin/pagamentos/:pedidoId/marcar-pago',admin,async(req,res,next)=>{try{
  const p=(await query('SELECT id,numero FROM pedidos WHERE numero=$1 OR id::text=$1',[String(req.params.pedidoId)])).rows[0];
  if(!p)return res.status(404).json({erro:'Pedido não encontrado.'});
  const nota=req.body?.nota?String(req.body.nota).trim().slice(0,500):null;
  const r=await query(`UPDATE pedido_pagamentos SET estado='pago',id_cobranca_confirmada=COALESCE(id_cobranca_confirmada,'confirmado-manualmente'),nota=COALESCE($1,nota) WHERE pedido_id=$2 AND estado<>'pago' RETURNING *`,[nota,p.id]);
  if(!r.rowCount)return res.status(409).json({erro:'Este pagamento já estava marcado como pago ou não existe.'});
  await fulfillPedido(p.numero);
  res.json({sucesso:true,pedido:p.numero,pagamento:r.rows[0]});
}catch(e){next(e)}});
router.post('/admin/sincronizar-tracking',admin,async(req,res,next)=>{try{
  const rows=(await query(`SELECT pf.id,pf.fornecedor,pf.id_pedido_fornecedor,p.numero FROM pedido_fornecedores pf JOIN pedidos p ON p.id=pf.pedido_id WHERE pf.id_pedido_fornecedor IS NOT NULL AND pf.estado<>'entregue'`)).rows;
  const resultados=[];
  for(const row of rows){
    try{
      const api=row.fornecedor==='cj'?cj:bucky;
      const t=await api.consultarRastreio(row.id_pedido_fornecedor);
      if(t.codigoRastreio)await query('UPDATE pedido_fornecedores SET rastreio1=$1 WHERE id=$2',[t.codigoRastreio,row.id]);
      resultados.push({numero:row.numero,fornecedor:row.fornecedor,ok:true,rastreio:t.codigoRastreio||null});
    }catch(e){resultados.push({numero:row.numero,fornecedor:row.fornecedor,ok:false,erro:e.message})}
  }
  res.json({total:rows.length,resultados});
}catch(e){next(e)}});
router.get('/admin/status',admin,async(req,res,next)=>{try{
  const paisesDiretos=(process.env.PAISES_COM_ENVIO_DIRETO||'PT,ES,FR,DE,IT,NL,BE,AT,IE,SE,DK,FI,PL,CZ,RO,GB,US,CA,MX,BR,CL,AR,CO').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  res.json({
    stripe:!!process.env.STRIPE_SECRET_KEY,
    appypay:!!(process.env.APPYPAY_ACCESS_TOKEN&&process.env.APPYPAY_PAYMENT_METHOD),
    cj:!!process.env.CJ_API_KEY,
    buckydrop:!!(process.env.BUCKYDROP_API_URL&&process.env.BUCKYDROP_APPCODE&&process.env.BUCKYDROP_APPSECRET),
    agenteDeCarga:!!(process.env.AGENTE_NOME&&process.env.AGENTE_LINHA1&&process.env.AGENTE_CIDADE&&process.env.AGENTE_PAIS),
    paisesDiretos
  });
}catch(e){next(e)}});

router.get('/admin/assinaturas',admin,async(req,res,next)=>{try{const r=await query('SELECT * FROM assinaturas ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});

module.exports=router;
