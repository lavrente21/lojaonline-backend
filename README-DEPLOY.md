# Lúmina — Backend de produção

Backend Node.js + PostgreSQL/Supabase.

## Deploy
1. Configurar `DATABASE_URL`, `DATABASE_SSL`, `JWT_SECRET`, `ORIGENS_PERMITIDAS`, `FRONTEND_URL` e credenciais reais da CJ.
2. Executar `npm run migrate` uma vez por base de dados.
3. Iniciar com `npm start`.
4. Criar/atualizar admin com `npm run seed:admin` usando variáveis `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PAPEL`.

O router administrativo é montado em `/api/operacoes`; não existe montagem de `publico` nesse caminho.
