-- Lúmina: pedidos com moedas reais e taxa de câmbio travada
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_moeda_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_moeda_check CHECK (moeda IN ('EUR','USD','GBP','CHF','CAD','BRL','MXN','CLP','COP','PLN','SEK','DKK','NOK','CZK','RON','ZAR','AOA'));
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cambio_taxa_usada NUMERIC(18,8);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cambio_valor_eur NUMERIC(14,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cambio_valor_aoa NUMERIC(16,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cambio_data TIMESTAMPTZ;
