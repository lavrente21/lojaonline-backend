# Lúmina — Comercial v2

## Supabase
Execute, pela ordem se ainda não executaste as anteriores:
- `supabase_migration_multimoeda.sql`
- `supabase_migration_comercial_produtos.sql`
- `supabase_migration_comercial_v2.sql`

## Render
Configure também:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (somente no backend/Render; nunca no Netlify)
- `SUPABASE_STORAGE_BUCKET=product-images` (opcional; este é o default)
- `CJ_SYNC_MARGIN_PCT=60` (margem usada quando um produto CJ ainda não tem margem alvo)

O backend cria o bucket público `product-images` na primeira utilização do upload, se a service role tiver permissão para isso.

## Margem
A margem bruta é calculada como:
`(preço de venda - custo) / preço de venda * 100`

O lucro potencial do stock é:
`(preço de venda - custo) * stock`

A margem alvo pode calcular automaticamente o preço:
`preço = custo / (1 - margem/100)`

Isto é margem bruta de catálogo. Não representa lucro líquido: taxas de pagamento, impostos, publicidade, devoluções e portes devem ser considerados separadamente.

## Sincronização CJ
O Admin tem sincronização individual e de catálogo. A sincronização consulta a API real da CJ e pode atualizar custo, preço, stock e variantes. Não deve ser agendada em intervalos agressivos; respeite os limites da API do fornecedor.

## Imagens
O Admin otimiza imagens no navegador para WebP antes de enviar ao Supabase Storage. O backend aceita imagens até 8 MB e guarda URLs públicas no catálogo.
