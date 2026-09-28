BEGIN;

-- Campos de catálogo usados pelo Admin/loja, sem apagar dados existentes.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS descricao_curta TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS preco_compare_eur NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_ativa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_preco_eur NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_inicio TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_fim TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_alt TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS beneficios TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ingredientes TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS modo_uso TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS tipo_pele TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS tipo_cabelo TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS etiqueta VARCHAR(255);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS preco_custo_extra_eur NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) NOT NULL DEFAULT 0;

-- Conteúdo editorial: compatível com instalações antigas e novas.
ALTER TABLE conteudos ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE conteudos ADD COLUMN IF NOT EXISTS categoria VARCHAR(120);
ALTER TABLE conteudos ADD COLUMN IF NOT EXISTS corpo TEXT;
ALTER TABLE conteudos ADD COLUMN IF NOT EXISTS estado VARCHAR(30) NOT NULL DEFAULT 'rascunho';
ALTER TABLE conteudos ADD COLUMN IF NOT EXISTS imagem_url TEXT;
ALTER TABLE conteudos ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255);
ALTER TABLE conteudos ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE conteudos ALTER COLUMN chave DROP NOT NULL;
UPDATE conteudos SET corpo=COALESCE(corpo,conteudo,''), estado=CASE WHEN ativo THEN 'publicado' ELSE 'arquivado' END WHERE corpo IS NULL OR estado IS NULL;
UPDATE conteudos SET slug=COALESCE(NULLIF(slug,''),'artigo-'||id::text) WHERE slug IS NULL OR slug='';
CREATE UNIQUE INDEX IF NOT EXISTS idx_conteudos_slug_unico ON conteudos(slug);

-- Contactos, newsletter, configurações, devoluções, favoritos e assinaturas.
CREATE TABLE IF NOT EXISTS contactos (
 id BIGSERIAL PRIMARY KEY, nome VARCHAR(180) NOT NULL, email VARCHAR(255) NOT NULL,
 assunto VARCHAR(255) NOT NULL, mensagem TEXT NOT NULL, estado VARCHAR(30) NOT NULL DEFAULT 'novo',
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_subscritores (
 id BIGSERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, ativo BOOLEAN NOT NULL DEFAULT true,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_campanhas (
 id BIGSERIAL PRIMARY KEY, assunto VARCHAR(255), corpo TEXT, estado VARCHAR(30) NOT NULL DEFAULT 'rascunho',
 enviado_em TIMESTAMPTZ, criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS configuracoes_loja (
 id BIGSERIAL PRIMARY KEY, chave VARCHAR(160) NOT NULL UNIQUE, valor TEXT,
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assinaturas (
 id BIGSERIAL PRIMARY KEY, cliente_id BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
 nome_produto VARCHAR(255), descricao TEXT, preco_eur NUMERIC(10,2), plano VARCHAR(120),
 estado VARCHAR(40) NOT NULL DEFAULT 'ativa', criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS devolucoes (
 id BIGSERIAL PRIMARY KEY, pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
 cliente_id BIGINT REFERENCES clientes(id) ON DELETE CASCADE, motivo VARCHAR(255) NOT NULL,
 detalhes TEXT, estado VARCHAR(40) NOT NULL DEFAULT 'solicitada', criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS favoritos (
 id BIGSERIAL PRIMARY KEY, cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
 produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE, criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(cliente_id,produto_id)
);
CREATE INDEX IF NOT EXISTS idx_devolucoes_cliente ON devolucoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_cliente ON favoritos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conteudos_estado_criado ON conteudos(estado,criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_avaliacoes_cliente_produto_unica ON avaliacoes(cliente_id,produto_id) WHERE cliente_id IS NOT NULL;

COMMIT;
