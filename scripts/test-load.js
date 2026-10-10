'use strict';
const {performance}=require('node:perf_hooks');
(async()=>{
 if(process.env.TEST_ENVIRONMENT!=='1'){console.error('BLOQUEADO: defina TEST_ENVIRONMENT=1 e use apenas um ambiente de staging; este teste envia pedidos inválidos ao checkout.');process.exit(2);}
 const base=String(process.env.TEST_BASE_URL||'').replace(/\/$/,'');if(!/^https?:\/\//.test(base))throw new Error('TEST_BASE_URL inválida.');
 const concurrency=Math.min(50,Math.max(1,Number(process.env.LOAD_CONCURRENCY)||20));const runs=Math.min(500,Math.max(10,Number(process.env.LOAD_REQUESTS)||100));const times=[];let failures=0,unexpected=0;
 const jobs=Array.from({length:runs},async(_,i)=>{const start=performance.now();try{const url=i%2===0?base+'/api/produtos':base+'/api/checkout';const r=i%2===0?await fetch(url,{headers:{Accept:'application/json'}}):await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:'{}'});times.push(performance.now()-start);if(!r.ok&&!(i%2===1&&[400,401,403,429,503].includes(r.status)))unexpected++;}catch{failures++;}});
 for(let i=0;i<jobs.length;i+=concurrency)await Promise.all(jobs.slice(i,i+concurrency));times.sort((a,b)=>a-b);const percentile=p=>Number((times[Math.min(times.length-1,Math.ceil(times.length*p)-1)]||0).toFixed(1));const report={teste:'load-smoke',requests:runs,concorrencia:concurrency,falhasRede:failures,statusInesperado:unexpected,p50_ms:percentile(.5),p95_ms:percentile(.95),p99_ms:percentile(.99)};console.log(JSON.stringify(report));if(failures||unexpected)process.exit(1);
})().catch(e=>{console.error(JSON.stringify({teste:'load-smoke',estado:'falhou',erro:String(e.message||'ERRO')}));process.exit(1)});
