const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
function readExtracted(base,prefix){const dir=path.resolve(root,base,'js/extracted');return fs.readdirSync(dir).filter(f=>f.startsWith(prefix+'-')).map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n')}
const checks=[];
function assert(name,condition){checks.push({name,ok:!!condition});}
const checkout=read('routes/checkout.js');
const hooks=read('routes/webhooks.js');
const ops=read('routes/operacoes.js');
const auth=read('routes/auth.js');
const page=fs.readFileSync(path.resolve(root,'../lojaonline-main/checkout.html'),'utf8');
const adminPayments=fs.readFileSync(path.resolve(root,'../lojaonline-admin-main/pagamentos.html'),'utf8')+'\n'+readExtracted('../lojaonline-admin-main','pagamentos');
const bucky=read('integrations/buckydrop-api.js');
const migration=read('migrations/2026-10-12-shipping-commerce.sql');
const migrateRunner=read('migrate.js');
const kitsPage=fs.readFileSync(path.resolve(root,'../lojaonline-main/kits.html'),'utf8')+'\n'+readExtracted('../lojaonline-main','kits');
assert('Checkout exige método manual configurado e cria pagamento pendente',checkout.includes('metodoPagamento') && checkout.includes("'pendente',NULL,NULL"));
assert('Checkout não chama diretamente APIs de pagamento',!/require\(['"]\.\.\/integrations\/(pagamentos-eur|appypay)['"]\)/.test(checkout));
assert('Checkout calcula cotações de fornecedores sem inventar preços',checkout.includes('calcularFrete')&&checkout.includes('portesConfirmados')&&checkout.includes('Não será inventado um valor'));
assert('Webhook Stripe permanece desativado sem credenciais reais',hooks.includes('Pagamentos Stripe ainda não estão ativados'));
assert('Webhook AppyPay permanece desativado sem credenciais reais',hooks.includes('Pagamentos AppyPay ainda não estão ativados'));
assert('Cálculo de portes BuckyDrop exige endpoint da conta, sem inventar URL',bucky.includes('BUCKYDROP_FREIGHT_PATH')&&bucky.includes('Configure BUCKYDROP_FREIGHT_PATH'));
assert('Subscrições exigem consentimento explícito',auth.includes('req.body.consentimento!==true'));
assert('Subscrições aguardam pagamento recorrente real',auth.includes('pendente_pagamento')&&auth.includes('cobrancaRecorrenteAtiva:false'));
assert('Cancelamento de subscrição limitado ao próprio cliente',auth.includes('/clientes/assinaturas/:id/cancelar')&&auth.includes('cliente_id=$2'));
assert('Migração comercial usa IF NOT EXISTS',migration.includes('ADD COLUMN IF NOT EXISTS')&&migration.includes('CREATE TABLE IF NOT EXISTS kits')&&migration.includes('CREATE TABLE IF NOT EXISTS kit_itens'));
assert('Runner de migrações serializa execução e valida o esquema',migrateRunner.includes('pg_advisory_lock')&&migrateRunner.includes('Validação pós-migração'));
assert('Checkout guarda província e resolve morada do fornecedor/agente',checkout.includes('entrega_provincia')&&checkout.includes('fornecedor_morada_provincia')&&checkout.includes('resolverMoradaParaFornecedor'));
assert('Checkout não soma estimativa de portes ao valor a cobrar',page.includes('Total dos produtos (portes por confirmar)'));
assert('Página de kits carrega kits reais e escapa conteúdo',kitsPage.includes("apiFetch('/operacoes/kits')")&&kitsPage.includes('escKit'));
assert('Endpoint público de kits e operações administrativas implementados',ops.includes("router.get('/kits'")&&ops.includes("router.post('/admin/kits'")&&ops.includes("router.delete('/admin/kits/:id'"));
assert('Checkout informa que não há cobrança automática',page.includes('Não existe cobrança automática'));
assert('Painel distingue gateways automáticos desligados e pagamento manual condicional',adminPayments.includes('Stripe — desativado') && adminPayments.includes('Confirmar pagamento'));

const adminOrders=fs.readFileSync(path.resolve(root,'../lojaonline-admin-main/pedidos.html'),'utf8')+'\n'+readExtracted('../lojaonline-admin-main','pedidos');
const dashboard=fs.readFileSync(path.resolve(root,'../lojaonline-admin-main/dashboard.html'),'utf8')+'\n'+readExtracted('../lojaonline-admin-main','dashboard');
const favorites=fs.readFileSync(path.resolve(root,'../lojaonline-main/conta/favoritos.html'),'utf8')+'\n'+readExtracted('../lojaonline-main','conta-favoritos');
const orderDetail=fs.readFileSync(path.resolve(root,'../lojaonline-main/conta/pedido-detalhe.html'),'utf8')+'\n'+readExtracted('../lojaonline-main','conta-pedido-detalhe');
assert('Encomendas e dashboard escapam campos dinâmicos',adminOrders.includes('escPedido(p.numeroPedido)')&&dashboard.includes('escDashboard(p.estado)'));
assert('Detalhe de pedido do cliente escapa nome de produto',orderDetail.includes('escPedidoCliente(i.nome_produto'));
assert('Favoritos usa card renderer comum sem script duplicado antecipado',favorites.includes('cardProduto(p)')&&!favorites.includes('function escFav'));
const headers=fs.readFileSync(path.resolve(root,'../lojaonline-main/_headers'),'utf8');
assert('Site público envia CSP e proteção contra framing',headers.includes('Content-Security-Policy')&&headers.includes('X-Frame-Options: DENY'));

for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'} ${c.name}`);
console.log(`\n${checks.filter(x=>x.ok).length}/${checks.length} verificações estáticas passaram.`);
if(checks.some(x=>!x.ok))process.exit(1);
