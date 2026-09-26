const express=require('express');
const {obterTaxasEUR,DEFAULT_CURRENCIES}=require('../integrations/cambio');
const router=express.Router();
router.get('/public',async(req,res)=>{try{const rates=await obterTaxasEUR(DEFAULT_CURRENCIES);res.set('Cache-Control','public,max-age=900');res.json({base:'EUR',rates,updatedAt:new Date().toISOString(),supported:Object.keys(rates),source:'Frankfurter; AOA via BNA'});}catch(e){res.status(503).json({erro:'Não foi possível obter taxas de câmbio reais neste momento.'});}});
module.exports=router;
