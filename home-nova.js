/* ============================================================
   home-nova.js — Home institucional do Painel 70º BPM
   Carregado DEPOIS do script principal do index.html (que já
   declara `pages`, `goToPage`, `MUNICIPIOS_CANON`, `normKey`, etc.
   em escopo global). Este arquivo só ACRESCENTA `renderHomeNova` e
   troca `pages.home` — nenhuma outra página, nem a navegação, nem
   a autenticação PPVD, é tocada.

   Fonte dos dados: home-dados.json, gerado por
   scripts/gerar-dados-home.mjs a partir da planilha real
   BASE_INDICADORES_GDO_2026 (não inventa número nenhum — ver
   manifest.mapeamento e manifest.cobertura dentro do próprio JSON
   pra auditoria).

   REESCRITA 2026-09 — "ATUALIZAÇÃO DEFINITIVA DAS REGRAS DA HOME":
   - Matriz passa de 13 para 15 indicadores, na ordem exata pedida:
     IMV, CVPe, CVPa, POG, Furto Rural, Pat. Escolar, Prev. V.D,
     Op. Rural, Visibilidade (novo), Saque Seguro, Pol. Cid. Empresa
     (novo), Pad. Escolar, Rolezinho (novo), IDOB, ITVD.
   - Cavalo de Aço SAI da matriz da Home (mantido no menu/página —
     ver index.html, nada removido lá).
   - POG passa a ser tratado como indicador comum de "maior é melhor"
     (era avaliado em banda ±5%/10% em torno da meta antes) — mudança
     de polaridade pedida explicitamente pela nova especificação.
   - IDOB deixa de ser permanentemente "Aguardando base": a planilha
     agora tem um campo de local do fato (DESCRICAO_LOCAL_IMEDIATO)
     que permite aproximar bar/boate — ver
     manifest.mapeamento.idob.observacao no home-dados.json pra
     ressalva de categoria. Continua SEM meta ("Meta não informada").
   - ITVD para de usar "T=0 → 100%" (regra da página de detalhamento
     de produção, ver renderITVDPage): a Home agora mostra "Sem base
     de tráfico/uso" nesse caso, conforme pedido explícito da nova
     especificação — ressalva registrada no relatório de entrega,
     já que diverge do texto da própria página de detalhamento.
   - Novo estado de célula `sem_base_calculo` (QOP=0 no IDOB / T=0 no
     ITVD): nunca divide por zero, nunca inventa 0%/100%.
   - "Meta não informada" substitui "Sem meta" especificamente para
     IDOB/ITVD (os únicos dois indicadores sem coluna de meta agora).
   - Visibilidade e Pol. Cid. Empresa ainda não têm página de
     detalhamento no menu (checado em index.html) — o cabeçalho
     dessas duas colunas não é clicável, por "não inventar rota
     nova".
   - Novo bloco "Análises complementares" abaixo das duas tabelas,
     com acesso compacto a Análise Preditiva de Crimes, Violência
     Doméstica e Reincidência de Endereço (mesmas rotas já
     existentes no menu).

   CORREÇÃO 2026-09 (sobre o commit anterior — "ajusta cobertura, IDOB
   provisório e coerência do ITVD"):
   - Zero comprovado vs. "sem dados": uma cidade sem nenhuma linha num
     indicador de eventos NÃO é mais automaticamente "sem dados" — se a
     fonte carregou, as colunas estruturais foram reconhecidas e o
     período pedido está dentro da cobertura confirmada
     (manifest.cobertura[indicador]), a ausência de ocorrência agora
     mostra resultado 0 de verdade, com meta comparada normalmente.
     "Sem dados" fica só pra quando a própria aba não tem as colunas
     esperadas (colunasReconhecidas=false) — sinal objetivo vindo do
     manifest, nunca mais inferido pela presença de uma linha da cidade.
   - IDOB agora é tratado como PROVISÓRIO em toda a interface (rótulo,
     selo cinza "A validar", tooltip explicando a categoria ampliada) —
     nunca cor de desempenho, cumprimento ou variação, mesmo quando
     calculável.
   - ITVD com T=0: rótulo unificado para "Sem base para cálculo" (igual
     ao usado no IDOB com QOP=0), e a página de detalhamento
     (renderITVDPage, index.html) foi corrigida pra mostrar o mesmo
     estado em vez do "100%" antigo — mesmo indicador, mesmo resultado
     nas duas telas.
   - Bloco de pendências deixou de ficar sempre aberto: agora é uma
     linha compacta ("Qualidade dos dados: ...") com um link "Ver
     detalhes" que abre/fecha um painel recolhível.
   ============================================================ */

// ---------- Configuração das 15 colunas de indicador, na ordem exata pedida ----------
// tipo: 'criminal' (menor é favorável / regra "teto"), 'produtividade'
// (maior é favorável / regra "piso") ou 'indice' (IDOB/ITVD — percentual
// já pronto, sem coluna de meta na Metas26). `pageKey: null` = ainda não
// existe página de detalhamento pra esse indicador nesta branch —
// cabeçalho fica sem link (não inventamos rota nova).
const HN_INDICADORES = [
  { key: 'imv', label: 'IMV', tipo: 'criminal', temMeta: true, pageKey: 'imv' },
  { key: 'cvpe', label: 'CVPe', tipo: 'criminal', temMeta: true, pageKey: 'cvpe' },
  { key: 'cvpa', label: 'CVPa', tipo: 'criminal', temMeta: true, pageKey: 'cvpa' },
  { key: 'pog', label: 'POG', tipo: 'produtividade', temMeta: true, pageKey: 'pog' },
  { key: 'furto_rural', label: 'Furto Rural', tipo: 'criminal', temMeta: true, pageKey: 'furto' },
  { key: 'pat_escolar', label: 'Pat. Escolar', tipo: 'produtividade', temMeta: true, pageKey: 'ppag' },
  { key: 'prev_vd', label: 'Prev. V.D', tipo: 'produtividade', temMeta: true, pageKey: 'ppag' },
  { key: 'op_rural', label: 'Op. Rural', tipo: 'produtividade', temMeta: true, pageKey: 'ppag' },
  { key: 'visibilidade', label: 'Visibilidade', tipo: 'produtividade', temMeta: true, pageKey: null },
  { key: 'saque_seguro', label: 'Saque Seguro', tipo: 'produtividade', temMeta: true, pageKey: 'saque_seguro' },
  { key: 'pol_cid_empresa', label: 'Pol. Cid. Empresa', tipo: 'produtividade', temMeta: true, pageKey: null },
  { key: 'pad_escolar', label: 'Pad. Escolar', tipo: 'produtividade', temMeta: true, pageKey: 'padesc' },
  { key: 'rolezinho', label: 'Rolezinho', tipo: 'produtividade', temMeta: true, pageKey: 'rolezinho' },
  { key: 'idob', label: 'IDOB (prov.)', tipo: 'indice', temMeta: false, pageKey: 'idob', provisorio: true },
  { key: 'itvd', label: 'ITVD', tipo: 'indice', temMeta: false, pageKey: 'itvd' },
];
const HN_INDICADORES_BY_KEY = {};
HN_INDICADORES.forEach((c) => { HN_INDICADORES_BY_KEY[c.key] = c; });

