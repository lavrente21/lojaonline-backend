const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { gerarToken } = require('../middleware/auth');
const router = express.Router();
const normalizar = e => String(e || '').trim().toLowerCase();

router.post('/clientes/registar', async (req,res,next)=>{ try {
  const { nome, email, palavraPasse, telefone } = req.body;
  if(!nome || !email || !palavraPasse || palavraPasse.length < 8) return res.status(400).json({erro:'Nome, e-mail e palavra-passe (mínimo 8 caracteres) são obrigatórios.'});
  const e=normalizar(email); const existe=await query('SELECT id FROM clientes WHERE email=$1',[e]); if(existe.rowCount) return res.status(409).json({erro:'Já existe uma conta com este e-mail.'});
  const hash=await bcrypt.hash(palavraPasse,12); const r=await query('INSERT INTO clientes(nome,email,password_hash,telefone) VALUES($1,$2,$3,$4) RETURNING id,nome,email,telefone',[nome.trim(),e,hash,telefone||null]);
  const c=r.rows[0]; res.status(201).json({token:gerarToken({id:c.id,tipo:'cliente'}),cliente:c});
 } catch(e){next(e)} });

router.post('/clientes/login', async(req,res,next)=>{try{
 const e=normalizar(req.body.email); const r=await query('SELECT id,nome,email,telefone,password_hash FROM clientes WHERE email=$1',[e]); const c=r.rows[0];
 if(!c || !(await bcrypt.compare(req.body.palavraPasse||'',c.password_hash))) return res.status(401).json({erro:'E-mail ou palavra-passe incorretos.'});
 delete c.password_hash; res.json({token:gerarToken({id:c.id,tipo:'cliente'}),cliente:c});
}catch(e){next(e)}});

router.post('/admin/login', async(req,res,next)=>{try{
 const e=normalizar(req.body.email); const r=await query('SELECT id,nome,email,papel,password_hash FROM admins WHERE email=$1',[e]); const a=r.rows[0];
 if(!a || !(await bcrypt.compare(req.body.palavraPasse||'',a.password_hash))) return res.status(401).json({erro:'E-mail ou palavra-passe incorretos.'});
 delete a.password_hash; res.json({token:gerarToken({id:a.id,tipo:'admin',papel:a.papel}),admin:a});
}catch(e){next(e)}});

router.get('/clientes/me', exigirAutenticacao('cliente'), async(req,res,next)=>{try{const r=await query('SELECT id,nome,email,telefone,criado_em FROM clientes WHERE id=$1',[req.utilizador.id]);if(!r.rowCount)return res.status(404).json({erro:'Cliente não encontrado.'});res.json(r.rows[0]);}catch(e){next(e)}});
router.put('/clientes/me', exigirAutenticacao('cliente'), async(req,res,next)=>{try{const sets=[],vals=[];if(req.body.nome!==undefined){const v=String(req.body.nome||'').trim();if(!v)return res.status(400).json({erro:'Nome obrigatório.'});vals.push(v);sets.push(`nome=$${vals.length}`)}if(req.body.telefone!==undefined){vals.push(req.body.telefone||null);sets.push(`telefone=$${vals.length}`)}if(req.body.email!==undefined){const email=normalizar(req.body.email);if(!email)return res.status(400).json({erro:'E-mail obrigatório.'});vals.push(email);sets.push(`email=$${vals.length}`)}if(!sets.length)return res.status(400).json({erro:'Nenhuma alteração.'});vals.push(req.utilizador.id);const r=await query(`UPDATE clientes SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING id,nome,email,telefone,criado_em`,vals);res.json(r.rows[0]);}catch(e){if(e.code==='23505')return res.status(409).json({erro:'Este e-mail já está associado a outra conta.'});next(e)}});
router.get('/clientes/enderecos', exigirAutenticacao('cliente'), async(req,res,next)=>{try{const r=await query('SELECT * FROM clientes_enderecos WHERE cliente_id=$1 ORDER BY predefinido DESC,id DESC',[req.utilizador.id]);res.json(r.rows)}catch(e){next(e)}});
router.post('/clientes/enderecos', exigirAutenticacao('cliente'), async(req,res,next)=>{try{const {rotulo,linha1,linha2,cidade,codigoPostal,pais,telefone,predefinido}=req.body;if(!linha1||!cidade||!pais)return res.status(400).json({erro:'Morada, cidade e país são obrigatórios.'});const r=await query('INSERT INTO clientes_enderecos(cliente_id,rotulo,linha1,linha2,cidade,codigo_postal,pais,telefone,predefinido) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[req.utilizador.id,rotulo||null,linha1,linha2||null,cidade,codigoPostal||null,String(pais).toUpperCase(),telefone||null,!!predefinido]);if(predefinido)await query('UPDATE clientes_enderecos SET predefinido=false WHERE cliente_id=$1 AND id<>$2',[req.utilizador.id,r.rows[0].id]);res.status(201).json(r.rows[0]);}catch(e){next(e)}});
router.put('/clientes/enderecos/:id', exigirAutenticacao('cliente'), async(req,res,next)=>{try{const allowed={rotulo:'rotulo',linha1:'linha1',linha2:'linha2',cidade:'cidade',codigoPostal:'codigo_postal',pais:'pais',telefone:'telefone',predefinido:'predefinido'};const sets=[],vals=[];for(const k of Object.keys(allowed))if(req.body[k]!==undefined){vals.push(k==='pais'?String(req.body[k]).toUpperCase():req.body[k]);sets.push(`${allowed[k]}=$${vals.length}`)}if(!sets.length)return res.status(400).json({erro:'Nenhuma alteração.'});vals.push(req.params.id,req.utilizador.id);const r=await query(`UPDATE clientes_enderecos SET ${sets.join(',')} WHERE id=$${vals.length-1} AND cliente_id=$${vals.length} RETURNING *`,vals);if(!r.rowCount)return res.status(404).json({erro:'Morada não encontrada.'});if(req.body.predefinido)await query('UPDATE clientes_enderecos SET predefinido=false WHERE cliente_id=$1 AND id<>$2',[req.utilizador.id,r.rows[0].id]);res.json(r.rows[0]);}catch(e){next(e)}});
router.delete('/clientes/enderecos/:id', exigirAutenticacao('cliente'), async(req,res,next)=>{try{const r=await query('DELETE FROM clientes_enderecos WHERE id=$1 AND cliente_id=$2 RETURNING id',[req.params.id,req.utilizador.id]);if(!r.rowCount)return res.status(404).json({erro:'Morada não encontrada.'});res.json({sucesso:true});}catch(e){next(e)}});
router.get('/clientes/assinaturas', exigirAutenticacao('cliente'), async(req,res,next)=>{try{const r=await query('SELECT * FROM assinaturas WHERE cliente_id=$1 ORDER BY criado_em DESC',[req.utilizador.id]);res.json(r.rows)}catch(e){next(e)}});

module.exports=router;
