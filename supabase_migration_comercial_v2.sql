-- LÚMINA — comercial v2: margem, promoções, variantes e storage
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) DEFAULT 0 CHECK (margem_alvo_pct >= 0 AND margem_alvo_pct < 100);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_ativa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_preco_eur NUMERIC(10,2) DEFAULT 0 CHECK (promocao_preco_eur >= 0);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_inicio TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_fim TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_alt TEXT;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS preco_custo_extra_eur NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_custo_extra_eur >= 0);
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) DEFAULT 0 CHECK (margem_alvo_pct >= 0 AND margem_alvo_pct < 100);
CREATE INDEX IF NOT EXISTS idx_produtos_margem_alvo ON produtos(margem_alvo_pct);
CREATE INDEX IF NOT EXISTS idx_produtos_promocao ON produtos(promocao_ativa);
