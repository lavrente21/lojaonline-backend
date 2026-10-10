const assert=require('node:assert/strict');
(async()=>{
 let calls=[];
 const required=['CJ_API_KEY_TEST','BUCKYDROP_APPCODE_TEST','BUCKYDROP_APPSECRET_TEST'];const missing=required.filter(k=>!process.env[k]);if(missing.length){console.error('SKIPPED: variáveis de credenciais efémeras de teste em falta: '+missing.join(', '));process.exit(2);}
 process.env.CJ_API_KEY=process.env.CJ_API_KEY_TEST;process.env.CJ_FROM_COUNTRY_CODE=process.env.CJ_FROM_COUNTRY_CODE_TEST||'CN';
 global.fetch=async(url,opts={})=>{calls.push({url:String(url),opts});if(String(url).includes('/authentication/getAccessToken'))return new Response(JSON.stringify({result:true,data:{accessToken:'test-token'}}),{status:200,headers:{'content-type':'application/json'}});if(String(url).includes('/logistic/freightCalculate'))return new Response(JSON.stringify({result:true,data:[{logisticName:'Mock Carrier',totalPostageFee:5.25,logisticAging:'8-12 days'}]}),{status:200,headers:{'content-type':'application/json'}});throw new Error('Unexpected CJ request '+url)};
 const cj=require('../integrations/cj-api');
 const cjRows=await cj.calcularFrete({destino:'PT',zip:'1000-001',produtos:[{vid:'VID-TEST',quantity:2}]});
 assert.equal(cjRows.length,1);assert.equal(cjRows[0].nome,'Mock Carrier');assert.equal(cjRows[0].totalUSD,5.25);assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].opts.body).endCountryCode,'PT');
 process.env.BUCKYDROP_API_URL=process.env.BUCKYDROP_API_URL_TEST||'https://bucky.invalid';process.env.BUCKYDROP_APPCODE=process.env.BUCKYDROP_APPCODE_TEST;process.env.BUCKYDROP_APPSECRET=process.env.BUCKYDROP_APPSECRET_TEST;process.env.BUCKYDROP_FREIGHT_PATH='/test/freight';
 delete require.cache[require.resolve('../integrations/buckydrop-api')];
 global.fetch=async(url,opts={})=>{calls.push({url:String(url),opts});return new Response(JSON.stringify({success:true,data:{methods:[{name:'Bucky Mock',shippingFee:7.75,estimatedDays:'10-15 days'}]}}),{status:200,headers:{'content-type':'application/json'}})};
 const bucky=require('../integrations/buckydrop-api');const bRows=await bucky.calcularFrete({destino:'AO',zip:'',produtos:[{sku:'SKU-TEST',quantity:1}]});
 assert.equal(bRows.length,1);assert.equal(bRows[0].nome,'Bucky Mock');assert.equal(bRows[0].totalUSD,7.75);assert.ok(calls.at(-1).url.includes('/test/freight'));
 console.log('PASS CJ freight quote adapter (mock API)');console.log('PASS BuckyDrop freight quote adapter (mock API)');console.log('2/2 integration adapter tests passed (no real external requests).');
})().catch(e=>{console.error(e);process.exit(1)});
