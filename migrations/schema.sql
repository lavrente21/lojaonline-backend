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
INSERT INTO admins (nome, email, password_hash) VALUES
  ('Ana Ribeiro', 'ana@lumina-beauty.com', '$2b$10$c7NKso1Cds84oAbZunaXh.IrvYq84w59B4GTigTrFD56OgWbQKiNy');


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
  moeda                       VARCHAR(3) NOT NULL CHECK (moeda IN ('EUR', 'AOA')),

  -- Câmbio travado no momento da compra (só preenchido se moeda = AOA)
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
  preco_unitario_eur  NUMERIC(10,2) NOT NULL CHECK (preco_unitario_eur >= 0)
);

CREATE INDEX idx_pedido_itens_pedido  ON pedido_itens(pedido_id);
CREATE INDEX idx_pedido_itens_produto ON pedido_itens(produto_id);


-- ---------------------------------------------------------------------
-- PAGAMENTO DO PEDIDO (1-para-1 com pedidos)
-- ---------------------------------------------------------------------
CREATE TABLE pedido_pagamentos (
  pedido_id               BIGINT PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
  metodo                  VARCHAR(20) NOT NULL CHECK (metodo IN ('stripe', 'paypal', 'appypay')),
  estado                  VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (estado IN (
                             'pendente', 'pago', 'falhado', 'reembolsado'
                           )),
  id_cobranca             VARCHAR(120),        -- ID gerado ao criar a cobrança/sessão
  id_cobranca_confirmada  VARCHAR(120),        -- ID devolvido pelo webhook de confirmação
  url_checkout            TEXT,                -- para Stripe/PayPal
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
  prazo_estimado_dias    VARCHAR(20),          -- ex: "8-14"
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


-- =====================================================================
-- DADOS DE EXEMPLO (os dois produtos que já existiam no db.json)
-- =====================================================================
INSERT INTO produtos (nome, slug, categoria_id, preco_venda_eur, preco_custo_eur, fornecedor, id_fornecedor, stock)
VALUES
  ('Sérum de vitamina C 20%', 'serum-vitamina-c-20', (SELECT id FROM categorias WHERE slug='skincare'), 32.90, 14.20, 'cj', 'CJ-8823741', 48),
  ('Máscara capilar reparadora', 'mascara-capilar-reparadora', (SELECT id FROM categorias WHERE slug='hair-care'), 24.50, 9.80, 'buckydrop', 'BKY-55210', 32);

COMMIT;

-- =====================================================================
-- EXEMPLO: como vai ficar um produto importado da CJ
-- =====================================================================
-- INSERT INTO produtos (nome, categoria_id, descricao, preco_custo_eur,
--   preco_venda_eur, fornecedor, id_fornecedor, sku_fornecedor, stock)
-- VALUES ('Nome do produto na CJ', 1, 'Descrição vinda da CJ...', 6.50, 19.90,
--   'cj', '04A22450-67F0-4617-A132-E7AE7F8963B0', 'SKU-CJ-XXXX', 100)
-- RETURNING id;
--
-- INSERT INTO produto_imagens (produto_id, url, principal, ordem) VALUES
--   (<id_devolvido_acima>, 'https://cf.cjdropshipping.com/.../img1.jpg', true, 0),
--   (<id_devolvido_acima>, 'https://cf.cjdropshipping.com/.../img2.jpg', false, 1);
--
-- INSERT INTO produto_variantes (produto_id, nome_opcao, valor_opcao, sku_variante, stock) VALUES
--   (<id_devolvido_acima>, 'Tamanho', '30ml', 'SKU-CJ-XXXX-30ML', 40),
--   (<id_devolvido_acima>, 'Tamanho', '50ml', 'SKU-CJ-XXXX-50ML', 25);
