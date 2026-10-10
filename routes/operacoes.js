const express=require('express');
const {query,transaction}=require('../config/db');
const {exigirAutenticacao}=require('../middleware/auth');
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
router.put('/admin/contactos/:id',admin,async(req,res,next)=>{try{const allowed=['novo','em_analise','respondido','fechado'];if(!allowed.includes(req.body.estado))return res.status(400).json({erro:'Estado inválido.'});const r=await query('UPDATE contactos SET estado=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[req.body.estado,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Contacto não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});

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
// A confirmação de pagamento é implementada em POST /api/pagamentos/admin/:numero/confirmar; não existe ação legada que contorne auditoria.

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
  const metodos = String(process.env.PAGAMENTO_METODOS_ATIVOS || '').split(',').map(x => x.trim()).filter(Boolean);
  const varsPagamento = {
    transferencia: ['PAGAMENTO_TITULAR', 'PAGAMENTO_BANCO', 'PAGAMENTO_IBAN', 'PAGAMENTO_PRAZO_HORAS'],
    deposito: ['PAGAMENTO_TITULAR', 'PAGAMENTO_BANCO', 'PAGAMENTO_PRAZO_HORAS'],
    multicaixa: ['PAGAMENTO_MULTICAIXA_ENTIDADE', 'PAGAMENTO_MULTICAIXA_TELEFONE', 'PAGAMENTO_PRAZO_HORAS']
  };
  const faltamPagamento = [...new Set(metodos.flatMap(m => varsPagamento[m] || []))]
    .filter(k => !String(process.env[k] || '').trim());
  const varsAgente = ['AGENTE_NOME', 'AGENTE_LINHA1', 'AGENTE_CIDADE', 'AGENTE_PAIS', 'AGENTE_TELEFONE'];
  const varsEmpresa = ['EMPRESA_DENOMINACAO', 'EMPRESA_NIF', 'EMPRESA_MORADA', 'EMPRESA_EMAIL', 'EMPRESA_TELEFONE', 'EMPRESA_REPRESENTANTE', 'EMPRESA_HORARIO', 'EMPRESA_LIVRO_RECLAMACOES', 'EMPRESA_IVA'];
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    stripe: false,
    appypay: false,
    cj: !!process.env.CJ_API_KEY,
    resend: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    buckydrop: !!(process.env.BUCKYDROP_API_URL && process.env.BUCKYDROP_APPCODE && process.env.BUCKYDROP_APPSECRET),
    agente: varsAgente.every(k => !!String(process.env[k] || '').trim()),
    iban: !!(process.env.PAGAMENTO_TITULAR && process.env.PAGAMENTO_BANCO && process.env.PAGAMENTO_IBAN),
    transferencia: metodos.includes('transferencia') && !faltamPagamento.includes('PAGAMENTO_IBAN'),
    multicaixa: metodos.includes('multicaixa') && !faltamPagamento.some(k => k.startsWith('PAGAMENTO_MULTICAIXA_')),
    deposito: metodos.includes('deposito') && !faltamPagamento.some(k => ['PAGAMENTO_TITULAR','PAGAMENTO_BANCO'].includes(k)),
    pagamentoConfigurado: metodos.length > 0 && faltamPagamento.length === 0,
    pagamentoVariaveisEmFalta: faltamPagamento,
    agenteVariaveisEmFalta: varsAgente.filter(k => !String(process.env[k] || '').trim()),
    empresaConfigurada: varsEmpresa.every(k => !!String(process.env[k] || '').trim()),
    empresaVariaveisEmFalta: varsEmpresa.filter(k => !String(process.env[k] || '').trim()),
    paisesDiretos
  });
}catch(e){next(e)}});


