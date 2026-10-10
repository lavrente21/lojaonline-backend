-- Lumina: encomendas sem cobrança nesta fase; guardar contacto do cliente.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(180);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_email VARCHAR(254);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_email ON pedidos (lower(cliente_email));
