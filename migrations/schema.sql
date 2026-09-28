-- =====================================================================
-- LÚMINA — SCHEMA DA BASE DE DADOS (PostgreSQL 14+)
-- =====================================================================
-- Substitui o data/db.json (ficheiro JSON) usado no backend por uma
-- base de dados relacional real, mantendo o mesmo "vocabulário" do
-- código (produtos, pedidos, clientes, fornecedores, etc.) para
-- facilitar a migração das rotas em /routes.
--
-- Como usar:
--   psql "postgres://user:password@host:5432/lumina" -f lumina_schema.sql
--
-- Testado para PostgreSQL (Render, Supabase, Railway, Neon, etc. têm
-- todos plano Postgres gratuito/barato). Se preferires MySQL, diz que
-- eu converto — a única parte específica de Postgres aqui é o tipo
-- JSONB, os TIMESTAMPTZ e as funções de trigger.
-- =====================================================================

BEGIN;

-- Extensão usada para gerar UUIDs (útil para tokens, não obrigatório
-- para as chaves primárias — aqui uso BIGSERIAL para simplicidade e
-- performance nas FKs).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Função utilitária: atualiza automaticamente a coluna atualizado_em
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- CATEGORIAS
-- =====================================================================
CREATE TABLE categorias (
  id            BIGSERIAL PRIMARY KEY,
  nome          VARCHAR(120) NOT NULL,
  slug          VARCHAR(140) NOT NULL UNIQUE,
  descricao     TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO categorias (nome, slug) VALUES
  ('Skincare', 'skincare'),
  ('Hair care', 'hair-care'),
  ('Body care', 'body-care'),
  ('Maquilhagem', 'maquilhagem');


-- =====================================================================
-- PRODUTOS
-- =====================================================================
-- fornecedor: de onde o produto vem (dropshipping). idFornecedor é o
-- ID/SKU do produto na plataforma do fornecedor (ex: ID do produto na CJ).
-- A combinação (fornecedor, id_fornecedor) é única — evita importar o
-- mesmo produto da CJ duas vezes.
CREATE TABLE produtos (
  id                    BIGSERIAL PRIMARY KEY,
  nome                  VARCHAR(255) NOT NULL,
  slug                  VARCHAR(280) UNIQUE,
  categoria_id          BIGINT REFERENCES categorias(id) ON DELETE SET NULL,
  descricao             TEXT,                 -- descrição longa (mostrada na loja)
  descricao_interna     TEXT,                 -- notas internas, não vão para a loja
  preco_custo_eur       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_custo_eur >= 0),
  preco_venda_eur       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_venda_eur >= 0),
  fornecedor            VARCHAR(20) NOT NULL CHECK (fornecedor IN ('cj', 'buckydrop', 'proprio')),
  id_fornecedor         VARCHAR(120),          -- ID do produto no CJ/Buckydrop
  sku_fornecedor        VARCHAR(120),          -- SKU original do fornecedor
  link_fornecedor       TEXT,                  -- link da página do produto na CJ, se guardado
  stock                 INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  peso_gramas           INTEGER,               -- útil para cálculo de portes/CJ
  atributos_cj          JSONB,                 -- payload bruto devolvido pela API da CJ (backup/depuração)
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  destaque              BOOLEAN NOT NULL DEFAULT false,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (fornecedor, id_fornecedor)
);

CREATE INDEX idx_produtos_categoria     ON produtos(categoria_id);
CREATE INDEX idx_produtos_fornecedor    ON produtos(fornecedor);
CREATE INDEX idx_produtos_ativo         ON produtos(ativo);

CREATE TRIGGER trg_produtos_updated
  BEFORE UPDATE ON produtos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ---------------------------------------------------------------------