router.post('/newsletter/subscrever',(req,res)=>res.status(410).json({erro:'Endpoint legado desativado. Use /api/publico/newsletter, que exige confirmação por e-mail.'}));
router.get('/newsletter/cancelar/:token',async(req,res,next)=>{try{const r=await query('UPDATE newsletter_subscritores SET ativo=false,cancelado_em=now(),atualizado_em=now() WHERE token_cancelamento=$1 RETURNING email',[req.params.token]);if(!r.rowCount)return res.status(404).send('Link inválido ou já utilizado.');res.type('html').send('<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Subscrição cancelada — Lúmina</title><main><h1>Subscrição cancelada</h1><p>A sua subscrição da newsletter foi cancelada com sucesso.</p><p><a href="/">Voltar à loja</a></p></main></html>');}catch(e){next(e)}});
router.post('/admin/newsletter/campanhas',admin,async(req,res,next)=>{try{const assunto=String(req.body.assunto||'').trim(),conteudo=String(req.body.conteudo||'').trim();if(!assunto||!conteudo)return res.status(400).json({erro:'Assunto e conteúdo são obrigatórios.'});const r=await query(`INSERT INTO newsletter_campanhas(assunto,conteudo,estado) VALUES($1,$2,'rascunho') RETURNING *`,[assunto,conteudo]);res.status(201).json(r.rows[0]);}catch(e){next(e)}});
router.put('/admin/newsletter/campanhas/:id',admin,async(req,res,next)=>{try{const sets=[],v=[];for(const [k,col] of Object.entries({assunto:'assunto',conteudo:'conteudo'})){if(req.body[k]!==undefined){v.push(String(req.body[k]));sets.push(`${col}=$${v.length}`)}}if(!sets.length)return res.status(400).json({erro:'Nenhuma alteração.'});v.push(req.params.id);const r=await query(`UPDATE newsletter_campanhas SET ${sets.join(',')},atualizado_em=now() WHERE id=$${v.length} AND estado='rascunho' RETURNING *`,v);if(!r.rowCount)return res.status(404).json({erro:'Campanha não encontrada ou já enviada.'});res.json(r.rows[0]);}catch(e){next(e)}});
router.post('/admin/newsletter/campanhas/:id/enviar',admin,async(req,res,next)=>{try{
 const c=(await query(`SELECT * FROM newsletter_campanhas WHERE id=$1 AND estado='rascunho'`,[req.params.id])).rows[0];if(!c)return res.status(404).json({erro:'Campanha não encontrada ou já enviada.'});
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return res.status(503).json({erro:'Configure RESEND_API_KEY e EMAIL_FROM antes de enviar campanhas.'});
 const subs=(await query('SELECT id,email,token_cancelamento FROM newsletter_subscritores WHERE ativo=true')).rows;let enviados=0,falhas=0;const mail=require('../integrations/email');const base=(process.env.BACKEND_PUBLIC_URL||'').replace(/\/$/,'');
 for(const sub of subs){try{const url=`${base}/api/operacoes/newsletter/cancelar/${sub.token_cancelamento}`;await mail.enviarCampanha({to:sub.email,assunto:c.assunto,conteudo:c.conteudo,unsubscribeUrl:url});enviados++;}catch(e){falhas++;console.error('[newsletter]',sub.id,e.message)}}
 await query(`UPDATE newsletter_campanhas SET estado='enviada',enviados=$1,falhas=$2,enviada_em=now(),atualizado_em=now() WHERE id=$3`,[enviados,falhas,c.id]);res.json({sucesso:true,enviados,falhas,total:subs.length});
}catch(e){next(e)}});
router.get('/admin/relatorios/vendas',admin,async(req,res,next)=>{try{
 const desde=String(req.query.desde||'').slice(0,10),ate=String(req.query.ate||'').slice(0,10);const params=[];let filtro="pp.estado='pago'";if(desde){params.push(desde);filtro+=` AND p.criado_em >= $${params.length}::date`}if(ate){params.push(ate);filtro+=` AND p.criado_em < ($${params.length}::date + interval '1 day')`}
 const resumo=await query(`SELECT COUNT(*)::int encomendas,COALESCE(SUM(p.total_eur),0)::numeric receita_eur,COALESCE(AVG(p.total_eur),0)::numeric ticket_medio_eur FROM pedidos p JOIN pedido_pagamentos pp ON pp.pedido_id=p.id WHERE ${filtro}`,params);
 const dias=await query(`SELECT date_trunc('day',p.criado_em)::date dia,COUNT(*)::int encomendas,COALESCE(SUM(p.total_eur),0)::numeric receita_eur FROM pedidos p JOIN pedido_pagamentos pp ON pp.pedido_id=p.id WHERE ${filtro} GROUP BY 1 ORDER BY 1`,params);
 const top=await query(`SELECT pi.nome_produto,SUM(pi.quantidade)::int unidades,COALESCE(SUM(pi.quantidade*pi.preco_unitario_eur),0)::numeric vendas_eur FROM pedido_itens pi JOIN pedidos p ON p.id=pi.pedido_id JOIN pedido_pagamentos pp ON pp.pedido_id=p.id WHERE ${filtro} GROUP BY pi.nome_produto ORDER BY vendas_eur DESC LIMIT 20`,params);
 res.json({resumo:resumo.rows[0],porDia:dias.rows,produtosMaisVendidos:top.rows});
}catch(e){next(e)}});

