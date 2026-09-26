require('dotenv').config();
const express=require('express'),cors=require('cors'),helmet=require('helmet');
const {query}=require('./config/db');
const auth=require('./routes/auth'),produtos=require('./routes/produtos'),checkout=require('./routes/checkout'),pedidos=require('./routes/pedidos'),webhooks=require('./routes/webhooks');
const app=express();app.disable('x-powered-by');app.use(helmet());
const origins=(process.env.ORIGENS_PERMITIDAS||'').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({origin:(origin,cb)=>{if(!origin||origins.includes(origin))return cb(null,true);cb(new Error('Origem não permitida.'))}}));
// O router de webhooks deve receber RAW; os restantes endpoints usam JSON.
app.use('/api/webhooks/stripe',express.raw({type:'application/json'}));
app.use(express.json({limit:'1mb'}));
app.get('/health',async(req,res)=>{try{await query('SELECT 1');res.json({ok:true,db:true,servico:'Lúmina API',hora:new Date().toISOString()})}catch(e){res.status(503).json({ok:false,db:false})}});
app.get('/',(req,res)=>res.json({ok:true,servico:'Lúmina API'}));
app.use('/api/auth',auth);app.use('/api/produtos',produtos);app.use('/api/checkout',checkout);app.use('/api/pedidos',pedidos);app.use('/api/webhooks',webhooks);
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({erro:process.env.NODE_ENV==='production'?'Erro interno do servidor.':err.message})});
const port=Number(process.env.PORT||3000);app.listen(port,()=>console.log(`Lúmina API na porta ${port}`));
