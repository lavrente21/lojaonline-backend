-- Lúmina: base de pagamentos manuais, reservas e auditoria.
-- Migração incremental e idempotente; não contém dados nem credenciais.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS stock_reservado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reserva_expira_em TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS subtotal_eur NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS portes_estado VARCHAR(32) NOT NULL DEFAULT 'por_confirmar';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nota_estado TEXT;

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check CHECK (estado IN (
  'novo','aguarda_confirmacao_portes','aguarda_pagamento','comprovativo_enviado',
  'pago','processando','em_processamento','enviado_ao_agente','a_caminho',
  'a_caminho_destino_final','entregue','cancelado','expirado','reembolsado',
  'reembolso_parcial'
));

ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS valor_esperado NUMERIC(12,2);
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS moeda VARCHAR(3);
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS cambio_taxa_travada NUMERIC(16,8);
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS referencia_pagamento VARCHAR(32);
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS prazo_pagamento_em TIMESTAMPTZ;
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS confirmado_por BIGINT;
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS valor_recebido NUMERIC(12,2);
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS referencia_bancaria VARCHAR(180);
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS nota_confirmacao TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_pagamentos_referencia
  ON pedido_pagamentos(referencia_pagamento) WHERE referencia_pagamento IS NOT NULL;

CREATE TABLE IF NOT EXISTS pedido_comprovativos (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  ficheiro_path TEXT NOT NULL,
  tipo VARCHAR(100) NOT NULL,
  tamanho BIGINT NOT NULL CHECK (tamanho > 0 AND tamanho <= 5242880),
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado VARCHAR(16) NOT NULL DEFAULT 'pendente'
    CHECK (estado IN ('pendente','aceite','rejeitado')),
  motivo_rejeicao TEXT,
  revisto_por BIGINT,
  revisto_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pedido_comprovativos_pedido
  ON pedido_comprovativos(pedido_id, enviado_em DESC);

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY,
  quem_tipo VARCHAR(24) NOT NULL,
  quem_id BIGINT,
  quando TIMESTAMPTZ NOT NULL DEFAULT now(),
  acao VARCHAR(100) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  entidade_id VARCHAR(120),
  antes JSONB,
  depois JSONB,
  ip_hash VARCHAR(128)
);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade
  ON auditoria(entidade, entidade_id, quando DESC);

CREATE TABLE IF NOT EXISTS pedido_reembolsos (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  metodo VARCHAR(40) NOT NULL,
  referencia VARCHAR(180),
  motivo TEXT NOT NULL,
  registado_por BIGINT NOT NULL,
  em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedido_reembolsos_pedido
  ON pedido_reembolsos(pedido_id, em DESC);
