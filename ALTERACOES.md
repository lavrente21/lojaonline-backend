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
- Conta do cliente: PUT /api/auth/clientes/me aceita novaPalavraPasse + palavraPasseAtual; novo GET /api/auth/clientes/exportar.
