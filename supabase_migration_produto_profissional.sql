ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS id_fornecedor_variante VARCHAR(120);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS frete_usd NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS frete_eur NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_envio VARCHAR(120);
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS id_fornecedor_variante VARCHAR(120);
CREATE INDEX IF NOT EXISTS idx_produto_variantes_fornecedor_id ON produto_variantes(id_fornecedor_variante);
