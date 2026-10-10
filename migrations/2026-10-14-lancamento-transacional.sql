-- Fundacao transacional, revogacao de sessoes, rate limits e fornecedores.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_setup_em TIMESTAMPTZ;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_recuperacao_hashes TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_updated ON rate_limit_buckets(updated_at);

ALTER TABLE pedido_fornecedores ADD COLUMN IF NOT EXISTS estado_envio VARCHAR(24) NOT NULL DEFAULT 'pendente';
ALTER TABLE pedido_fornecedores ADD COLUMN IF NOT EXISTS erro_envio_codigo VARCHAR(80);
ALTER TABLE pedido_fornecedores ADD COLUMN IF NOT EXISTS tentativas_envio INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pedido_fornecedores ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ;
ALTER TABLE pedido_fornecedores ADD COLUMN IF NOT EXISTS itens_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pedido_fornecedores DROP CONSTRAINT IF EXISTS pedido_fornecedores_estado_envio_check;
ALTER TABLE pedido_fornecedores ADD CONSTRAINT pedido_fornecedores_estado_envio_check CHECK (estado_envio IN ('pendente','enviando','enviado','erro_envio'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_fornecedor_externo ON pedido_fornecedores(fornecedor,id_pedido_fornecedor) WHERE id_pedido_fornecedor IS NOT NULL;

CREATE TABLE IF NOT EXISTS pedido_stock_reservas (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id BIGINT REFERENCES produtos(id) ON DELETE SET NULL,
  variante_id BIGINT REFERENCES produto_variantes(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  estado VARCHAR(16) NOT NULL DEFAULT 'reservado' CHECK (estado IN ('reservado','confirmado','libertado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_reservas_pedido ON pedido_stock_reservas(pedido_id,estado);
CREATE INDEX IF NOT EXISTS idx_stock_reserva_item ON pedido_stock_reservas(pedido_id,produto_id,variante_id);

CREATE TABLE IF NOT EXISTS emails_enviados (
 id BIGSERIAL PRIMARY KEY, pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
 destinatario_hash VARCHAR(64), tipo VARCHAR(80) NOT NULL,
 estado VARCHAR(16) NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','enviado','erro')),
 erro_codigo VARCHAR(80), tentativas INTEGER NOT NULL DEFAULT 0,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), enviado_em TIMESTAMPTZ
);
ALTER TABLE pedido_pagamentos DROP CONSTRAINT IF EXISTS pedido_pagamentos_metodo_check;
ALTER TABLE pedido_pagamentos ADD CONSTRAINT pedido_pagamentos_metodo_check CHECK (metodo IN ('stripe','paypal','appypay','manual','transferencia','multicaixa','deposito'));
ALTER TABLE pedido_reembolsos ADD COLUMN IF NOT EXISTS moeda VARCHAR(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS token_cancelamento VARCHAR(96);
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS token_confirmacao_hash VARCHAR(64);
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS confirmacao_expira_em TIMESTAMPTZ;
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS consentimento_em TIMESTAMPTZ;
UPDATE newsletter_subscritores SET confirmado_em=COALESCE(confirmado_em,criado_em) WHERE ativo=true AND confirmado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_confirmacao ON newsletter_subscritores(token_confirmacao_hash) WHERE token_confirmacao_hash IS NOT NULL;
