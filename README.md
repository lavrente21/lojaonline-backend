# Lúmina — Backend

API que liga a loja (Home/Loja/Produto/Checkout) e o admin a tudo o que precisa
de acontecer "por trás": base de dados real, pagamentos (EUR e Kwanza),
decisão automática de fornecedor (CJ Dropshipping / Buckydrop), roteamento
via agente de carga para países não cobertos diretamente (ex: Angola), e
rastreio.

## Estado deste projeto: TUDO LIGADO A SERVIÇOS REAIS

Ao contrário da versão anterior (que usava um ficheiro `data/db.json` e
respostas simuladas), esta versão faz chamadas HTTP reais a:

- **PostgreSQL** — base de dados real (schema em `migrations/schema.sql`)
- **CJ Dropshipping API v2.0** — autenticação, importar produto, criar pedido, estoque, rastreio
- **AppyPay** — OAuth2 + cobrança Multicaixa Express (Kwanza)
- **Stripe** — Checkout Sessions (EUR)
- **PayPal** — Orders API v2 (EUR)
- **open.er-api.com** — câmbio EUR↔AOA ao vivo (sem chave necessária)
- **Buckydrop** — cliente HTTP real, mas com endpoints por confirmar (ver aviso abaixo)

Isto significa que **nada aqui funciona sem preencheres as tuas credenciais
reais no `.env`**. Sem elas, cada integração vai lançar um erro claro a
dizer exatamente qual variável falta — não há mais nenhum modo "mock" a
fingir sucesso silenciosamente.

## Como arrancar

```bash
npm install
cp .env.example .env      # depois editar o .env com as chaves/segredos reais
npm run migrate           # cria as tabelas na tua base de dados PostgreSQL
npm run seed               # cria o admin de teste
npm start
```

Login admin de teste (criado pelo `npm run seed`): `ana@lumina-beauty.com` / `admin123`
**Troca esta senha assim que entrares no admin.**

A API fica em `http://localhost:3000`.

## O que precisas de preencher no `.env` antes de cada coisa funcionar

| Precisas de... | Variáveis no `.env` | Onde conseguir |
|---|---|---|
| Guardar produtos/pedidos | `DATABASE_URL` | Cria uma base Postgres grátis no Render, Supabase, Neon ou Railway |
| Importar produtos da CJ | `CJ_API_EMAIL`, `CJ_API_KEY` | My CJ Account → API → "Generate" |
| Pagamento em Kwanza (AppyPay) | `APPYPAY_*` | Portal de developer/parceiro do AppyPay (a mesma conta onde já geriste a tua API) |
| Pagamento em EUR (cartão) | `STRIPE_SECRET_KEY` | dashboard.stripe.com → Developers → API keys |
| Pagamento em EUR (PayPal) | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com |
| Envio para Angola via agente de carga | `AGENTE_*` | Os dados do agente de carga/freight forwarder que contratares |
| Buckydrop | `BUCKYDROP_*` | Pede à tua account manager da Buckydrop acesso "API custom" |

Nenhuma destas é opcional para a funcionalidade correspondente — mas também
não precisas de todas ao mesmo tempo: por exemplo, dá para testar o site
inteiro só com `DATABASE_URL` + `STRIPE_SECRET_KEY` antes de teres a conta
CJ pronta.

## ⚠️ Aviso importante sobre a Buckydrop

Ao contrário da CJ (que tem documentação pública completa), a Buckydrop
**não publica uma API aberta** — o acesso costuma ser dado caso a caso pelo
suporte deles. `integrations/buckydrop-api.js` já faz chamadas HTTP reais
(não é mock), mas os caminhos exatos dos endpoints são um valor por defeito
que **tens de confirmar** com o suporte da Buckydrop e ajustar no `.env`
(`BUCKYDROP_ENDPOINT_*`).

## ⚠️ Aviso sobre a CJ: variantes

A API da CJ funciona sempre ao nível da **variante** (campo `vid`), nunca do
produto "pai". Quando importas um produto sem escolher uma variante
específica, o código usa a primeira variante devolvida — revê isto no admin
antes de vender, principalmente em produtos com tamanhos/cores diferentes.

## Estrutura

```
/config       → ligação real à base de dados (PostgreSQL via `pg`)
/migrations   → schema.sql (corre com `npm run migrate`)
/routes       → endpoints da API (auth, produtos, checkout, webhooks, pedidos)
/integrations → CJ, Buckydrop, AppyPay, Stripe, PayPal, câmbio, roteamento de envio
/jobs         → sincronizar stock, alertar pedidos parados
/middleware   → autenticação JWT
```

## Webhooks a configurar do lado de fora

- **Stripe**: no dashboard (Developers → Webhooks → Add endpoint), aponta
  para `POST https://o-teu-backend/api/webhooks/stripe`, evento
  `checkout.session.completed`. Copia o "Signing secret" para
  `STRIPE_WEBHOOK_SECRET` no `.env` — sem isto o webhook rejeita tudo (por
  segurança, não confiamos em pedidos não assinados).
- **AppyPay**: configura o callback de confirmação de pagamento para
  `POST /api/webhooks/pagamento-aoa-confirmado`.
- **CJ / Buckydrop**: os webhooks de rastreio (`/api/webhooks/cj-tracking`,
  `/api/webhooks/buckydrop-tracking`, `/api/webhooks/agente-tracking`) têm de
  ser chamados por ti (ou por uma integração/Zapier) sempre que o rastreio
  mudar, ou podes trocar por jobs que consultam `consultarRastreio()`
  periodicamente.

## Próximos passos recomendados

1. Correr tudo primeiro com Stripe em modo **test** e CJ em modo sandbox/conta
   nova, antes de qualquer chave "live".
2. Confirmar os nomes exatos dos campos de resposta da CJ (`variantList` vs
   `variants`, `trackNumber` vs `logisticNo`) fazendo uma chamada real e
   comparando com os comentários no código — a documentação pública tem
   pequenas diferenças entre versões.
3. Preencher os dados reais do agente de carga antes do primeiro pedido para
   Angola — sem isso, o pedido ainda é criado mas com morada em branco.
