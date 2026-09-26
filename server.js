require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { verificarLigacao } = require('./config/db');

const authRoutes = require('./routes/auth');
const produtosRoutes = require('./routes/produtos');
const checkoutRoutes = require('./routes/checkout');
const webhooksRoutes = require('./routes/webhooks');
const webhookStripeRoutes = require('./routes/webhook-stripe');
const pedidosRoutes = require('./routes/pedidos');

const sincronizarEstoque = require('./jobs/sincronizar-estoque');
const verificarPedidosParados = require('./jobs/verificar-pedidos-parados');

const app = express();

// CORS: em desenvolvimento aceita qualquer origem (inclui abrir os .html
// diretamente no navegador, onde a origem é "null"). Em produção, trocar
// por app.use(cors({ origin: origensPermitidas })) com a lista fixa abaixo.
const origensPermitidas = (process.env.ORIGENS_PERMITIDAS || 'http://localhost:5500,http://localhost:5501')
  .split(',').map(s => s.trim());
app.use(cors({ origin: true }));
// TODO produção: app.use(cors({ origin: origensPermitidas }));

// O webhook do Stripe TEM de vir antes do express.json() global — a
// verificação de assinatura precisa do corpo em bruto, não já convertido em JSON.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), webhookStripeRoutes);

app.use(express.json());

app.get('/', (req, res) => res.json({ ok: true, servico: 'Lúmina API', hora: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/pedidos', pedidosRoutes);

// Middleware de erro genérico — evita que uma exceção derrube o servidor
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORTA = process.env.PORTA || 3000;
app.listen(PORTA, async () => {
  console.log(`\n🚀 API da Lúmina a correr em http://localhost:${PORTA}`);
  console.log(`   Origens CORS permitidas: ${origensPermitidas.join(', ')}\n`);

  try {
    const agora = await verificarLigacao();
    console.log(`✅ Ligado à base de dados PostgreSQL (hora do servidor: ${agora})`);
  } catch (erro) {
    console.error('❌ Não foi possível ligar à base de dados. Confirma DATABASE_URL no .env e corre `npm run migrate`.');
    console.error('   Detalhe:', erro.message);
  }

  // Jobs automáticos (em produção, isto normalmente corre num processo/worker separado)
  const UMA_HORA = 60 * 60 * 1000;
  setInterval(sincronizarEstoque, UMA_HORA);
  setInterval(verificarPedidosParados, UMA_HORA);
});