router.get('/admin/assinaturas',admin,async(req,res,next)=>{try{const r=await query('SELECT * FROM assinaturas ORDER BY criado_em DESC');res.json(r.rows)}catch(e){next(e)}});


// Kits/combos: catalogue CRUD. Bundled checkout remains disabled until the order schema supports atomic kit pricing.
router.get('/kits',async(req,res,next)=>{if(String(process.env.KITS_ATIVOS||'false').toLowerCase()!=='true')return res.status(404).json({erro:'Os kits não estão disponíveis para compra neste momento.'});try{const r=await query(`SELECT k.id,k.nome,k.slug,k.descricao,k.imagem_url,k.preco_eur,COALESCE(json_agg(json_build_object('produtoId',p.id,'nome',p.nome,'quantidade',ki.quantidade,'imagem',(SELECT pi.url FROM produto_imagens pi WHERE pi.produto_id=p.id ORDER BY pi.principal DESC,pi.ordem LIMIT 1),'precoEUR',p.preco_venda_eur) ORDER BY p.nome) FILTER(WHERE p.id IS NOT NULL),'[]') itens FROM kits k LEFT JOIN kit_itens ki ON ki.kit_id=k.id LEFT JOIN produtos p ON p.id=ki.produto_id AND p.ativo=true WHERE k.ativo=true GROUP BY k.id ORDER BY k.criado_em DESC`);res.json(r.rows)}catch(e){next(e)}});
router.post('/admin/kits',admin,async(req,res,next)=>{try{const nome=String(req.body.nome||'').trim(),descricao=String(req.body.descricao||'').trim(),imagem=String(req.body.imagemUrl||'').trim(),preco=Number(req.body.precoEUR),produtos=Array.isArray(req.body.produtos)?req.body.produtos:[];if(!nome||nome.length>180||!Number.isFinite(preco)||preco<=0||!produtos.length)return res.status(400).json({erro:'Nome, preço positivo e pelo menos um produto são obrigatórios.'});if(imagem&&!/^https:\/\//i.test(imagem))return res.status(400).json({erro:'A imagem deve usar HTTPS.'});const slugBase=slugify(nome)||'kit';const slug=slugBase+'-'+Date.now().toString(36);const result=await transaction(async c=>{const k=(await c.query('INSERT INTO kits(nome,slug,descricao,imagem_url,preco_eur) VALUES($1,$2,$3,$4,$5) RETURNING *',[nome,slug,descricao||null,imagem||null,preco])).rows[0];for(const item of produtos){const id=Number(item.produtoId),q=Number(item.quantidade||1);if(!Number.isInteger(id)||id<1||!Number.isInteger(q)||q<1||q>50)throw new Error('Produto ou quantidade inválidos no kit.');const p=await c.query('SELECT id FROM produtos WHERE id=$1 AND ativo=true',[id]);if(!p.rowCount)throw new Error(`Produto ${id} não encontrado ou inativo.`);await c.query('INSERT INTO kit_itens(kit_id,produto_id,quantidade) VALUES($1,$2,$3)',[k.id,id,q]);}return k});res.status(201).json(result)}catch(e){if(e.code==='23505')return res.status(409).json({erro:'Já existe um kit com estes dados.'});next(e)}});
router.put('/admin/kits/:id/estado',admin,async(req,res,next)=>{try{const ativo=!!req.body.ativo;const r=await query('UPDATE kits SET ativo=$1,atualizado_em=now() WHERE id=$2 RETURNING *',[ativo,req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Kit não encontrado.'});res.json(r.rows[0])}catch(e){next(e)}});
router.delete('/admin/kits/:id',admin,async(req,res,next)=>{try{const r=await query('DELETE FROM kits WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Kit não encontrado.'});res.json({sucesso:true})}catch(e){next(e)}});

module.exports=router;
