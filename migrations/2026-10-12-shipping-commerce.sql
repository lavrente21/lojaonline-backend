-- Lúmina: moradas, subscrições, kits e idempotência de integração. Seguro para repetição.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entrega_provincia VARCHAR(120);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fornecedor_morada_provincia VARCHAR(120);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS portes_confirmados BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS chave_idempotencia VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_chave_idempotencia ON pedidos(chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS produto_id BIGINT REFERENCES produtos(id) ON DELETE SET NULL;
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS frequencia VARCHAR(20) NOT NULL DEFAULT 'mensal';
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS proxima_cobranca TIMESTAMPTZ;
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS preco_eur NUMERIC(10,2);
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ;
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS consentimento_em TIMESTAMPTZ;
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS referencia_pagamento VARCHAR(120);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='assinaturas_frequencia_check') THEN
  ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_frequencia_check CHECK (frequencia IN ('semanal','mensal','bimestral','trimestral'));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_assinaturas_cliente_estado ON assinaturas(cliente_id,estado,criado_em DESC);
CREATE TABLE IF NOT EXISTS kits (
 id BIGSERIAL PRIMARY KEY, nome VARCHAR(180) NOT NULL, slug VARCHAR(200) NOT NULL UNIQUE, descricao TEXT, imagem_url TEXT, preco_eur NUMERIC(10,2) NOT NULL CHECK(preco_eur>0), ativo BOOLEAN NOT NULL DEFAULT true, criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kit_itens (
 kit_id BIGINT NOT NULL REFERENCES kits(id) ON DELETE CASCADE, produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT, quantidade INTEGER NOT NULL DEFAULT 1 CHECK(quantidade>0), PRIMARY KEY(kit_id,produto_id)
);
CREATE INDEX IF NOT EXISTS idx_kits_ativos ON kits(ativo,criado_em DESC);