// Nomes completos pra tooltip — copiados literalmente dos títulos/
// definições já existentes em produção (objeto DEFS do index.html)
// sempre que existirem; os 3 indicadores novos (Visibilidade, Pol.
// Cid. Empresa, Rolezinho na Home) usam o nome curto da própria
// especificação mais a aba de origem, nunca um texto inventado.
const HN_NOMES_COMPLETOS = {
  imv: 'IMV — Mortes Violentas',
  cvpe: 'CVPe — Crimes Violentos contra o Patrimônio (Pessoa)',
  cvpa: 'CVPa — Crimes Violentos contra o Patrimônio (Ambulante)',
  pog: 'POG — Operações de POG (Y04009/Y07001/Y07002/Y07003/Y07010/Y10001)',
  furto_rural: 'Furto em Zona Rural',
  pat_escolar: 'Y15001 — Patrulha Escolar/Prevenção às Drogas',
  prev_vd: 'Y07012 — Prevenção à Violência Doméstica (indicador operacional; não é a página completa de Violência Doméstica)',
  op_rural: 'Y07014 — Ação/Operação em Zona Rural (legado Y15010)',
  visibilidade: 'Visibilidade (aba Bd_vis)',
  saque_seguro: 'Operação Saque Seguro',
  pol_cid_empresa: 'Polícia Cidadã Empresa (aba Bd_Pol.Cid — não confundir com outras ações de Polícia e Cidadão)',
  pad_escolar: 'Padrinhos da Escola (não confundir com Patrulha Escolar/Y15001)',
  rolezinho: 'Operação Rolezinho (Natureza Y01003, filtrado por histórico "ROLEZINHO")',
  idob: 'IDOB provisório — Indicador de Desempenho da Operação Boemia (base ampliada, a validar)',
  itvd: 'ITVD — Indicador de Combate ao Tráfico e Violência Relacionada às Drogas',
};

// Análises complementares (Seção 22) — mesmas rotas/fontes já existentes
// no menu, só reexibidas de forma compacta na Home.
const HN_COMPLEMENTARES = [
  {
    pageKey: 'analise_preditiva',
    label: 'Análise Preditiva de Crimes',
    desc: 'Ocorrências de maior gravidade (ameaça, lesão corporal, vias de fato, descumprimento de medida protetiva, homicídio/feminicídio) do REDS geral do 70º BPM.',
    fonte: 'SiGOp/REDS — Memorando 0013/P3.3/2026',
  },
  {
    pageKey: 'violencia_domestica',
    label: 'Violência Doméstica',
    desc: 'Universo de REDS marcado pelo SiGOp com a natureza U33004 (Violência Doméstica), com taxa por 100 mil habitantes e reincidência por endereço.',
    fonte: 'SiGOp/REDS, marcação oficial U33004',
  },
  {
    pageKey: 'reincidencia',
    label: 'Reincidência de Endereço',
    desc: 'Endereços com 2 ou mais chamados de violência doméstica, crimes correlatos ou crime violento em até 60 dias corridos entre ocorrências.',
    fonte: 'SiGOp/REDS — Memorando 0013/P3.3/2026',
  },
];

const HN_MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const HN_MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

let HN_DADOS = null;
let HN_CARREGANDO = false;
const hnState = { ano: null, mes: null, dia: null };

// ---------- Funções auxiliares de data ----------
function hnDiasNoMes(ano, mes) { return new Date(ano, mes, 0).getDate(); }
function hnMesMaior(ano, mes, ref) { return !ref || ano > ref.ano || (ano === ref.ano && mes > ref.mes); }
function hnRotuloMes(ref) { return ref ? `${HN_MESES_ABREV[ref.mes - 1]}/${ref.ano}` : 'nenhum dado'; }
function hnFmtBR(v, casas) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function hnFmtVariacao(v) { return (v > 0 ? '+' : '') + hnFmtBR(v, 1) + '%'; }
function hnFmtResultado(v, cfg) {
  if (cfg.tipo === 'indice') return hnFmtBR(v, 1) + '%';
  return Math.round(v).toLocaleString('pt-BR');
}
function hnPad2(n) { return String(n).padStart(2, '0'); }
function hnPeriodoLabel(modo) {
  const { ano, mes, dia } = hnState;
  const fim = `${hnPad2(dia)}/${hnPad2(mes)}/${ano}`;
  const inicio = modo === 'mes' ? `01/${hnPad2(mes)}/${ano}` : `01/01/${ano}`;
  return `${inicio}–${fim}`;
}

// ---------- Fórmulas de IDOB/ITVD, na forma exata pedida pela nova
// especificação (e conferidas contra o texto de produção — DEFS.idob e
// a def-box de renderITVDPage no index.html usam a mesma fórmula).
// Nenhuma das duas função aqui trata divisão por zero: quem chama
// SEMPRE confere o denominador antes (QOP===0 / T===0 viram o estado
// `sem_base_calculo`, nunca um 0%/100% inventado). ----------
function calcIdobLocal(qop, v) { return ((qop - v * 10) / qop) * 100; }
function calcItvdLocal(t, v) { return ((t - v * 2) / t) * 100; }

// ---------- Leitura das estruturas dia-a-cumulativo geradas pelo script ----------
function hnArrayMes(porMun, mun, ano, mes) { return porMun && porMun[mun] && porMun[mun][ano] ? porMun[mun][ano][mes] : undefined; }
function hnValorNoDia(arr, dia) { return arr ? (arr[dia - 1] || 0) : 0; }
function hnValorFinalMes(arr) { return arr ? arr[arr.length - 1] : 0; }
function hnSomaAcum(porMun, mun, ano, mesSel, dia) {
  let soma = 0;
  for (let m = 1; m < mesSel; m++) soma += hnValorFinalMes(hnArrayMes(porMun, mun, ano, m));
  soma += hnValorNoDia(hnArrayMes(porMun, mun, ano, mesSel), dia);
  return soma;
}

