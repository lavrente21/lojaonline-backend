# Lúmina — Backend

API que liga a loja (Home/Loja/Produto/Checkout) e o admin a tudo o que precisa
de acontecer "por trás": pagamentos (EUR e Kwanza), decisão automática de
fornecedor (CJ Dropshipping / Buckydrop), roteamento via agente de carga para
países não cobertos diretamente (ex: Angola), e rastreio.

## Como arrancar

```bash
npm install
cp .env.example .env      # depois editar o .env com as chaves reais
node seed.js               # cria o utilizador admin de teste
node server.js
```

Login admin de teste (criado pelo seed.js): `ana@lumina-beauty.com` / `admin123`

A API fica em `http://localhost:3000`.

## O que já funciona (testado)

- Checkout completo, com decisão automática de moeda/fornecedor/rota de envio
- Pagamento em EUR (Stripe/PayPal — em modo simulado) e em **AOA via AppyPay**
  (ponto único de integração: `integrations/appypay.js` — é só ligar a chave real)
- Câmbio AOA↔EUR **travado no momento da compra** (guardado no pedido, nunca muda depois)
- Deteção automática de país que precisa de **agente de carga** (ex: Angola) vs
  envio direto (Europa/EUA) — `integrations/roteamento-envio.js`
- Criação automática do pedido no fornecedor certo (CJ ou Buckydrop) assim que
  o pagamento é confirmado, via webhook
- **Duplo rastreio**: fornecedor → agente de carga, e agente → destino final
- Autenticação com JWT (cliente e admin, rotas separadas e protegidas)
- CORS já preparado para loja e admin em domínios/subdomínios diferentes

## Importar produtos da CJ Dropshipping

No admin, em **Produtos → Novo produto**, cola o ID ou o link do produto na
CJ e clica em "Buscar produto na CJ": nome, categoria, preço de custo
(convertido de USD para EUR), imagem e descrição são pré-preenchidos —
revê o preço de venda e o stock antes de gravar.

Por trás, isto chama `GET /api/produtos/importar/cj?id=...` (rota admin),
que usa `integrations/cj-api.js` → `buscarProdutoPorId()`. Requer
`CJ_API_KEY` no `.env` (ver `.env.example`); sem ela, o pedido falha com
uma mensagem clara em vez de tentar simular dados falsos de produto.

## O que está em modo SIMULADO (mock) — a ligar antes de ir para produção

Todos os ficheiros em `/integrations` têm comentários `TODO produção` a indicar
exatamente onde substituir pela chamada real:

| Ficheiro | O que falta |
|---|---|
| `integrations/cj-api.js` | **Importação de produtos já usa a API real da CJ** (`GET /product/query`, autenticação por `CJ_API_KEY`). Falta ainda ligar `criarPedido()`, `consultarEstoque()` e `consultarRastreio()` aos endpoints reais (ver `TODO produção` no ficheiro) |
| `integrations/buckydrop-api.js` | Chave real + confirmar endpoints com o suporte do Buckydrop |
| `integrations/appypay.js` | Ligar à sua API do AppyPay já pronta |
| `integrations/pagamentos-eur.js` | Chave real do Stripe/PayPal |
| `integrations/cambio.js` | Ligar a uma fonte de câmbio real (hoje usa uma taxa fixa de exemplo) |
| `integrations/roteamento-envio.js` | Preencher a morada real do agente de carga escolhido |

## Estrutura

```
/config       → base de dados (hoje em JSON — trocar por PostgreSQL/MySQL em produção)
/routes       → endpoints da API (auth, produtos, checkout, webhooks, pedidos)
/integrations → CJ, Buckydrop, AppyPay, Stripe, câmbio, roteamento de envio
/jobs         → sincronizar stock, alertar pedidos parados
/middleware   → autenticação JWT
```

## Nota importante sobre a base de dados

`data/db.json` é um ficheiro simples para desenvolvimento — funciona bem para
testar todo o fluxo, mas não é seguro nem performante para produção com muitos
pedidos simultâneos. Antes de lançar a loja a sério, trocar por uma base de
dados real (PostgreSQL é a recomendação mais comum), mantendo a mesma
interface (`ler()`, `guardar()`) para não ter de reescrever as rotas.