-- IMAGENS DO PRODUTO (a CJ devolve várias imagens por produto)
-- ---------------------------------------------------------------------
CREATE TABLE produto_imagens (
  id            BIGSERIAL PRIMARY KEY,
  produto_id    BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  principal     BOOLEAN NOT NULL DEFAULT false,
  ordem         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_produto_imagens_produto ON produto_imagens(produto_id);

-- Garante só uma imagem principal por produto
CREATE UNIQUE INDEX idx_produto_imagem_principal_unica
  ON produto_imagens(produto_id)
  WHERE principal = true;


-- ---------------------------------------------------------------------
-- VARIANTES DO PRODUTO (tamanho, cor, etc. — comum em produtos da CJ)
-- ---------------------------------------------------------------------
CREATE TABLE produto_variantes (
  id                BIGSERIAL PRIMARY KEY,
  produto_id        BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  nome_opcao        VARCHAR(60) NOT NULL,      -- ex: "Tamanho", "Cor"
  valor_opcao       VARCHAR(120) NOT NULL,     -- ex: "30ml", "Rosa"
  sku_variante      VARCHAR(120),              -- SKU da variante no fornecedor
  id_fornecedor_variante VARCHAR(120),          -- Variant ID/VID real do fornecedor
  preco_extra_eur   NUMERIC(10,2) NOT NULL DEFAULT 0,  -- soma ao preco_venda_eur do produto
  stock             INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  imagem_url        TEXT,

  UNIQUE (produto_id, nome_opcao, valor_opcao)
);

CREATE INDEX idx_produto_variantes_produto ON produto_variantes(produto_id);


-- =====================================================================
-- CLIENTES
-- =====================================================================
CREATE TABLE clientes (
  id             BIGSERIAL PRIMARY KEY,
  nome           VARCHAR(180) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,        -- bcrypt (ver seed.js/routes/auth.js)
  telefone       VARCHAR(40),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clientes_enderecos (
  id                BIGSERIAL PRIMARY KEY,
  cliente_id        BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  rotulo            VARCHAR(60),               -- "Casa", "Trabalho"...
  linha1            VARCHAR(255) NOT NULL,
  linha2            VARCHAR(255),
  cidade            VARCHAR(120) NOT NULL,
  codigo_postal     VARCHAR(20),
  pais              CHAR(2) NOT NULL,          -- ISO2, ex: 'AO', 'PT', 'US'
  telefone          VARCHAR(40),
  predefinido       BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_enderecos_cliente ON clientes_enderecos(cliente_id);


-- =====================================================================
-- ADMINS (equipa da loja)
-- =====================================================================
CREATE TABLE admins (
  id             BIGSERIAL PRIMARY KEY,
  nome           VARCHAR(180) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  papel          VARCHAR(30) NOT NULL DEFAULT 'gestor' CHECK (papel IN ('gestor', 'suporte', 'dono')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Password "admin123" — TROCAR antes de produção (gera novo hash com bcryptjs,
-- tal como o seed.js atual já faz).
-- Admin inicial: criado pelo script scripts/seed-admin.js com credenciais definidas no ambiente.



-- =====================================================================
-- PEDIDOS
-- =====================================================================
-- numero = o "LUM-48214" que aparece ao cliente (id interno é numérico).
-- A morada de entrega e a morada enviada ao fornecedor ficam gravadas
-- como "fotografia" no próprio pedido (não como FK para o endereço do
-- cliente), porque não podem mudar depois de o pedido ser feito.
CREATE SEQUENCE pedidos_numero_seq START 48214;

CREATE TABLE pedidos (
  id                          BIGSERIAL PRIMARY KEY,
  numero                      VARCHAR(20) NOT NULL UNIQUE
                                DEFAULT ('LUM-' || nextval('pedidos_numero_seq')),
  cliente_id                  BIGINT REFERENCES clientes(id) ON DELETE SET NULL,

  total_eur                   NUMERIC(10,2) NOT NULL CHECK (total_eur >= 0),
  frete_usd              NUMERIC(10,2),
  frete_eur              NUMERIC(10,2),
  metodo_envio           VARCHAR(120),
  moeda                       VARCHAR(3) NOT NULL CHECK (moeda IN ('EUR','USD','GBP','CHF','CAD','BRL','MXN','CLP','COP','PLN','SEK','DKK','NOK','CZK','RON','ZAR','AOA')),

  -- Câmbio travado no momento da compra
  cambio_taxa_usada           NUMERIC(12,4),
  cambio_valor_eur            NUMERIC(10,2),
  cambio_valor_aoa            NUMERIC(14,2),
  cambio_data                 TIMESTAMPTZ,

  -- Morada final do cliente
  entrega_linha1              VARCHAR(255) NOT NULL,
  entrega_linha2              VARCHAR(255),
  entrega_cidade              VARCHAR(120) NOT NULL,
  entrega_codigo_postal       VARCHAR(20),
  entrega_pais                CHAR(2) NOT NULL,
  entrega_telefone            VARCHAR(40),

  rota_envio                  VARCHAR(20) NOT NULL CHECK (rota_envio IN ('direto', 'agente_de_carga')),

  -- Morada que foi de facto enviada ao fornecedor (agente de carga OU a do cliente)
  fornecedor_morada_nome      VARCHAR(180),
  fornecedor_morada_linha1    VARCHAR(255),
  fornecedor_morada_cidade    VARCHAR(120),
  fornecedor_morada_cp        VARCHAR(20),
  fornecedor_morada_pais      VARCHAR(120),
  fornecedor_morada_telefone  VARCHAR(40),
  fornecedor_morada_ref       VARCHAR(120),

  estado                      VARCHAR(30) NOT NULL DEFAULT 'novo' CHECK (estado IN (
                                 'novo', 'pago', 'processando', 'enviado_ao_agente',
                                 'a_caminho', 'a_caminho_destino_final', 'entregue', 'cancelado'
                               )),

  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_estado  ON pedidos(estado);

CREATE TRIGGER trg_pedidos_updated
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ---------------------------------------------------------------------
-- ITENS DO PEDIDO (fotografia do produto no momento da compra)
-- ---------------------------------------------------------------------
CREATE TABLE pedido_itens (
  id                  BIGSERIAL PRIMARY KEY,
  pedido_id           BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id          BIGINT REFERENCES produtos(id) ON DELETE SET NULL,
  variante_id         BIGINT REFERENCES produto_variantes(id) ON DELETE SET NULL,
  nome_produto        VARCHAR(255) NOT NULL,   -- snapshot: nome no momento da compra
  fornecedor          VARCHAR(20) NOT NULL,    -- snapshot: 'cj' | 'buckydrop' | 'proprio'
  quantidade          INTEGER NOT NULL CHECK (quantidade > 0),
  id_fornecedor_variante VARCHAR(120),
  preco_unitario_eur  NUMERIC(10,2) NOT NULL CHECK (preco_unitario_eur >= 0)
);

CREATE INDEX idx_pedido_itens_pedido  ON pedido_itens(pedido_id);
CREATE INDEX idx_pedido_itens_produto ON pedido_itens(produto_id);


-- ---------------------------------------------------------------------
-- PAGAMENTO DO PEDIDO (1-para-1 com pedidos)
-- ---------------------------------------------------------------------
CREATE TABLE pedido_pagamentos (
  pedido_id               BIGINT PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
  metodo                  VARCHAR(20) NOT NULL CHECK (metodo IN ('stripe', 'paypal', 'appypay', 'manual')),
  estado                  VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (estado IN (
                             'pendente', 'pago', 'falhado', 'reembolsado'
                           )),
  id_cobranca             VARCHAR(120),        -- ID gerado ao criar a cobrança/sessão
  id_cobranca_confirmada  VARCHAR(120),        -- ID devolvido pelo webhook de confirmação
  url_checkout            TEXT,                -- para Stripe/PayPal
  nota                    TEXT,                -- referência/instrução de pagamento manual (transferência, etc.)
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_pagamentos_updated
  BEFORE UPDATE ON pedido_pagamentos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ---------------------------------------------------------------------
-- SUB-PEDIDOS POR FORNECEDOR (um pedido pode ter CJ + Buckydrop juntos)
-- ---------------------------------------------------------------------
CREATE TABLE pedido_fornecedores (
  id                     BIGSERIAL PRIMARY KEY,
  pedido_id              BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  fornecedor             VARCHAR(20) NOT NULL CHECK (fornecedor IN ('cj', 'buckydrop')),
  id_pedido_fornecedor   VARCHAR(120),         -- ID do pedido dentro do CJ/Buckydrop
  prazo_estimado_dias    VARCHAR(20),          -- prazo devolvido pelo fornecedor
  rastreio1              VARCHAR(120),         -- fornecedor -> agente de carga (ou -> cliente, se direto)
  rastreio2              VARCHAR(120),         -- agente de carga -> destino final
  estado                 VARCHAR(30) NOT NULL DEFAULT 'processando' CHECK (estado IN (
                            'processando', 'enviado_ao_agente', 'a_caminho',
                            'a_caminho_destino_final', 'entregue'
                          )),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (pedido_id, fornecedor)
);

CREATE INDEX idx_pedido_fornecedores_pedido ON pedido_fornecedores(pedido_id);

CREATE TRIGGER trg_pedido_fornecedores_updated
  BEFORE UPDATE ON pedido_fornecedores
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- =====================================================================
-- AVALIAÇÕES DE PRODUTO (mostradas na página do produto)
-- =====================================================================
CREATE TABLE avaliacoes (
  id            BIGSERIAL PRIMARY KEY,
  produto_id    BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  cliente_id    BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  nome_autor    VARCHAR(120) NOT NULL,   -- snapshot (funciona mesmo sem conta)
  estrelas      SMALLINT NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
  comentario    TEXT,
  aprovado      BOOLEAN NOT NULL DEFAULT false,   -- moderação antes de aparecer na loja
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avaliacoes_produto ON avaliacoes(produto_id);


-- =====================================================================
-- CUPÕES DE DESCONTO
-- =====================================================================
CREATE TABLE cupons (
  id                BIGSERIAL PRIMARY KEY,
  codigo            VARCHAR(40) NOT NULL UNIQUE,
  tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('percentagem', 'valor_fixo')),
  valor             NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  ativo             BOOLEAN NOT NULL DEFAULT true,
  validade_inicio   TIMESTAMPTZ,
  validade_fim      TIMESTAMPTZ,
  usos_maximos      INTEGER,
  usos_atuais       INTEGER NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);


COMMIT;

-- Campos comerciais v2 (mantidos também em migration para bases já existentes)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) DEFAULT 0 CHECK (margem_alvo_pct >= 0 AND margem_alvo_pct < 100);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_ativa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_preco_eur NUMERIC(10,2) DEFAULT 0 CHECK (promocao_preco_eur >= 0);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_inicio TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS promocao_fim TIMESTAMPTZ;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_alt TEXT;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS preco_custo_extra_eur NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_custo_extra_eur >= 0);
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) DEFAULT 0 CHECK (margem_alvo_pct >= 0 AND margem_alvo_pct < 100);


-- ============================================================
-- MIGRAÇÃO DE PRODUÇÃO CONSOLIDADA (bases já existentes)
-- ============================================================
-- LÚMINA — MIGRAÇÃO CONSOLIDADA DE PRODUÇÃO v2
-- Supabase / PostgreSQL
-- Idempotente e sem dados fictícios.
-- Inclui catálogo, promoções, formulários públicos, newsletter,
-- devoluções, favoritos e avaliações.
--
-- NOTA: CORS, rotas Express, secrets de webhooks e variáveis de ambiente
-- não são alterações SQL e devem continuar configurados no Render/Netlify.

BEGIN;

-- ============================================================
-- 1. CATÁLOGO / PRODUTOS
-- ============================================================
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

-- O esquema base já possui ativo/destaque, mas estes IF NOT EXISTS
-- tornam a migração segura caso seja aplicada numa base anterior.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS destaque BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos(ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_destaque_ativo ON produtos(destaque, ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_margem_alvo ON produtos(margem_alvo_pct);
CREATE INDEX IF NOT EXISTS idx_produtos_promocao ON produtos(promocao_ativa, promocao_inicio, promocao_fim);
CREATE INDEX IF NOT EXISTS idx_produtos_etiqueta ON produtos(etiqueta);

-- ============================================================
-- 2. VARIANTES / FORNECEDOR
-- ============================================================
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS id_fornecedor_variante VARCHAR(120);
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS preco_custo_extra_eur NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS margem_alvo_pct NUMERIC(6,2) DEFAULT 0;
ALTER TABLE produto_variantes ADD COLUMN IF NOT EXISTS imagem_url TEXT;

CREATE INDEX IF NOT EXISTS idx_produto_variantes_fornecedor_id
  ON produto_variantes(id_fornecedor_variante);

-- ============================================================
-- 3. PEDIDOS / FRETE / VARIANTE DO FORNECEDOR
-- ============================================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS frete_usd NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS frete_eur NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_envio VARCHAR(120);
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS id_fornecedor_variante VARCHAR(120);

-- ============================================================
-- 4. CONTACTOS PÚBLICOS
-- Compatível com as duas versões anteriores do estado.
-- ============================================================
CREATE TABLE IF NOT EXISTS contactos (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(180),
  email VARCHAR(320) NOT NULL,
  assunto VARCHAR(180),
  mensagem TEXT NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'novo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contactos ADD COLUMN IF NOT EXISTS nome VARCHAR(180);
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS email VARCHAR(320);
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS assunto VARCHAR(180);
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS mensagem TEXT;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS estado VARCHAR(30) NOT NULL DEFAULT 'novo';
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Remove checks antigos de estado, caso a tabela tenha vindo de uma
-- migração anterior, e instala os estados usados pelo backend atual.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'contactos'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE contactos DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE contactos
  ADD CONSTRAINT contactos_estado_check
  CHECK (estado IN ('novo','em_atendimento','resolvido','arquivado'));

CREATE INDEX IF NOT EXISTS idx_contactos_estado_criado
  ON contactos(estado, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_contactos_email
  ON contactos(email);

-- ============================================================
-- 5. NEWSLETTER
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_subscritores (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  nome VARCHAR(180),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS nome VARCHAR(180);
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS email VARCHAR(320);
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE newsletter_subscritores ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS ux_newsletter_subscritores_email
  ON newsletter_subscritores(lower(email));
CREATE INDEX IF NOT EXISTS idx_newsletter_ativo
  ON newsletter_subscritores(ativo);

-- ============================================================
-- 6. DEVOLUÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS devolucoes (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
  motivo VARCHAR(180) NOT NULL,
  detalhes TEXT,
  estado VARCHAR(30) NOT NULL DEFAULT 'solicitada',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS pedido_id BIGINT;
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS cliente_id BIGINT;
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS motivo VARCHAR(180);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS detalhes TEXT;
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS estado VARCHAR(30) NOT NULL DEFAULT 'solicitada';
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Preenche cliente_id apenas onde o pedido permite fazê-lo; não inventa dados.
UPDATE devolucoes d
SET cliente_id = p.cliente_id
FROM pedidos p
WHERE d.pedido_id = p.id
  AND d.cliente_id IS NULL
  AND p.cliente_id IS NOT NULL;

-- Adiciona FK apenas se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devolucoes_cliente_id_fkey'
      AND conrelid = 'devolucoes'::regclass
  ) THEN
    ALTER TABLE devolucoes
      ADD CONSTRAINT devolucoes_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'devolucoes'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE devolucoes DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE devolucoes
  ADD CONSTRAINT devolucoes_estado_check
  CHECK (estado IN ('solicitada','em_analise','aprovada','rejeitada','recebida','reembolsada','cancelada'));

CREATE INDEX IF NOT EXISTS idx_devolucoes_cliente
  ON devolucoes(cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_devolucoes_pedido
  ON devolucoes(pedido_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_estado
  ON devolucoes(estado, criado_em DESC);

-- Evita duas solicitações para o mesmo pedido enquanto uma ainda está ativa.
CREATE UNIQUE INDEX IF NOT EXISTS ux_devolucao_pedido_ativa
  ON devolucoes(pedido_id)
  WHERE estado IN ('solicitada','em_analise','aprovada','recebida');

-- ============================================================
-- 7. FAVORITOS REAIS
-- ============================================================
CREATE TABLE IF NOT EXISTS favoritos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, produto_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_favoritos_cliente_produto
  ON favoritos(cliente_id, produto_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_cliente
  ON favoritos(cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_favoritos_produto
  ON favoritos(produto_id, criado_em DESC);

-- ============================================================
-- 8. AVALIAÇÕES DE CLIENTES
-- Uma avaliação por cliente/produto.
-- Se a base já tiver duplicados, a migração falha em vez de apagar
-- avaliações silenciosamente.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM avaliacoes
    WHERE cliente_id IS NOT NULL
    GROUP BY cliente_id, produto_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Existem avaliações duplicadas por cliente/produto. Resolva os duplicados antes de criar ux_avaliacoes_cliente_produto.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_avaliacoes_cliente_produto
  ON avaliacoes(cliente_id, produto_id)
  WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_avaliacoes_aprovado
  ON avaliacoes(aprovado, criado_em DESC);

-- ============================================================
-- 9. ESTRUTURAS DE CONTEÚDO / CONFIGURAÇÃO (se ainda não existirem)
-- Mantidas aqui para uma instalação consolidada.
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_campanhas (
  id BIGSERIAL PRIMARY KEY,
  assunto VARCHAR(180) NOT NULL,
  conteudo TEXT NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'rascunho',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conteudos (
  id BIGSERIAL PRIMARY KEY,
  chave VARCHAR(160) NOT NULL UNIQUE,
  titulo VARCHAR(255),
  conteudo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuracoes_loja (
  id BIGSERIAL PRIMARY KEY,
  chave VARCHAR(160) NOT NULL UNIQUE,
  valor TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assinaturas (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
  plano VARCHAR(120),
  estado VARCHAR(40) NOT NULL DEFAULT 'ativa',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. VALIDAÇÕES DE CATÁLOGO
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produtos_margem_alvo_pct_check'
      AND conrelid = 'produtos'::regclass
  ) THEN
    ALTER TABLE produtos
      ADD CONSTRAINT produtos_margem_alvo_pct_check
      CHECK (margem_alvo_pct IS NULL OR margem_alvo_pct >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produtos_promocao_preco_check'
      AND conrelid = 'produtos'::regclass
  ) THEN
    ALTER TABLE produtos
      ADD CONSTRAINT produtos_promocao_preco_check
      CHECK (promocao_preco_eur IS NULL OR promocao_preco_eur >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produto_variantes_margem_alvo_pct_check'
      AND conrelid = 'produto_variantes'::regclass
  ) THEN
    ALTER TABLE produto_variantes
      ADD CONSTRAINT produto_variantes_margem_alvo_pct_check
      CHECK (margem_alvo_pct IS NULL OR margem_alvo_pct >= 0);
  END IF;
END $$;

-- ============================================================
-- 11. PAGAMENTO MANUAL (fallback enquanto Stripe/AppyPay não estão
-- configurados com chaves reais — permite o checkout completar-se
-- na mesma, com o pedido em 'pendente' até a equipa confirmar).
-- ============================================================
ALTER TABLE pedido_pagamentos ADD COLUMN IF NOT EXISTS nota TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedido_pagamentos_metodo_check'
      AND conrelid = 'pedido_pagamentos'::regclass
      AND pg_get_constraintdef(oid) NOT ILIKE '%manual%'
  ) THEN
    ALTER TABLE pedido_pagamentos DROP CONSTRAINT pedido_pagamentos_metodo_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedido_pagamentos_metodo_check'
      AND conrelid = 'pedido_pagamentos'::regclass
  ) THEN
    ALTER TABLE pedido_pagamentos
      ADD CONSTRAINT pedido_pagamentos_metodo_check
      CHECK (metodo IN ('stripe', 'paypal', 'appypay', 'manual'));
  END IF;
END $$;

COMMIT;

-- ============================================================
-- O QUE NÃO É SQL
-- ============================================================
-- 1) Render: CORS deve permitir Cache-Control/Pragma e o backend deve
--    conter GET /api/produtos/admin/catalogo.
-- 2) Render: configurar CJ_TRACKING_WEBHOOK_SECRET e, se usado,
--    BUCKYDROP_TRACKING_WEBHOOK_SECRET.
-- 3) BuckyDrop: configurar BUCKYDROP_ORDER_PATH e BUCKYDROP_TRACK_PATH
--    somente com endpoints oficiais da conta/fornecedor.
-- 4) Netlify: usar window.LUMINA_API_BASE_URL para apontar ao backend.
-- 5) Stripe/AppyPay continuam deliberadamente fora desta migração.
