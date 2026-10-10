require('dotenv').config();
const express=require('express'),cors=require('cors'),helmet=require('helmet');
const app=express();app.disable('x-powered-by');app.set('trust proxy', 1);app.use(helmet());

if (process.env.NODE_ENV === 'production') {
  const { validarAmbiente } = require('./config/env');
  const validacao = validarAmbiente(process.env);
  if (!validacao.ok) {
    for (const erro of validacao.erros) console.error(`[env] ${erro}`);
    throw new Error('Configuração de produção incompleta; consulte os nomes das variáveis acima.');
  }
}
const {query}=require('./config/db');
const auth=require('./routes/auth'),produtos=require('./routes/produtos'),checkout=require('./routes/checkout'),pedidos=require('./routes/pedidos'),webhooks=require('./routes/webhooks'),config=require('./routes/config'),operacoes=require('./routes/operacoes'),publico=require('./routes/publico'),pagamentos=require('./routes/pagamentos'),fornecedoresAdmin=require('./routes/fornecedores-admin');
const normalizarOrigem=(valor)=>{try{return new URL(String(valor).trim()).origin}catch{return null}};
const origensConfiguradas=[...(process.env.ORIGENS_PERMITIDAS||'').split(','),process.env.FRONTEND_URL,process.env.ADMIN_URL].filter(Boolean).map(normalizarOrigem).filter(Boolean);
const originsPermitidas=new Set(origensConfiguradas);
if(process.env.NODE_ENV==='production'&&(!process.env.FRONTEND_URL||!process.env.ADMIN_URL))throw new Error('FRONTEND_URL e ADMIN_URL são obrigatórias em produção.');
app.use(cors({origin:(origin,cb)=>{if(!origin||originsPermitidas.has(normalizarOrigem(origin)))return cb(null,true);cb(null,false)},methods:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','Accept','X-Requested-With','Cache-Control','Pragma']}));
// O router de webhooks deve receber RAW; os restantes endpoints usam JSON.
app.use('/api/webhooks/stripe',express.raw({type:'application/json'}));
app.use(express.json({limit:'1mb',strict:true}));
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
app.get('/health',async(req,res)=>{try{await query('SELECT 1');res.json({ok:true,db:true,servico:'Lúmina API',hora:new Date().toISOString()})}catch(e){res.status(503).json({ok:false,db:false})}});
app.get('/',(req,res)=>res.json({ok:true,servico:'Lúmina API'}));
app.use('/api/config',config);app.use('/api/auth',auth);app.use('/api/publico',publico);app.use('/api/produtos',produtos);app.use('/api/checkout',checkout);app.use('/api/pedidos',pedidos);app.use('/api/webhooks',webhooks);app.use('/api/operacoes',operacoes);app.use('/api/pagamentos',pagamentos);app.use('/api/operacoes',fornecedoresAdmin);
app.use((err,req,res,next)=>{
  const codigo = String(err?.code || 'INTERNAL_ERROR').replace(/[^A-Za-z0-9_-]/g, '').slice(0,40);
  console.error(JSON.stringify({nivel:'error',codigo,rota:req.path,metodo:req.method,quando:new Date().toISOString()}));
  const status=[400,413].includes(Number(err?.status||err?.statusCode))?Number(err.status||err.statusCode):500;
  const mensagem=status===400?'Pedido JSON inválido.':status===413?'O corpo do pedido excede o limite permitido.':'Erro interno do servidor.';
  res.status(status).json({erro:mensagem,codigo:status===500?codigo:undefined});
});
app.use('/api', (req,res)=>res.status(404).json({erro:'Endpoint não encontrado.'}));
const port=Number(process.env.PORT||3000);const servidor=app.listen(port,()=>console.log(`Lúmina API na porta ${port}`));
servidor.on('error',e=>console.error(JSON.stringify({nivel:'error',evento:'server_error',codigo:e.code||'UNKNOWN'})));
process.on('unhandledRejection',e=>console.error(JSON.stringify({nivel:'error',evento:'unhandled_rejection',tipo:typeof e})));
process.on('uncaughtException',e=>{console.error(JSON.stringify({nivel:'fatal',evento:'uncaught_exception',codigo:e?.code||'UNKNOWN'}));servidor.close(()=>process.exit(1));});
process.on('SIGTERM',()=>servidor.close(()=>{const db=require('./config/db');Promise.resolve(db.pool?.end?.()).finally(()=>process.exit(0));}));
