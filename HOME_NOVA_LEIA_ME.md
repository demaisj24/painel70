# Home institucional nova — leia-me

Branch: `design/home-institucional-v1` (não é a `main`, não é o painel oficial).

## Revisão final antes da publicação da branch

- A Home abre no último mês com dados quando a base ainda não alcançou o
  mês corrente; o botão **Até hoje** continua levando explicitamente para a
  data atual.
- O TOTAL da meta só é calculado quando todas as 13 cidades possuem meta no
  período. Meta parcial não é apresentada como total completo.
- Os filtros de natureza da `Bd_OP` são normalizados antes da comparação.
- Registros duplicados só são marcados como processados depois de passarem
  pelas validações de data, município e valor.
- Na página detalhada do IDOB, o total passa a incluir corretamente
  `MV + CVPe + CVPa` no componente de vítimas.

## O que foi feito

Três arquivos principais, mais uma alteração mínima no `index.html` (um
único item de menu novo, "Interação Comunitária" — nada mais):

- `scripts/gerar-dados-home.mjs` — script Node que baixa as abas da base interna
  e gera `home-dados.json`. O endereço e os gids ficam em
  `home-fontes.local.json`, ignorado pelo git; copie
  `home-fontes.example.json`, preencha localmente e só então rode
  `node scripts/gerar-dados-home.mjs` (não há automação ligada ainda).
- `home-dados.json` — saída do script acima. Tem `manifest.mapeamento` com o status
  (confirmado/inferido, com ressalvas) e a regra de cada um dos 15 indicadores, pra
  auditar sem precisar perguntar pra IA.
- `home-nova.css` / `home-nova.js` — a Home nova em si. Carregados **depois** do
  script principal do `index.html`; `home-nova.js` só troca `pages.home`, não mexe
  em mais nada (nav, PPVD/autenticação, outras páginas).

## Como ver

Abra o `index.html` num servidor estático qualquer (não pode ser `file://` direto
por causa do `fetch('home-dados.json')` — CORS bloqueia). Exemplo:

```
cd painel70
python3 -m http.server 8000
# abrir http://localhost:8000/index.html
```

## Atualização de 2026-09 — "ATUALIZAÇÃO DEFINITIVA DAS REGRAS DA HOME"

Nova especificação (28 seções) declarada autoridade sobre os mapeamentos
inferidos em entregas anteriores. Mudanças principais:

- **Matriz passa de 13 para 15 indicadores**, na ordem: IMV, CVPe, CVPa,
  POG, Furto Rural, Pat. Escolar, Prev. V.D, Op. Rural, **Visibilidade**
  (novo), Saque Seguro, **Pol. Cid. Empresa** (novo), Pad. Escolar,
  **Rolezinho** (novo, entra na Home), IDOB, ITVD.
- **Cavalo de Aço sai da matriz da Home** — continua no menu e na página
  própria, intacto, só não aparece mais resumido na Home (falta fonte
  confirmada de meta pra esse indicador).
- **IMV/CVPe/CVPa passam a SOMAR os campos `IMV_TOTAL`/`ICVPE_TOTAL`/`ICVPA_TOTAL`**
  (representam número de vítimas), não mais contar linhas — um REDS com
  2 vítimas agora conta 2, não 1.
- **POG passa a ser avaliado como "maior é melhor"** (antes era avaliado
  em banda ±5%/10% em torno da meta) — mudança de polaridade pedida
  explicitamente pela nova especificação.
- **Metas26 lida por posição de coluna** (G, H, I, J, L, M, N, O, Q, R, S,
  T, U — nunca K nem P), com o cabeçalho efetivamente encontrado em cada
  coluna registrado no manifest pra auditoria letra↔indicador.

## Mapeamento indicador → aba (resumo; detalhe completo dentro de
`home-dados.json` → `manifest.mapeamento` e `manifest.cobertura`)

| Coluna da Home | Aba(s) da planilha | Meta (Metas26) | Status |
|---|---|---|---|
| IMV | Bd_MV (soma `IMV_TOTAL`) | col. G | confirmado |
| CVPe | Bd_CVPe (soma `ICVPE_TOTAL`) | col. H | confirmado |
| CVPa | Bd_CVPa (soma `ICVPA_TOTAL`) | col. I | confirmado |
| POG | Bd_OP (naturezas Y04009/Y07001/Y07002/Y07003/Y07010/Y10001) | col. J | confirmado |
| Furto Rural | Bd_furto_Rural | col. L | confirmado |
| Pat. Escolar | Bd_OP (natureza Y15001) | col. M | confirmado |
| Prev. V.D | Bd_OP (natureza Y07012) | col. N | confirmado, com observação (indicador operacional, não é a página completa de Violência Doméstica) |
| Op. Rural | Bd_OP (naturezas Y07014/Y15010) | col. O | confirmado |
| Visibilidade | Bd_vis (sem filtro adicional) | col. Q | confirmado, com ressalva (Guia de Comandantes descreve regra mais antiga/restrita — Bd_vis não tem campo pra reaplicá-la) |
| Saque Seguro | Bd_Saq_seguro | col. R | confirmado |
| Pol. Cid. Empresa | Bd_Pol.Cid | col. S | confirmado |
| Pad. Escolar | Bd_Pad.Esc | col. T | confirmado |
| Rolezinho | Bd_rol, filtrado por NOME_OPERACAO contém "ROLEZINHO" | col. U | confirmado, com ressalva (aba mistura Cavalo de Aço e outras operações sob a mesma natureza Y01003 — filtro aplicado, já confirmado em produção, diverge do texto literal da especificação que não pedia filtro) |
| IDOB | Bd_Boemia (QOP) + Bd_MV/CVPe/CVPa filtrados por local=bar (V) | **sem coluna de meta** — "Meta não informada" | confirmado, com ressalva de categoria (ver abaixo) |
| ITVD | Bd_trafico (T, filtrado I04033/I04028/I99000) + Bd_MV/CVPe/CVPa (V, REDS únicos) | **sem coluna de meta** — "Meta não informada" | confirmado, com ressalva de coluna (ver abaixo) |
| Cavalo de Aço | — (fora da matriz da Home) | — | mantido só na página própria, sem meta confirmada |

