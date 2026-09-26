-- LÚMINA — MIGRAÇÃO COMPLETA DO MODELO COMERCIAL DE PRODUTOS
-- Execute este ficheiro UMA vez no Supabase SQL Editor.
-- É idempotente: pode ser executado novamente sem recriar colunas existentes.

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS descricao_curta TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS preco_compare_eur NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_ativa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_preco_eur NUMERIC(10,2) DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_inicio TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_fim TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_alt TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS beneficios TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ingredientes TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS modo_uso TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS tipo_pele VARCHAR(180);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS tipo_cabelo VARCHAR(180);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS etiqueta VARCHAR(60);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS seo_title VARCHAR(180);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS seo_description VARCHAR(320);

ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS id_fornecedor_variante VARCHAR(120);
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS preco_custo_extra_eur NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) DEFAULT 0;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS imagem_url TEXT;

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS frete_usd NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS frete_eur NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_envio VARCHAR(120);
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS id_fornecedor_variante VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_produto_variantes_fornecedor_id ON produto_variantes(id_fornecedor_variante);
CREATE INDEX IF NOT EXISTS idx_produtos_margem_alvo ON produtos(margem_alvo_pct);
CREATE INDEX IF NOT EXISTS idx_produtos_promocao ON produtos(promocao_ativa);

-- Regras básicas dos valores comerciais.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_margem_alvo_pct_check') THEN
    ALTER TABLE produtos ADD CONSTRAINT produtos_margem_alvo_pct_check CHECK (margem_alvo_pct >= 0 AND margem_alvo_pct < 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_promocao_preco_eur_check') THEN
    ALTER TABLE produtos ADD CONSTRAINT produtos_promocao_preco_eur_check CHECK (promocao_preco_eur >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produto_variantes_margem_alvo_pct_check') THEN
    ALTER TABLE produto_variantes ADD CONSTRAINT produto_variantes_margem_alvo_pct_check CHECK (margem_alvo_pct >= 0 AND margem_alvo_pct < 100);
  END IF;
END $$;
