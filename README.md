# Painel CO₂ Pantanal — Solo & Água

Dashboard front-end (HTML/CSS/JS) pronto para GitHub Pages, usando seus dados da planilha:
**CO2 PLANILHA MÃE Oficial.xlsx** (abas SOLO e ÁGUA).

## O que este painel faz
- Mapa Leaflet com pontos amostrados (hover para resumo; clique para detalhes)
- Filtros por: Meio (Solo/Água), Local, Ponto, Compartimento (Água), Tratamento, Estado do solo (Solo), Período sazonal (Água) e período (datas)
- KPIs: N, média, mínimo e máximo de CO₂ flux (com onde e quando)
- Comparação Solo vs Água (média de CO₂ flux)
- Série temporal e histograma para qualquer variável numérica disponível
- Tabela pesquisável + download CSV do recorte filtrado

## Como atualizar os dados (do jeito "no código")
1. Abra `data.js`
2. Substitua `window.CO2_DATA = ...` pelos novos registros (ou regenere a partir da planilha).
3. Commit e pronto.

## GitHub Pages
Settings → Pages → Deploy from a branch → Branch: main → /root.

## Observação
Se seus dados tiverem colunas novas, o painel já detecta automaticamente variáveis numéricas e mostra no seletor de "Variável do gráfico".
