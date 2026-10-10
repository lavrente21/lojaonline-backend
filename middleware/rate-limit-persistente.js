'use strict';
const {query}=require('../config/db');
const crypto=require('crypto');
function rateLimitPersistente({nome,limite=20,janelaSegundos=900}){
 return async function(req,res,next){
  try{
   const ip=String(req.ip||req.socket?.remoteAddress||'unknown');
   const key=crypto.createHash('sha256').update(`${nome}:${ip}`).digest('hex');
   const r=await query(`INSERT INTO rate_limit_buckets(bucket_key,window_started_at,hit_count,updated_at)
    VALUES($1,now(),1,now()) ON CONFLICT(bucket_key) DO UPDATE SET
    window_started_at=CASE WHEN rate_limit_buckets.window_started_at < now()-($2 * interval '1 second') THEN now() ELSE rate_limit_buckets.window_started_at END,
    hit_count=CASE WHEN rate_limit_buckets.window_started_at < now()-($2 * interval '1 second') THEN 1 ELSE rate_limit_buckets.hit_count+1 END,
    blocked_until=CASE WHEN rate_limit_buckets.blocked_until>now() THEN rate_limit_buckets.blocked_until ELSE NULL END,
    updated_at=now() RETURNING hit_count,blocked_until,EXTRACT(EPOCH FROM (window_started_at+($2 * interval '1 second')-now()))::int AS retry_after`,[key,janelaSegundos]);
   const b=r.rows[0];
   if(b.blocked_until&&new Date(b.blocked_until)>new Date()||Number(b.hit_count)>limite){
    await query(`UPDATE rate_limit_buckets SET blocked_until=GREATEST(COALESCE(blocked_until,now()),now()+($2 * interval '1 second')),updated_at=now() WHERE bucket_key=$1`,[key,janelaSegundos]);
    res.setHeader('Retry-After',String(Math.max(1,Number(b.retry_after)||janelaSegundos)));
    return res.status(429).json({erro:'Demasiados pedidos. Tente novamente mais tarde.'});
   }
   next();
  }catch(e){next(e)}
 };
}
module.exports={rateLimitPersistente};
