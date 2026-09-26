const express=require('express');
const {obterTaxasEUR,DEFAULT_CURRENCIES}=require('../integrations/cambio');
const router=express.Router();
router.get('/public',async(req,res)=>{try{const x=await obterTaxasEUR(DEFAULT_CURRENCIES);res.set('Cache-Control','no-store');res.json({base:'EUR',rates:x.rates,rateDate:x.rateDate,updatedAt:new Date().toISOString(),supported:Object.keys(x.rates),source:'Frankfurter; AOA via BNA'});}catch(e){res.status(503).json({erro:'Não foi possível obter taxas de câmbio reais neste momento.'});}});
module.exports=router;
