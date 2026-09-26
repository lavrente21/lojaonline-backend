const express=require('express'); const {query,transaction}=require('../config/db'); const {exigirAutenticacao}=require('../middleware/auth'); const cj=require('../integrations/cj-api'); const {obterTaxaUsdEur}=require('../integrations/cambio');
const router=express.Router();
const map=p=>({...p,id:Number(p.id),precoVendaEUR:Number(p.preco_venda_eur),precoCustoEUR:Number(p.preco_custo_eur),idFornecedor:p.id_fornecedor,skuFornecedor:p.sku_fornecedor,stock:Number(p.stock),categoria:p.categoria_nome||''});
router.get('/',async(req,res,next)=>{try{const r=await query(`SELECT p.*,c.nome categoria_nome,(SELECT url FROM produto_imagens i WHERE i.produto_id=p.id ORDER BY i.principal DESC,i.ordem LIMIT 1) imagem_principal FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.ativo=true ORDER BY p.criado_em DESC`);res.json(r.rows.map(map))}catch(e){next(e)}});
router.get('/importar/cj',exigirAutenticacao('admin'),async(req,res,next)=>{try{const id=String(req.query.id||'').trim();if(!id)return res.status(400).json({erro:'ID ou URL do produto CJ obrigatório.'});const d=await cj.consultarProduto(id); try{const taxa=await obterTaxaUsdEur(); if(d.precoCustoUSD!=null)d.precoCustoEUR=Number((Number(d.precoCustoUSD)*taxa).toFixed(2)); if(d.precoVendaSugeridoUSD!=null)d.precoVendaSugeridoEUR=Number((Number(d.precoVendaSugeridoUSD)*taxa).toFixed(2)); d.cambioUsdEur=taxa;}catch(e){d.avisoCambio=e.message;} res.json(d)}catch(e){next(e)}});

