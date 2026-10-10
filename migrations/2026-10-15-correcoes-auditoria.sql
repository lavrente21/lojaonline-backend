-- Correções incrementais; idempotente e sem BEGIN/COMMIT (migrate.js gere transação).
ALTER TABLE IF EXISTS pedidos ADD COLUMN IF NOT EXISTS termos_aceites_em TIMESTAMPTZ;
ALTER TABLE IF EXISTS pedidos ADD COLUMN IF NOT EXISTS documento_fiscal_ref TEXT;
ALTER TABLE IF EXISTS pedido_pagamentos ADD COLUMN IF NOT EXISTS valor_recebido NUMERIC(12,2);
ALTER TABLE IF EXISTS pedido_pagamentos ADD COLUMN IF NOT EXISTS moeda VARCHAR(3);
ALTER TABLE IF EXISTS cupons ADD COLUMN IF NOT EXISTS valor_minimo_eur NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS cupons ADD COLUMN IF NOT EXISTS usos_por_cliente INTEGER;
ALTER TABLE IF EXISTS cupons ADD COLUMN IF NOT EXISTS primeira_compra BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS newsletter_envios (campanha_id BIGINT NOT NULL REFERENCES newsletter_campanhas(id) ON DELETE CASCADE, subscritor_id BIGINT NOT NULL REFERENCES newsletter_subscritores(id) ON DELETE CASCADE, estado VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','enviando','enviado','erro')), erro_codigo VARCHAR(80), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(campanha_id,subscritor_id));
CREATE INDEX IF NOT EXISTS idx_pedidos_numero ON pedidos(numero);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido_id ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_pagamentos_pedido_id ON pedido_pagamentos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo_destaque_criado ON produtos(ativo,destaque,criado_em DESC);
