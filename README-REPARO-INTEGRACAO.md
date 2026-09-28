# Lúmina — reparo de integração loja / checkout / conta

Este pacote corrige a integração entre loja pública, API e conta do cliente.

## Render

1. Substitua o conteúdo do repositório pelo conteúdo deste backend.
2. Faça o deploy normalmente.
3. No Shell do Render, com `DATABASE_URL` configurada, execute:

```bash
npm run migrate:update
```

A migração é de atualização: não apaga as tabelas existentes.

## O que foi corrigido

- validação de `produtoId`, `idVariante` e quantidade antes de qualquer query PostgreSQL;
- elimina o erro `invalid input syntax for type bigint: "NaN"`;
- limpeza automática de itens inválidos antigos no `localStorage` do carrinho;
- stock efetivo baseado nas variantes quando o produto possui variantes;
- validação de stock da variante no quote e no checkout;
- Variant ID real da CJ preservado no pedido;
- preço server-side com eventual preço extra da variante;
- pedidos feitos com sessão de cliente ficam ligados à conta autenticada;
- baixa atómica do stock depois de pagamento confirmado;
- proteção contra baixa duplicada através do estado do pedido;
- artigos do blog publicados disponíveis por API pública;
- migração idempotente para as estruturas usadas pelo Admin/loja.

## Pagamentos

Stripe/AppyPay continuam dependentes das respectivas credenciais reais. Sem credenciais, a API não inventa uma confirmação de pagamento: cria o pedido pendente e o Admin pode tratar o pagamento manualmente.

## Angola

O checkout para Angola continua bloqueado enquanto não houver agente de carga real configurado. Isso evita mostrar um frete fictício.
