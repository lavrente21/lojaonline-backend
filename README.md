# Lúmina API — produção

Backend Node/Express para Render, com PostgreSQL no Supabase.

## Deploy

1. No Supabase, execute `../lumina_schema.sql` no SQL Editor.
2. No Render, crie um Web Service apontando para esta pasta.
3. Build: `npm install`.
4. Start: `npm start`.
5. Configure as variáveis de `.env.example` no Render.
6. Depois de configurar o banco, crie o primeiro administrador com `npm run seed:admin` usando `ADMIN_NOME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` temporários no ambiente de execução.
7. Configure o webhook Stripe para `https://SEU-RENDER.onrender.com/api/webhooks/stripe`.
8. Configure o webhook AppyPay para `https://SEU-RENDER.onrender.com/api/webhooks/appypay` conforme o contrato da tua conta.
9. No Netlify, publique o frontend e o admin e coloque os respectivos domínios em `ORIGENS_PERMITIDAS`.

## Regra de produção

Não existem dados, IDs, pagamentos, tracking ou taxas de câmbio simulados. Se uma integração necessária não estiver configurada, a API devolve erro explícito em vez de gerar informação fictícia.

## Supabase

Use a connection string PostgreSQL do Supabase em `DATABASE_URL`. Não coloque `service_role`, password do banco ou outras chaves privadas no frontend.
