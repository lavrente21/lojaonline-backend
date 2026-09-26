BEGIN;
CREATE TABLE IF NOT EXISTS contactos (
 id BIGSERIAL PRIMARY KEY,
 nome VARCHAR(160) NOT NULL,
 email VARCHAR(320) NOT NULL,
 assunto VARCHAR(180) NOT NULL,
 mensagem TEXT NOT NULL,
 estado VARCHAR(30) NOT NULL DEFAULT 'novo' CHECK (estado IN ('novo','em_atendimento','resolvido','arquivado')),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contactos_estado_criado ON contactos(estado,criado_em DESC);
CREATE TABLE IF NOT EXISTS newsletter_subscritores (
 id BIGSERIAL PRIMARY KEY,
 email VARCHAR(320) NOT NULL UNIQUE,
 ativo BOOLEAN NOT NULL DEFAULT true,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_newsletter_ativo ON newsletter_subscritores(ativo);
CREATE TABLE IF NOT EXISTS devolucoes (
 id BIGSERIAL PRIMARY KEY,
 pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
 cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
 motivo VARCHAR(180) NOT NULL,
 detalhes TEXT,
 estado VARCHAR(30) NOT NULL DEFAULT 'solicitada' CHECK (estado IN ('solicitada','em_analise','aprovada','rejeitada','recebida','reembolsada','cancelada')),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devolucoes_cliente ON devolucoes(cliente_id,criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_devolucoes_estado ON devolucoes(estado,criado_em DESC);
CREATE TABLE IF NOT EXISTS favoritos (
 id BIGSERIAL PRIMARY KEY,
 cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
 produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(cliente_id,produto_id)
);
CREATE INDEX IF NOT EXISTS idx_favoritos_cliente ON favoritos(cliente_id,criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_avaliacoes_cliente_produto ON avaliacoes(cliente_id,produto_id) WHERE cliente_id IS NOT NULL;
COMMIT;