## IDOB — agora calculável (antes sempre "Aguardando base")

Fórmula (igual à documentada em produção, `index.html` → `DEFS.idob`):
`IDOB = [QOP − V×10] ÷ QOP × 100`, onde QOP = operações em bares (RAT
únicos de `Bd_Boemia`) e V = vítimas de IMV+CVPe+CVPa filtradas por local
do fato = bar/boate.

Até a entrega anterior, nenhuma aba tinha esse filtro de local — por
isso o IDOB nunca calculava nada. Verificado em 2026-09: `Bd_MV`,
`Bd_CVPe` e `Bd_CVPa` têm o campo `DESCRICAO_LOCAL_IMEDIATO`, com a
categoria `"BAR / LANCHONETE / RESTAURANTE / SIMILAR"` — a única
disponível que contém "BAR". **Ressalva**: essa categoria é mais ampla
que só bar/boate (agrupa também lanchonete/restaurante/similar); não
existe, nesta planilha, uma categoria isolada só para bar/boate. Usada
por ser a aproximação documentada mais próxima realmente disponível, não
uma invenção de vínculo.

Quando QOP=0 no período, a célula mostra "Sem base p/ cálculo" (nunca um
0%/100% inventado). Sem coluna de meta confirmada — a Home sempre mostra
"Meta não informada", nunca calcula variação.

## ITVD — corrigido o componente de vítimas (coluna "AL")

Fórmula (igual à documentada em produção, `renderITVDPage`):
`ITVD = [T − V×2] ÷ T × 100`, onde T = REDS de tráfico/uso (`Bd_trafico`,
naturezas I04033/I04028/I99000) e V = REDS de MV/CVPe/CVPa.

A especificação atual pede ler o REDS de V pela "coluna AL" de
`Bd_MV`/`Bd_CVPe`/`Bd_CVPa`. Verificado em 2026-09: nesta planilha, a
coluna AL (índice 37) é `CAUSA_PRESUMIDA` nas três abas, não um campo de
REDS. Usado o campo `NUMERO_REDS` (único identificador de REDS
disponível nessas abas), que corresponde à intenção literal do texto
("número do REDS") — os REDS das três abas são unidos (união, sem
repetir o mesmo REDS entre abas), não somados como contagem de vítimas.

Quando T=0, a Home e a página detalhada mostram igualmente “Sem base
para cálculo”, pois a fórmula teria denominador zero. Sem coluna de meta
confirmada — a Home sempre mostra “Meta não informada”.

## Pendências (ver também dentro do próprio `home-dados.json`, campo
`manifest.alertasAnomalia`)

1. **Visibilidade e Pol. Cid. Empresa não têm página de detalhamento
   própria** no menu desta branch ainda — o cabeçalho dessas duas
   colunas na Home não é clicável (não foi inventada rota nova).
2. **Cavalo de Aço permanece fora da matriz da Home** até existir fonte
   confirmada de meta pra esse indicador — a página própria continua
   funcionando normalmente.
3. **Prev. V.D (Y07012)**: o próprio `index.html` de produção já tem uma
   anotação interna dizendo que pode existir um dado "VD" à parte — não
   confirmado se é a mesma coisa que este Y07012.
4. **Sem atualização automática ainda**: os dados desta Home são um retrato do
   momento em que o script foi rodado (ver `manifest.geradoEm`). Pra atualizar,
   é preciso rodar o script de novo e commitar o `home-dados.json` novo. O
   próprio script compara com a geração anterior e registra alertas de
   anomalia (queda de cobertura, variação grande de registros, mudança de
   cabeçalho etc.) em `manifest.alertasAnomalia`.
5. **Mobile**: o painel inteiro (todas as páginas, não só a Home) ainda não
   tem um menu lateral colapsável para telas estreitas — o `index.html` de
   produção não tem nenhuma media query nem botão de menu pra isso. A Home em
   si é responsiva dentro da área de conteúdo disponível (título/controles
   quebram linha, tabelas rolam na horizontal, bloco de Análises
   complementares empilha em 1 coluna), mas não resolve essa limitação do
   painel como um todo — fora do escopo pedido para esta entrega.
6. **IDOCA** continua sem dado (nav-btn desabilitado) — falta export com nº
   de motos abordadas por RAT, não relacionado a esta entrega.
