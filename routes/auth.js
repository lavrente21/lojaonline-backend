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
module.exports=router;