// ---------- IDOB só é calculável globalmente se o próprio gerador
// confirmou que existe o campo de local (bar/boate) na planilha — ver
// manifest.cobertura.idob.idobCalculavel no home-dados.json. Nunca
// assumido true por padrão. ----------
function hnIdobCalculavelGlobal() {
  const cob = (HN_DADOS.manifest.cobertura || {}).idob || {};
  return !!cob.idobCalculavel;
}

// ---------- CORREÇÃO 2026-09 (item 1): a ausência de linha de uma cidade
// num indicador de eventos não significa, por si só, ausência de dado —
// na maioria das vezes é um resultado operacional zero de verdade. Só é
// "sem dados" quando o próprio manifest (gerado no script, nunca aqui)
// diz que a fonte não reconheceu as colunas estruturais necessárias
// (colunasReconhecidas=false, refletido em cobertura[indKey] como
// motivoSemDados !== null). Nunca mais decide isso pela presença de uma
// linha da cidade. ----------
function hnCoberturaIndicador(indKey) {
  return (HN_DADOS.manifest.cobertura || {})[indKey] || {};
}
function hnSemDadosEstrutural(indKey) {
  const cob = hnCoberturaIndicador(indKey);
  return !!cob.motivoSemDados;
}

// ---------- Resultado por cidade (Quadro 1 — mês; Quadro 2 — acumulado) ----------
function hnResultadoCidade(modo, indKey, mun, ano, mes, dia) {
  if (indKey === 'idob' && !hnIdobCalculavelGlobal()) return { estado: 'aguardando_base' };

  if (hnSemDadosEstrutural(indKey)) {
    return { estado: 'sem_dados', motivo: hnCoberturaIndicador(indKey).motivoSemDados };
  }

  const ultimo = HN_DADOS.manifest.ultimoMesPorIndicador[indKey];
  if (hnMesMaior(ano, mes, ultimo)) return { estado: 'desatualizado', ultimoRotulo: hnRotuloMes(ultimo) };

  if (indKey === 'itvd' || indKey === 'idob') {
    const compA = HN_DADOS.componentes[indKey === 'itvd' ? 'itvd_trafico' : 'idob_qop'];
    const compB = HN_DADOS.componentes[indKey === 'itvd' ? 'itvd_vit' : 'idob_vit'];
    // Dentro da cobertura confirmada (já passou pelo check de
    // "desatualizado" acima): ausência de linha para esta cidade/período
    // é resultado zero comprovado, não "sem dados" — resolvido
    // naturalmente por hnValorNoDia/hnSomaAcum (retornam 0 pra
    // município/mês sem entrada), e tratado logo abaixo como
    // "sem_base_calculo" quando o denominador (a) é zero, exatamente
    // como pedido (nunca dividir por zero, nunca inventar 0%/100%).
    const a = modo === 'mes' ? hnValorNoDia(hnArrayMes(compA, mun, ano, mes), dia) : hnSomaAcum(compA, mun, ano, mes, dia);
    const b = modo === 'mes' ? hnValorNoDia(hnArrayMes(compB, mun, ano, mes), dia) : hnSomaAcum(compB, mun, ano, mes, dia);
    if (a === 0) return { estado: 'sem_base_calculo', _a: a, _b: b };
    const resultado = indKey === 'itvd' ? calcItvdLocal(a, b) : calcIdobLocal(a, b);
    return { estado: 'ok', resultado, _a: a, _b: b };
  }

  const porMun = HN_DADOS.dados[indKey];
  const resultado = modo === 'mes' ? hnValorNoDia(hnArrayMes(porMun, mun, ano, mes), dia) : hnSomaAcum(porMun, mun, ano, mes, dia);
  return { estado: 'ok', resultado };
}

// ---------- Meta por cidade (mensal ou acumulada, já com meta proporcional
// aplicada ao mês corrente conforme a fórmula pedida: meta_mes * dia /
// dias_do_mes). Retorna undefined = meta ausente (nunca inventa). IDOB e
// ITVD nunca chegam aqui de fato: cfg.temMeta é false pra ambos. ----------
function hnMetaCidade(modo, indKey, mun, ano, mesSel, dia) {
  const cfg = HN_INDICADORES_BY_KEY[indKey];
  if (!cfg.temMeta) return undefined;
  const porMun = HN_DADOS.metas[indKey] || {};
  const metaMesSel = porMun[mun] && porMun[mun][ano] ? porMun[mun][ano][mesSel] : undefined;
  if (metaMesSel === undefined) return undefined;
  const proporcionalMesSel = metaMesSel * dia / hnDiasNoMes(ano, mesSel);
  if (modo === 'mes') return proporcionalMesSel;
  let soma = 0;
  for (let m = 1; m < mesSel; m++) {
    const v = porMun[mun] && porMun[mun][ano] ? porMun[mun][ano][m] : undefined;
    if (v === undefined) return undefined; // um mês sem meta no meio do ano => acumulado inteiro fica "ausente" (nunca soma parcial calada)
    soma += v;
  }
  return soma + proporcionalMesSel;
}

// ---------- Avaliação de variação% e cor, por tipo de indicador ----------
function hnAvaliar(tipo, resultado, meta) {
  if (meta === 0) {
    if (resultado === 0) return { variacao: null, cor: 'verde', situacao: 'Dentro do esperado' };
    if (tipo === 'criminal') return { variacao: null, cor: 'vermelho', situacao: 'Acima de zero' };
    if (tipo === 'produtividade') return { variacao: null, cor: 'verde', situacao: 'Acima de zero' };
    return { variacao: null, cor: 'cinza', situacao: 'Acima de zero (meta 0, sem banda de referência)' };
  }
  const variacao = ((resultado - meta) / meta) * 100;
  let cor;
  if (tipo === 'criminal') cor = variacao <= 0 ? 'verde' : (variacao <= 20 ? 'amarelo' : 'vermelho');
  else cor = variacao >= 0 ? 'verde' : (variacao >= -20 ? 'amarelo' : 'vermelho');
  const situacaoMap = { verde: 'Favorável', amarelo: 'Atenção', vermelho: 'Desfavorável' };
  return { variacao, cor, situacao: situacaoMap[cor] };
}

