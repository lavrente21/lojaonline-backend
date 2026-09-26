
BEGIN;
CREATE TABLE IF NOT EXISTS contactos (
 id BIGSERIAL PRIMARY KEY, nome VARCHAR(180), email VARCHAR(255) NOT NULL, assunto VARCHAR(180), mensagem TEXT NOT NULL,
 estado VARCHAR(30) NOT NULL DEFAULT 'novo' CHECK (estado IN ('novo','em_analise','respondido','fechado')),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contactos_estado ON contactos(estado);
CREATE TABLE IF NOT EXISTS newsletter_subscritores (
 id BIGSERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, nome VARCHAR(180), ativo BOOLEAN NOT NULL DEFAULT true,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_campanhas (
 id BIGSERIAL PRIMARY KEY, assunto VARCHAR(255) NOT NULL, estado VARCHAR(30) NOT NULL DEFAULT 'rascunho',
 enviados INTEGER NOT NULL DEFAULT 0, abertos INTEGER NOT NULL DEFAULT 0, cliques INTEGER NOT NULL DEFAULT 0,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), enviado_em TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS conteudos (
 id BIGSERIAL PRIMARY KEY, titulo VARCHAR(255) NOT NULL, slug VARCHAR(280) NOT NULL UNIQUE, categoria VARCHAR(120), corpo TEXT NOT NULL DEFAULT '',
 estado VARCHAR(30) NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','publicado','arquivado')),
 imagem_url TEXT, seo_title VARCHAR(180), seo_description VARCHAR(320), criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS configuracoes_loja (
 chave VARCHAR(100) PRIMARY KEY, valor TEXT NOT NULL DEFAULT '', atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assinaturas (
 id BIGSERIAL PRIMARY KEY, cliente_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL, produto_id BIGINT REFERENCES produtos(id) ON DELETE SET NULL,
 frequencia VARCHAR(40), proxima_cobranca TIMESTAMPTZ, estado VARCHAR(30) NOT NULL DEFAULT 'inativa', criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS devolucoes (
 id BIGSERIAL PRIMARY KEY, pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE, motivo TEXT NOT NULL,
 estado VARCHAR(30) NOT NULL DEFAULT 'em_analise' CHECK (estado IN ('em_analise','aprovada','rejeitada','recebida','reembolsada','cancelada')),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devolucoes_pedido ON devolucoes(pedido_id);
COMMIT;
