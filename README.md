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