// ---------- Marcação visual (selo/célula) ----------
function hnSeloHtml(cor, texto) {
  const simbolo = { verde: '▲', amarelo: '!', vermelho: '▼', cinza: '–' }[cor] || '';
  return `<span class="hn-selo hn-selo-${cor}">${hnEsc(simbolo)} ${hnEsc(texto)}</span>`;
}
function hnEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Tooltip acessível (hover + foco por teclado) — nome completo,
// resultado, meta, variação, período, situação, fonte e qualidade do dado. ----------
function hnTextoSemBaseCalculo(cfg, cobertura) {
  if (cobertura.textoSemBase) return cobertura.textoSemBase; // ITVD: texto exato pedido, igual à página de detalhamento
  if (cfg.key === 'idob') return 'Sem operações Boemia (Bd_Boemia) no período — o IDOB não é calculado quando não há QOP, pois o denominador da fórmula é zero.';
  return 'Sem base para cálculo no período — o denominador da fórmula é zero.';
}

function hnTooltipHtml(cfg, r, meta, av, modo) {
  const nomeCompleto = HN_NOMES_COMPLETOS[cfg.key] || cfg.label;
  const cobertura = (HN_DADOS.manifest.cobertura || {})[cfg.key] || {};
  const fontes = (cobertura.fontes || []).join('; ') || '—';
  const qualidade = cobertura.mapeamento || '—';
  const linhas = [`<strong>${hnEsc(nomeCompleto)}</strong>`];
  if (r.estado === 'aguardando_base') {
    linhas.push(hnEsc(cobertura.motivoIndisponibilidade || 'Aguardando export com a base necessária para calcular este indicador.'));
  } else if (r.estado === 'sem_base_calculo') {
    linhas.push(hnEsc(hnTextoSemBaseCalculo(cfg, cobertura)));
  } else if (r.estado === 'sem_dados') {
    linhas.push(hnEsc(r.motivo || 'Fonte sem colunas estruturais reconhecidas para este indicador — não é possível distinguir resultado zero de ausência de dado.'));
  } else if (r.estado === 'desatualizado') {
    linhas.push(`Sem registros após ${hnEsc(r.ultimoRotulo)}.`);
  } else if (r.estado === 'ok') {
    linhas.push(`Resultado: ${hnEsc(hnFmtResultado(r.resultado, cfg))}`);
    if (cfg.provisorio) {
      linhas.push(hnEsc(cobertura.textoProvisorio || 'Cálculo provisório, pendente de validação oficial.'));
      linhas.push('Não classificado como favorável/desfavorável, sem cor de desempenho, sem cumprimento — aguardando validação oficial da categoria usada.');
    }
    if (!cfg.temMeta) {
      linhas.push('Meta: não informada (indicador sem coluna de meta na planilha Metas26)');
    } else {
      linhas.push(meta !== undefined ? `Meta: ${hnEsc(hnFmtBR(meta, 1))}` : 'Meta: ausente');
      if (av) {
        linhas.push(av.variacao === null ? `Situação: ${hnEsc(av.situacao)}` : `Variação: ${hnEsc(hnFmtVariacao(av.variacao))}`);
        linhas.push(`Situação: ${hnEsc(av.situacao)}`);
      }
    }
  }
  if (!cfg.pageKey) linhas.push('Sem página de detalhamento própria nesta navegação ainda.');
  linhas.push(`Período: ${hnEsc(hnPeriodoLabel(modo))}`);
  linhas.push(`Fonte: ${hnEsc(fontes)}`);
  linhas.push(`Qualidade do dado: ${hnEsc(qualidade)}`);
  if (cobertura.coberturaParcial) linhas.push('<span style="color:var(--caution)">Cobertura parcial: parte dos registros desta fonte foi rejeitada por erro estrutural — ver "Ver detalhes".</span>');
  return linhas.filter(Boolean).join('<br>');
}

// ---------- Monta uma célula (cidade OU total) já com todos os estados
// obrigatórios: ok, sem_dados, desatualizado, aguardando_base,
// sem_base_calculo, meta ausente, meta não informada, cobertura parcial. ----------
function hnRenderCelula(cfg, r, meta, parcial, modo) {
  let resultadoTxt, metaTxt = '', seloHtml = '', situacaoTxt, av = null, extraClass = '';

  if (r.estado === 'aguardando_base') {
    resultadoTxt = '—';
    seloHtml = hnSeloHtml('cinza', 'Aguardando base');
    situacaoTxt = 'Aguardando base de dados';
    extraClass = 'hn-cell-aguardando';
  } else if (r.estado === 'sem_base_calculo') {
    // Rótulo único, igual em toda a Home E na página de detalhamento do
    // ITVD (Seção 3 da correção 2026-09) — nunca 0%/100%, nunca cor,
    // nunca cumprimento/variação.
    resultadoTxt = '—';
    seloHtml = hnSeloHtml('cinza', 'Sem base para cálculo');
    situacaoTxt = hnTextoSemBaseCalculo(cfg, (HN_DADOS.manifest.cobertura || {})[cfg.key] || {});
    extraClass = 'hn-cell-sembase';
  } else if (r.estado === 'sem_dados') {
    resultadoTxt = '—';
    seloHtml = hnSeloHtml('cinza', 'Sem dados');
    situacaoTxt = r.motivo || 'Fonte sem colunas estruturais reconhecidas para este indicador';
  } else if (r.estado === 'desatualizado') {
    resultadoTxt = '—';
    seloHtml = hnSeloHtml('cinza', 'Desatualizado');
    situacaoTxt = `Sem registros após ${r.ultimoRotulo}`;
  } else {
    resultadoTxt = hnFmtResultado(r.resultado, cfg);
    if (cfg.provisorio) extraClass += ' hn-cell-provisorio';
    if (!cfg.temMeta) {
      // IDOB/ITVD: resultado em destaque, "Meta não informada" abaixo.
      // IDOB (provisório): selo cinza "A validar" — nunca cor de
      // desempenho, cumprimento ou variação (Seção 2 da correção
      // 2026-09). ITVD (sem meta, mas não provisório): sem selo.
      metaTxt = 'Meta não informada';
      if (cfg.provisorio) {
        seloHtml = hnSeloHtml('cinza', 'A validar');
        situacaoTxt = 'IDOB provisório — a validar oficialmente, sem variação calculada';
      } else {
        situacaoTxt = 'Meta não informada para este indicador — sem variação calculada';
      }
    } else if (meta === undefined) {
      metaTxt = 'Meta —';
      seloHtml = hnSeloHtml('cinza', 'Meta ausente');
      situacaoTxt = 'Sem meta cadastrada para este período';
    } else {
      av = hnAvaliar(cfg.tipo, r.resultado, meta);
      metaTxt = 'Meta ' + hnFmtBR(meta, 1);
      seloHtml = hnSeloHtml(av.cor, av.variacao === null ? av.situacao : hnFmtVariacao(av.variacao));
      situacaoTxt = av.situacao;
    }
    if (parcial) { situacaoTxt += ' · cobertura parcial (nem todas as cidades contribuíram)'; extraClass += ' hn-cell-parcial'; }
  }

  const tooltip = hnTooltipHtml(cfg, r, meta, av, modo);
  return `<td class="${extraClass.trim()}">
    <div class="hn-cell" tabindex="0">
      <div class="hn-cell-resultado">${hnEsc(resultadoTxt)}</div>
      ${metaTxt ? `<div class="hn-cell-meta">${hnEsc(metaTxt)}</div>` : ''}
      ${seloHtml}
      <div class="hn-tooltip" role="tooltip"><div>${tooltip}</div></div>
      <span class="hn-sr-only">${hnEsc(situacaoTxt)}</span>
    </div>
  </td>`;
}

