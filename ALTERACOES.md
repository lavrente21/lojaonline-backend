# Alterações (revisão completa)

- Pagamento manual/pendente quando Stripe/AppyPay não estão configurados (checkout já não dá erro 500).
- Novo: PUT /api/operacoes/admin/pagamentos/:pedido/marcar-pago (confirma pagamento e avança o pedido).
- Novo: PUT /api/pedidos/:numero/estado (admin altera o estado da encomenda).
- Novo: GET /api/operacoes/admin/status e POST /api/operacoes/admin/sincronizar-tracking.
- Corrigido: fulfill() enviava produtos 'proprio' para a BuckyDrop; falha de um fornecedor já não bloqueia o pedido.
- Corrigido: GET /api/pedidos (admin) falhava com erro de tipos no PostgreSQL.
- Checkout devolve rotaEnvio e mensagem de pagamento.
- Angola continua bloqueada até configurar o agente de carga (AGENTE_*).
- Base de dados: correr `npm run migrate` numa BD nova. Para uma BD já existente, executar só a secção "11. PAGAMENTO MANUAL" do schema.sql.

## Correção stock CJ (envio automático)
- `consultarEstoque` agora lê a lista de armazéns da CJ (`totalInventory` por `countryCode`), filtra pela origem do artigo e sinaliza resposta não reconhecida.
- O envio distingue "stock insuficiente" (com quantidades e origem) de "resposta de stock não reconhecida" e regista a resposta crua nos logs.

## IOSS (destinos UE) no envio à CJ
- `criarPedido` envia `iossType`/`iossNumber` quando o destino é da UE. Variáveis: `CJ_IOSS_TYPE` (1=sem IOSS, 2=IOSS próprio, 3=IOSS da CJ; omissão 3) e `CJ_IOSS_NUMBER` (obrigatório se tipo 2).
- Tipo 3 não se aplica a encomendas acima de 150 EUR (o cliente paga o IVA).
