-- Funcionalidades de conta, newsletter e auditoria comercial. Idempotente.
CREATE TABLE IF NOT EXISTS recuperacao_senhas (
 id BIGSERIAL PRIMARY KEY,
 cliente_id BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
 email VARCHAR(255) NOT NULL,
 token_hash VARCHAR(64) NOT NULL UNIQUE,
 expira_em TIMESTAMPTZ NOT NULL,
 usado_em TIMESTAMPTZ,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recuperacao_senhas_email ON recuperacao_senhas(email, expira_em DESC);
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS token_cancelamento VARCHAR(80);
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;
ALTER TABLE newsletter_campanhas ADD COLUMN IF NOT EXISTS enviados INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_campanhas ADD COLUMN IF NOT EXISTS falhas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_campanhas ADD COLUMN IF NOT EXISTS enviada_em TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cupao_codigo VARCHAR(40);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS desconto_eur NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto_eur >= 0);
