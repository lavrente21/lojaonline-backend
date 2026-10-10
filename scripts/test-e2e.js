'use strict';
(async()=>{
 if(!process.env.PLAYWRIGHT_BASE_URL){console.error('SKIPPED: defina PLAYWRIGHT_BASE_URL para apontar a um ambiente de staging isolado.');process.exit(2);}
 let chromium;try{({chromium}=require('playwright'));}catch{console.error('SKIPPED: Playwright não está instalado neste ambiente. Instale Playwright e Chromium no runner de CI.');process.exit(2);}
 const base=process.env.PLAYWRIGHT_BASE_URL.replace(/\/$/,'');const browser=await chromium.launch({headless:true});let failures=0;
 try{for(const viewport of [{width:1365,height:900},{width:390,height:844}]){const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));const response=await page.goto(base+'/checkout.html',{waitUntil:'domcontentloaded'});if(!response||!response.ok()){console.error(`FAIL checkout ${viewport.width}px: HTTP ${response?.status()||'sem resposta'}`);failures++;}await page.waitForTimeout(1500);const methods=await page.locator('#ck-metodos-pagamento').count();if(methods!==1){console.error(`FAIL checkout ${viewport.width}px: seletor de pagamento não encontrado`);failures++;}if(errors.length){console.error(`FAIL erros JS ${viewport.width}px: ${errors.join(' | ')}`);failures++;}else console.log(`PASS checkout ${viewport.width}px: página carregada sem erros JS; validar métodos conforme env do staging.`);await page.close();}}finally{await browser.close();}
 if(failures)process.exit(1);
 console.log('E2E smoke tests concluídos. Isto não cobre fluxo de compra completo; esse fluxo exige conta de teste e produtos de staging reais.');
})().catch(e=>{console.error(`E2E falhou (${String(e.message||'ERRO')})`);process.exit(1)});