router.get('/:id/fretes',async(req,res,next)=>{try{
 const produto=(await query('SELECT id,fornecedor,id_fornecedor,peso_gramas,atributos_cj FROM produtos WHERE id=$1 AND ativo=true',[req.params.id])).rows[0];
 if(!produto)return res.status(404).json({erro:'Produto não encontrado.'});
 const pais=String(req.query.pais||'').toUpperCase(); if(!/^[A-Z]{2}$/.test(pais))return res.status(400).json({erro:'País de destino inválido.'});
 const quantidade=Math.max(1,Number(req.query.quantidade||1)); const varianteId=Number(req.query.varianteId||0);
 if(produto.fornecedor!=='cj')return res.json({origem:'fornecedor',disponivel:false,metodos:[],mensagem:'Cálculo de frete deste fornecedor ainda não está disponível.'});
 const vars=(await query('SELECT id_fornecedor_variante,sku_variante,stock FROM produto_variantes WHERE produto_id=$1 AND ($2=0 OR id=$2) ORDER BY id LIMIT 1',[produto.id,varianteId])).rows[0];
 const vid=vars?.id_fornecedor_variante;
 if(!vid)return res.status(409).json({erro:'Este produto ainda não tem uma Variant ID real da CJ para calcular o frete.'});
 const metodos=await cj.calcularFrete({destino:pais,zip:req.query.zip,produtos:[{vid,quantity:quantidade}]});
 res.json({origem:'cj',pais,moeda:'USD',metodos});
}catch(e){next(e)}});
router.get('/:id/avaliacoes',async(req,res,next)=>{try{
 const produto=(await query('SELECT id,fornecedor,id_fornecedor FROM produtos WHERE id=$1 AND ativo=true',[req.params.id])).rows[0];
 if(!produto)return res.status(404).json({erro:'Produto não encontrado.'});
 const page=Math.max(1,Number(req.query.page||1)); const pageSize=Math.min(50,Math.max(1,Number(req.query.pageSize||10)));
 const locais=await query('SELECT a.id,a.nome_autor,a.estrelas,a.comentario,a.criado_em FROM avaliacoes a WHERE a.produto_id=$1 AND a.aprovado=true ORDER BY a.criado_em DESC LIMIT $2 OFFSET $3',[produto.id,pageSize,(page-1)*pageSize]);
 const count=await query('SELECT count(*)::int total FROM avaliacoes WHERE produto_id=$1 AND aprovado=true',[produto.id]);
 let fornecedor=null; if(produto.fornecedor==='cj'&&produto.id_fornecedor){try{fornecedor=await cj.consultarAvaliacoes(produto.id_fornecedor,{page,pageSize});}catch(e){fornecedor={total:0,pagina:page,tamanho:pageSize,lista:[],erro:e.message};}}
 res.json({proprias:{total:count.rows[0].total,lista:locais.rows},fornecedor:{nome:'CJ Dropshipping',total:fornecedor?.total||0,lista:fornecedor?.lista||[]},nota:localsRating(locais.rows)});
}catch(e){next(e)}});
function localsRating(rows){if(!rows.length)return null;return Number((rows.reduce((s,x)=>s+Number(x.estrelas),0)/rows.length).toFixed(1));}
router.get('/:id',async(req,res,next)=>{try{const r=await query(`SELECT p.*,c.nome categoria_nome FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.id=$1 AND p.ativo=true`,[req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Produto não encontrado.'});const p=map(r.rows[0]);const imgs=await query('SELECT url,principal,ordem FROM produto_imagens WHERE produto_id=$1 ORDER BY ordem',[req.params.id]);const vars=await query('SELECT id,nome_opcao,valor_opcao,sku_variante,id_fornecedor_variante,preco_extra_eur,stock,imagem_url FROM produto_variantes WHERE produto_id=$1',[req.params.id]);p.imagens=imgs.rows;p.variantes=vars.rows;res.json(p)}catch(e){next(e)}});
router.post('/',exigirAutenticacao('admin'),async(req,res,next)=>{try{const {nome,categoria,precoVendaEUR,precoCustoEUR,fornecedor,idFornecedor,skuFornecedor,stock,descricao,linkFornecedor,imagemUrl,imagens,variantes,atributosCJ,pesoGramas}=req.body;if(!nome||!fornecedor)return res.status(400).json({erro:'Nome e fornecedor são obrigatórios.'});
 const result=await transaction(async(client)=>{
  const r=await client.query(`INSERT INTO produtos(nome,categoria_id,descricao,preco_venda_eur,preco_custo_eur,fornecedor,id_fornecedor,sku_fornecedor,link_fornecedor,stock,peso_gramas,atributos_cj) VALUES($1,(SELECT id FROM categorias WHERE lower(nome)=lower($2) LIMIT 1),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[nome,categoria||null,descricao||null,Number(precoVendaEUR)||0,Number(precoCustoEUR)||0,fornecedor,idFornecedor||null,skuFornecedor||null,linkFornecedor||null,Number(stock)||0,pesoGramas?Number(pesoGramas):null,atributosCJ||null]);
  const produto=r.rows[0];
  const imgs=[imagemUrl,...(Array.isArray(imagens)?imagens:[])].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  for(let i=0;i<imgs.length;i++) await client.query('INSERT INTO produto_imagens(produto_id,url,principal,ordem) VALUES($1,$2,$3,$4)',[produto.id,imgs[i],i===0,i]);
  if(Array.isArray(variantes)) for(const v of variantes){ if(!v?.vid && !v?.sku) continue; const partes=String(v.opcoes||'').split('-').filter(Boolean); const nomeOpcao=partes.length>1?'Opção':'Variante'; const valorOpcao=partes.join(' / ')||v.nome||v.vid; await client.query(`INSERT INTO produto_variantes(produto_id,nome_opcao,valor_opcao,sku_variante,id_fornecedor_variante,preco_extra_eur,stock,imagem_url) VALUES($1,$2,$3,$4,$5,0,$6,$7) ON CONFLICT (produto_id,nome_opcao,valor_opcao) DO UPDATE SET sku_variante=EXCLUDED.sku_variante,stock=EXCLUDED.stock,imagem_url=EXCLUDED.imagem_url`,[produto.id,nomeOpcao,valorOpcao,v.sku||v.vid,v.vid||null,Number(v.stock)||0,v.imagemUrl||null]); }
  return produto;
 }); res.status(201).json(map(result));
}catch(e){if(e.code==='23505')return res.status(409).json({erro:'Este produto do fornecedor já está cadastrado.'});next(e)}});
router.put('/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const allowed=['nome','descricao','precoVendaEUR','precoCustoEUR','fornecedor','idFornecedor','skuFornecedor','stock','ativo','destaque'];const vals=[],sets=[];for(const k of allowed)if(req.body[k]!==undefined){const col={precoVendaEUR:'preco_venda_eur',precoCustoEUR:'preco_custo_eur',idFornecedor:'id_fornecedor',skuFornecedor:'sku_fornecedor'}[k]||k;vals.push(req.body[k]);sets.push(`${col}=$${vals.length}`)}if(!sets.length)return res.status(400).json({erro:'Nenhuma alteração.'});vals.push(req.params.id);const r=await query(`UPDATE produtos SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,vals);if(!r.rowCount)return res.status(404).json({erro:'Produto não encontrado.'});res.json(map(r.rows[0]))}catch(e){next(e)}});
router.delete('/:id',exigirAutenticacao('admin'),async(req,res,next)=>{try{const r=await query('UPDATE produtos SET ativo=false WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({erro:'Produto não encontrado.'});res.json({sucesso:true})}catch(e){next(e)}});
module.exports=router;
