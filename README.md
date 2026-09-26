# Lúmina — Backend Render

API Express para PostgreSQL/Supabase.

## Rotas principais
- `GET /api/produtos`
- `GET /api/produtos/:id`
- `POST /api/produtos` (admin)
- `GET /api/produtos/importar/cj?id=<product-id-ou-url>` (admin)
- `POST /api/checkout`
- `POST /api/webhooks/stripe`

A rota de importação CJ deve aparecer antes de `/:id` para que `importar` não seja interpretado como um ID de produto.


## Webhooks de rastreio

Os endpoints `POST /api/webhooks/tracking/cj` e `POST /api/webhooks/tracking/buckydrop` exigem o header `X-Lumina-Webhook-Secret` e os respetivos segredos `CJ_TRACKING_WEBHOOK_SECRET` e `BUCKYDROP_TRACKING_WEBHOOK_SECRET`. Sem segredo configurado, o endpoint permanece desativado.

## BuckyDrop

`BUCKYDROP_ORDER_PATH` e `BUCKYDROP_TRACK_PATH` são obrigatórios quando BuckyDrop estiver ativo. Não existem defaults inventados: confirme os caminhos no Centro de Controle/API da sua conta BuckyDrop antes de configurar produção.