// ---------- Linha TOTAL 70º BPM = soma das 13 cidades (nunca cadastrada à
// mão). Para IDOB/ITVD: soma os componentes brutos (QOP/V ou T/V) das
// cidades com estado 'ok' OU 'sem_base_calculo' (ambas carregam _a/_b) e
// aplica a fórmula UMA VEZ sobre o total — nunca soma percentuais já
// calculados por cidade. ----------
function hnCalcularTotal(cfg, celulasCidades) {
  if (cfg.key === 'idob' && !hnIdobCalculavelGlobal()) {
    return { cfg, r: { estado: 'aguardando_base' }, meta: undefined, parcial: false };
  }
  if (hnSemDadosEstrutural(cfg.key)) {
    return { cfg, r: { estado: 'sem_dados', motivo: hnCoberturaIndicador(cfg.key).motivoSemDados }, meta: undefined, parcial: false };
  }

  const contaveis = celulasCidades.filter((c) => c.r.estado === 'ok' || c.r.estado === 'sem_base_calculo');
  let parcial = contaveis.length > 0 && contaveis.length < celulasCidades.length;
  if (contaveis.length === 0) {
    const algumDesatualizado = celulasCidades.some((c) => c.r.estado === 'desatualizado');
    return { cfg, r: { estado: algumDesatualizado ? 'desatualizado' : 'sem_dados', ultimoRotulo: celulasCidades[0] && celulasCidades[0].r.ultimoRotulo }, meta: undefined, parcial: false };
  }

  let r;
  if (cfg.key === 'itvd' || cfg.key === 'idob') {
    const totalA = contaveis.reduce((s, c) => s + (c.r._a || 0), 0);
    const totalB = contaveis.reduce((s, c) => s + (c.r._b || 0), 0);
    if (totalA === 0) {
      // TOTAL 70º BPM: continua consolidando QOP/vítimas (ou T/vítimas)
      // brutos das cidades primeiro, aplica a fórmula uma única vez —
      // se o total consolidado ainda for zero, mostra o mesmo estado
      // "Sem base para cálculo" das células individuais (nunca inventa
      // 0%/100% pro TOTAL).
      r = { estado: 'sem_base_calculo' };
    } else {
      const resultado = cfg.key === 'itvd' ? calcItvdLocal(totalA, totalB) : calcIdobLocal(totalA, totalB);
      r = { estado: 'ok', resultado };
    }
  } else {
    const resultado = contaveis.reduce((s, c) => s + (c.r.resultado || 0), 0);
    r = { estado: 'ok', resultado };
  }

  let meta;
  if (cfg.temMeta) {
    const comMeta = celulasCidades.filter((c) => c.meta !== undefined);
    // O total da meta só é comparável quando as 13 cidades contribuíram.
    // Somar silenciosamente apenas as metas disponíveis produziria um
    // percentual de cumprimento artificialmente alto.
    if (comMeta.length === celulasCidades.length) {
      meta = comMeta.reduce((s, c) => s + c.meta, 0);
    } else {
      meta = undefined;
      parcial = true;
    }
  }
  return { cfg, r, meta, parcial };
}

// ---------- Construção de uma tabela (Quadro 1 ou Quadro 2) ----------
function hnConstruirTabela(modo) {
  const { ano, mes, dia } = hnState;
  const linhas = MUNICIPIOS_CANON.map((nomeCidade) => {
    const munKey = normKey(nomeCidade);
    const celulas = HN_INDICADORES.map((cfg) => ({
      cfg,
      r: hnResultadoCidade(modo, cfg.key, munKey, ano, mes, dia),
      meta: hnMetaCidade(modo, cfg.key, munKey, ano, mes, dia),
    }));
    return { nomeCidade, celulas };
  });
  const totalCelulas = HN_INDICADORES.map((cfg, i) => hnCalcularTotal(cfg, linhas.map((l) => l.celulas[i])));

  const thead = '<tr><th class="hn-th-municipio">Município</th>' +
    HN_INDICADORES.map((cfg) => {
      const pendente = (cfg.key === 'idob' && !hnIdobCalculavelGlobal())
        ? '<span class="hn-th-pend" title="Aguardando base de dados">•</span>'
        : (cfg.provisorio ? '<span class="hn-th-provisorio" title="Cálculo provisório — pendente de validação oficial da categoria usada">†</span>' : '');
      if (cfg.pageKey) {
        return `<th data-page="${cfg.pageKey}" tabindex="0" role="button" title="Abrir detalhamento de ${hnEsc(cfg.label)}">${hnEsc(cfg.label)}${pendente}</th>`;
      }
      return `<th title="${hnEsc(cfg.label)} — ainda sem página de detalhamento própria nesta navegação">${hnEsc(cfg.label)}${pendente}</th>`;
    }).join('') +
    '</tr>';
  const tbody = linhas.map((l) => `<tr><td class="hn-col-municipio">${hnEsc(l.nomeCidade)}</td>` +
    l.celulas.map((c) => hnRenderCelula(c.cfg, c.r, c.meta, false, modo)).join('') + '</tr>').join('') +
    `<tr class="hn-row-total"><td class="hn-col-municipio">TOTAL 70&ordm; BPM</td>` +
    totalCelulas.map((c) => hnRenderCelula(c.cfg, c.r, c.meta, c.parcial, modo)).join('') + '</tr>';

  return `<table class="hn-table" data-modo="${modo}"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function hnWireTabela(container) {
  const table = container.querySelector('table');
  if (!table) return;
  table.querySelectorAll('thead th').forEach((th, idx) => {
    if (idx === 0) return;
    th.addEventListener('mouseenter', () => hnHighlightCol(table, idx, true));
    th.addEventListener('mouseleave', () => hnHighlightCol(table, idx, false));
    th.addEventListener('focus', () => hnHighlightCol(table, idx, true));
    th.addEventListener('blur', () => hnHighlightCol(table, idx, false));
    const ativar = () => {
      const pageKey = th.dataset.page;
      if (!pageKey || typeof pages === 'undefined' || !pages[pageKey]) return;
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      const navBtn = document.querySelector(`[data-page="${pageKey}"]`);
      if (navBtn) navBtn.classList.add('active');
      goToPage(pageKey);
    };
    th.addEventListener('click', ativar);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ativar(); } });
  });
}
function hnHighlightCol(table, idx, on) {
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const cell = tr.children[idx];
    if (cell) cell.classList.toggle('hn-col-hover', on);
  });
}

// ---------- Carregamento dos dados ----------
function hnCarregarDados() {
  HN_CARREGANDO = true;
  return fetch('home-dados.json', { cache: 'no-store' })
    .then((resp) => {
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ao buscar home-dados.json');
      return resp.json();
    })
    .then((json) => { HN_DADOS = json; HN_CARREGANDO = false; })
    .catch((err) => { HN_CARREGANDO = false; throw err; });
}

// ---------- Esqueleto da página ----------
function hnEsqueleto() {
  return `<div class="home-nova">
    <div class="hn-header">
      <div class="hn-title-block">
        <h1 class="hn-title">Resumo dos indicadores</h1>
        <div class="hn-subtitle">Resultados dos 13 municípios do 70&ordm; BPM</div>
      </div>
      <div class="hn-header-status">
        <span id="hnFonteStatus"></span>
        <div class="hn-updated">Base gerada em <strong id="hnGeradoEm">&mdash;</strong></div>
      </div>
    </div>
    <div class="hn-controls">
      <div class="hn-control-group"><label for="hnAno">Ano</label><select id="hnAno" class="month-select"></select></div>
      <div class="hn-control-group"><label for="hnMes">M&ecirc;s</label><select id="hnMes" class="month-select"></select></div>
      <div class="hn-control-group hn-day-group"><label>Dia <strong id="hnDiaLabel">1</strong></label><input type="range" id="hnDia" min="1" max="31" value="1"></div>
      <button id="hnAteHoje" class="hn-btn-hoje" type="button">At&eacute; hoje</button>
      <div class="hn-periodo-texto" id="hnPeriodoTexto">Dados considerados at&eacute; &mdash;</div>
    </div>
    <div id="hnStatusBanner" class="hn-status-banner hn-loading" hidden></div>
    <div class="hn-quadro">
      <div class="hn-quadro-title">Resultado do m&ecirc;s <span class="hn-quadro-sub">01 do m&ecirc;s at&eacute; o dia selecionado</span></div>
      <div class="hn-table-wrap" id="hnTabelaMes"></div>
    </div>
    <div class="hn-quadro">
      <div class="hn-quadro-title">Acumulado no ano <span class="hn-quadro-sub">01/jan at&eacute; o dia selecionado</span></div>
      <div class="hn-table-wrap" id="hnTabelaAcum"></div>
    </div>
    <div class="hn-quadro" id="hnComplementaresWrap"></div>
    <div class="hn-legenda" id="hnLegenda"></div>
    <div class="hn-pendencias" id="hnPendencias"></div>
  </div>`;
}

function hnMostrarBanner(tipo, texto) {
  const el = document.getElementById('hnStatusBanner');
  if (!el) return;
  el.className = 'hn-status-banner hn-' + tipo;
  el.textContent = texto;
  el.hidden = false;
}
function hnEsconderBanner() {
  const el = document.getElementById('hnStatusBanner');
  if (el) el.hidden = true;
}

// ---------- Selo de status da fonte de dados (reaproveita a mesma
// linguagem visual do .fresh-badge já usado no resto do painel). ----------
function hnFreshBadgeHtml() {
  if (!HN_DADOS) return '';
  const ult = HN_DADOS.manifest.ultimoMesComDadosGlobal;
  if (!ult || !ult.ano) return `<span class="fresh-badge fresh-stale">Sem registro em nenhum indicador</span>`;
  const hoje = new Date();
  const atraso = (hoje.getFullYear() - ult.ano) * 12 + (hoje.getMonth() + 1 - ult.mes);
  let cls = 'fresh-ok', texto = `Dados até ${HN_MESES_ABREV[ult.mes - 1]}/${ult.ano}`;
  if (atraso >= 2) { cls = 'fresh-stale'; texto += ` — ${atraso} meses atrás`; }
  else if (atraso === 1) { cls = 'fresh-warn'; texto += ' — 1 mês atrás'; }
  return `<span class="fresh-badge ${cls}">${hnEsc(texto)}</span>`;
}

// ---------- Controles de período ----------
function hnAnosDisponiveis() {
  const anos = new Set();
  if (HN_DADOS) {
    Object.values(HN_DADOS.dados).forEach((porMun) => {
      Object.values(porMun).forEach((porAno) => { Object.keys(porAno).forEach((a) => anos.add(Number(a))); });
    });
  }
  anos.add(new Date().getFullYear());
  return Array.from(anos).sort((a, b) => a - b);
}
function hnPopularSelects() {
  const selAno = document.getElementById('hnAno');
  const anos = hnAnosDisponiveis();
  selAno.innerHTML = anos.map((a) => `<option value="${a}">${a}</option>`).join('');
  selAno.value = String(hnState.ano);
  const selMes = document.getElementById('hnMes');
  selMes.innerHTML = HN_MESES_NOME.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  selMes.value = String(hnState.mes);
}
function hnAtualizarDiaSlider() {
  const dias = hnDiasNoMes(hnState.ano, hnState.mes);
  if (hnState.dia > dias) hnState.dia = dias;
  if (hnState.dia < 1) hnState.dia = 1;
  const input = document.getElementById('hnDia');
  input.min = 1; input.max = dias; input.value = hnState.dia;
  document.getElementById('hnDiaLabel').textContent = hnState.dia;
}
function hnAtualizarTextoPeriodo() {
  const { ano, mes, dia } = hnState;
  const txt = `Dados considerados até ${hnPad2(dia)}/${hnPad2(mes)}/${ano}`;
  const el = document.getElementById('hnPeriodoTexto');
  if (el) el.textContent = txt;
}
function hnAtualizarRodape() {
  const el = document.getElementById('hnGeradoEm');
  const statusEl = document.getElementById('hnFonteStatus');
  if (statusEl) statusEl.innerHTML = hnFreshBadgeHtml();
  if (!el) return;
  if (!HN_DADOS) { el.textContent = '—'; return; }
  try {
    const d = new Date(HN_DADOS.manifest.geradoEm);
    el.textContent = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { el.textContent = HN_DADOS.manifest.geradoEm || '—'; }
}

// ---------- Rebuild das tabelas — com debounce no slider de dia, pra não
// remontar as duas tabelas inteiras a cada tick do arrasto (Seção 18). ----------
let hnDebounceTimer = null;
function hnAtualizarTabelas() {
  const wrapMes = document.getElementById('hnTabelaMes');
  const wrapAcum = document.getElementById('hnTabelaAcum');
  if (!wrapMes || !wrapAcum) return;
  try {
    wrapMes.innerHTML = hnConstruirTabela('mes');
    wrapAcum.innerHTML = hnConstruirTabela('acum');
    hnWireTabela(wrapMes);
    hnWireTabela(wrapAcum);
  } catch (e) {
    console.error('Erro ao construir as tabelas da Home:', e);
    const msg = `<div style="padding:16px;color:var(--alert)">Erro ao montar a tabela: ${hnEsc(e.message || String(e))}</div>`;
    wrapMes.innerHTML = msg;
    wrapAcum.innerHTML = msg;
  }
}
function hnAtualizarTabelasDebounced(delay) {
  if (hnDebounceTimer) clearTimeout(hnDebounceTimer);
  hnDebounceTimer = setTimeout(() => { hnDebounceTimer = null; hnAtualizarTabelas(); }, delay);
}

// ---------- Bloco "Análises complementares" (Seção 22) — compacto, sem
// cartão grande, sem resultados detalhados dentro da Home; abre a página
// completa já existente no menu. ----------
function hnComplementaresHtml() {
  return `<div class="hn-quadro-title">Análises complementares</div>
    <div class="hn-compl-grid">
      ${HN_COMPLEMENTARES.map((item) => `
        <button type="button" class="hn-compl-item" data-page="${item.pageKey}">
          <span class="hn-compl-label">${hnEsc(item.label)}</span>
          <span class="hn-compl-desc">${hnEsc(item.desc)}</span>
          <span class="hn-compl-fonte">Fonte: ${hnEsc(item.fonte)}</span>
        </button>`).join('')}
    </div>`;
}
function hnWireComplementares(container) {
  container.querySelectorAll('.hn-compl-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pageKey = btn.dataset.page;
      if (!pageKey || typeof pages === 'undefined' || !pages[pageKey]) return;
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      const navBtn = document.querySelector(`[data-page="${pageKey}"]`);
      if (navBtn) navBtn.classList.add('active');
      goToPage(pageKey);
    });
  });
}
function hnAtualizarComplementares() {
  const wrap = document.getElementById('hnComplementaresWrap');
  if (!wrap) return;
  wrap.innerHTML = hnComplementaresHtml();
  hnWireComplementares(wrap);
}

function hnLegendaHtml() {
  return `
    <div class="hn-legenda-item">${hnSeloHtml('verde', 'Favorável')}</div>
    <div class="hn-legenda-item">${hnSeloHtml('amarelo', 'Atenção')}</div>
    <div class="hn-legenda-item">${hnSeloHtml('vermelho', 'Desfavorável')}</div>
    <div class="hn-legenda-item">${hnSeloHtml('cinza', 'Sem dados / desatualizado / meta ausente / aguardando base / sem base p/ cálculo')}</div>
    <div class="hn-legenda-item hn-legenda-texto">Estados possíveis de uma célula: carregando, atualizado, desatualizado, sem registros, meta ausente, meta não informada (IDOB/ITVD), resultado ausente, cobertura parcial, aguardando base, sem base para cálculo, erro na origem.</div>
    <div class="hn-legenda-item hn-legenda-texto">Clique (ou Enter/espaço com o foco no cabeçalho) para abrir o detalhamento do indicador, quando existir página própria.</div>
  `;
}
// CORREÇÃO 2026-09 (Seção 4 — reduzir poluição visual): o conteúdo técnico
// completo (antes sempre visível, "Pendências e observações") agora fica
// dentro de um painel recolhível, fechado por padrão. A Home mostra só uma
// linha compacta + um botão "Ver detalhes"; o conteúdo integral continua
// disponível aqui (e, na íntegra, no manifest/home-dados.json) — nada foi
// apagado, só deixou de ficar sempre aberto.
function hnPendenciasDetalheItens() {
  if (!HN_DADOS) return [];
  const mm = HN_DADOS.manifest.mapeamento || {};
  const itens = [];
  if (mm.idob) itens.push(`<strong>IDOB</strong>: ${hnEsc(mm.idob.observacao || mm.idob.motivoIndisponibilidade || '')}`);
  if (mm.itvd) itens.push(`<strong>ITVD</strong>: ${hnEsc(mm.itvd.observacao || '')}`);
  Object.entries(mm).forEach(([k, m]) => {
    if (k !== 'idob' && k !== 'itvd' && m.observacao) itens.push(`<strong>${hnEsc(k.toUpperCase())}</strong>: ${hnEsc(m.observacao)}`);
  });
  (HN_DADOS.manifest.metasSemColuna || []).forEach((k) => {
    itens.push(`<strong>${hnEsc(k.toUpperCase())}</strong>: não tem coluna de meta na aba Metas26 — mostra sempre "Meta não informada", nunca inventado por semelhança com outra coluna.`);
  });
  itens.push('<strong>Visibilidade</strong> e <strong>Pol. Cid. Empresa</strong>: ainda não têm página de detalhamento própria no menu desta branch — o cabeçalho dessas duas colunas não é clicável até essa rota existir (não foi inventada rota nova).');
  const cobParcial = Object.entries(HN_DADOS.manifest.cobertura || {}).filter(([, c]) => c && c.coberturaParcial);
  if (cobParcial.length) {
    itens.push(`<strong>Cobertura parcial</strong> nesta geração: ${cobParcial.map(([k]) => hnEsc(k.toUpperCase())).join(', ')} — detalhe por indicador em manifest.cobertura (home-dados.json).`);
  }
  const alertas = HN_DADOS.manifest.alertasAnomalia || [];
  if (alertas.length) {
    itens.push(`<span class="hn-alerta-anomalia"><strong>${alertas.length} alerta(s) de anomalia</strong> em relação à geração anterior: ${alertas.map(hnEsc).join(' · ')}</span>`);
  }
  itens.push('Os dados desta Home são gerados por um script (scripts/gerar-dados-home.mjs) que precisa ser rodado de novo (e o home-dados.json republicado) para refletir mudanças na planilha — não há atualização automática ligada ainda nesta branch de testes.');
  return itens;
}
function hnPendenciasHtml() {
  const itens = hnPendenciasDetalheItens();
  if (!HN_DADOS) return '';
  const geradoEm = (() => {
    try { return new Date(HN_DADOS.manifest.geradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return HN_DADOS.manifest.geradoEm || '—'; }
  })();
  const resumoTexto = itens.length
    ? 'Qualidade dos dados: há indicadores provisórios ou sem base.'
    : 'Qualidade dos dados: sem pendências registradas nesta geração.';
  const painel = itens.length
    ? `<div class="hn-pendencias-painel" id="hnPendenciasPainel" hidden>
        <div class="hn-pendencias-title">Pendências e observações</div>
        <ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul>
        <div class="hn-fonte-rodape">Geração: <strong>${hnEsc(geradoEm)}</strong>. Fonte: <strong>${hnEsc((HN_DADOS.manifest.fonte && HN_DADOS.manifest.fonte.descricao) || 'Base interna GDO 2026')}</strong>. O endereço da fonte bruta não é publicado no painel.</div>
      </div>`
    : '';
  return `<div class="hn-pendencias-resumo">
      <span class="hn-pendencias-resumo-texto">${hnEsc(resumoTexto)}</span>
      ${itens.length ? `<button type="button" class="hn-pendencias-toggle" id="hnPendenciasToggle" aria-expanded="false" aria-controls="hnPendenciasPainel">Ver detalhes</button>` : ''}
    </div>${painel}`;
}
function hnWirePendencias(container) {
  const btn = container.querySelector('#hnPendenciasToggle');
  const painel = container.querySelector('#hnPendenciasPainel');
  if (!btn || !painel) return;
  btn.addEventListener('click', () => {
    const abrir = !!painel.hidden;
    painel.hidden = !abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    btn.textContent = abrir ? 'Ocultar detalhes' : 'Ver detalhes';
  });
}
function hnAtualizarLegendaEPendencias() {
  const legEl = document.getElementById('hnLegenda');
  const penEl = document.getElementById('hnPendencias');
  if (legEl) legEl.innerHTML = hnLegendaHtml();
  if (penEl) { penEl.innerHTML = hnPendenciasHtml(); hnWirePendencias(penEl); }
}

function hnDefinirHoje() {
  const hoje = new Date();
  hnState.ano = hoje.getFullYear();
  hnState.mes = hoje.getMonth() + 1;
  hnState.dia = hoje.getDate();
}
function hnInicializarEstadoPadrao() {
  const hoje = new Date();
  const ultimo = HN_DADOS && HN_DADOS.manifest
    ? HN_DADOS.manifest.ultimoMesComDadosGlobal
    : null;
  const ultimoEhAnteriorHoje = ultimo && (
    ultimo.ano < hoje.getFullYear() ||
    (ultimo.ano === hoje.getFullYear() && ultimo.mes < hoje.getMonth() + 1)
  );
  if (ultimoEhAnteriorHoje) {
    hnState.ano = ultimo.ano;
    hnState.mes = ultimo.mes;
    hnState.dia = hnDiasNoMes(ultimo.ano, ultimo.mes);
    return;
  }
  hnDefinirHoje();
}
function hnAjustarDiaEAtualizar() {
  hnAtualizarDiaSlider();
  hnAtualizarTabelas();
  hnAtualizarTextoPeriodo();
}
function hnAtualizarTudo() {
  hnEsconderBanner();
  hnPopularSelects();
  hnAtualizarDiaSlider();
  hnAtualizarTabelas();
  hnAtualizarTextoPeriodo();
  hnAtualizarComplementares();
  hnAtualizarLegendaEPendencias();
  hnAtualizarRodape();
}
function hnWireControles() {
  document.getElementById('hnAno').addEventListener('change', (e) => { hnState.ano = Number(e.target.value); hnAjustarDiaEAtualizar(); });
  document.getElementById('hnMes').addEventListener('change', (e) => { hnState.mes = Number(e.target.value); hnAjustarDiaEAtualizar(); });
  document.getElementById('hnDia').addEventListener('input', (e) => {
    hnState.dia = Number(e.target.value);
    document.getElementById('hnDiaLabel').textContent = hnState.dia;
    hnAtualizarTextoPeriodo();
    hnAtualizarTabelasDebounced(120); // evita remontar as duas tabelas a cada tick do arrasto
  });
  document.getElementById('hnAteHoje').addEventListener('click', () => { hnDefinirHoje(); hnAtualizarTudo(); });
}

// ---------- Ponto de entrada, chamado por pages.home() via goToPage('home') ----------
function renderHomeNova() {
  const main = document.getElementById('main');
  main.innerHTML = hnEsqueleto();
  hnWireControles();

  if (HN_DADOS) {
    if (hnState.ano === null) hnInicializarEstadoPadrao();
    hnAtualizarTudo();
    return;
  }
  hnMostrarBanner('loading', 'Carregando dados da planilha (home-dados.json)...');
  hnCarregarDados()
    .then(() => {
      if (hnState.ano === null) hnInicializarEstadoPadrao();
      hnAtualizarTudo();
    })
    .catch((err) => {
      console.error('Erro ao carregar home-dados.json:', err);
      hnMostrarBanner('erro', 'Não foi possível carregar os dados de origem (home-dados.json). ' + (err && err.message ? err.message : String(err)) + ' — verifique se o arquivo foi publicado junto com o index.html.');
    });
}

// ---------- Troca só a Home; nenhuma outra página, nav ou auth é alterada ----------
pages.home = renderHomeNova;
if (typeof currentPageKey !== 'undefined' && currentPageKey === 'home') {
  goToPage('home');
}
