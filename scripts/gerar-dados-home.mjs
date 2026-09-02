#!/usr/bin/env node
// ============================================================
// Gera os dados da nova Home institucional a partir da planilha real
// BASE_INDICADORES_GDO_2026 (Google Sheets, compartilhada como "Qualquer
// pessoa com o link — Leitor"). Não inventa dado nenhum: cada indicador
// vem de uma aba específica da planilha, e cada mapeamento tem seu status
// registrado no próprio JSON gerado, para auditoria sem precisar de IA.
//
// Reescrito em 2026-09 seguindo a "ATUALIZAÇÃO DEFINITIVA DAS REGRAS DA
// HOME" (autoridade explícita sobre fontes/cálculos, substitui os
// mapeamentos inferidos das entregas anteriores). Mudanças principais:
// - 15 indicadores na matriz (Cavalo de Aço saiu da matriz, mas continua
//   como página independente — este script não processa mais Cavalo de
//   Aço, pois a Home não precisa mais desse dado);
// - IMV/CVPe/CVPa agora somam o campo *_TOTAL de cada linha (vítimas),
//   não contam linhas;
// - 5 indicadores novos: Visibilidade, Pol. Cid. Empresa, Rolezinho
//   (mais Saque Seguro e Pad. Escolar, que já existiam mas mudaram de
//   aba/nome);
// - Metas26 agora é lida por LETRA de coluna (G,H,I,J,L,M,N,O,Q,R,S,T,U),
//   com o cabeçalho de cada letra registrado no manifest pra conferência;
// - IDOB agora É calculável: a aba Bd_MV/Bd_CVPe/Bd_CVPa tem o campo
//   DESCRICAO_LOCAL_IMEDIATO com o valor "BAR / LANCHONETE / RESTAURANTE
//   / SIMILAR" — usado como aproximação documentada de "bar/boate" (ver
//   ressalva no manifest: a categoria é mais ampla que só bar/boate).
// - ITVD mantém o filtro de natureza já confirmado em Bd_trafico; o
//   componente de vítimas (V) passou a ser REDS distintos de
//   Bd_MV+Bd_CVPe+Bd_CVPa (união, sem repetir o mesmo REDS entre abas) —
//   ver ressalva sobre a "coluna AL" no manifest.
//
// Uso: node scripts/gerar-dados-home.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.HOME_FONTES_CONFIG
  ? path.resolve(process.env.HOME_FONTES_CONFIG)
  : path.resolve(__dirname, "../home-fontes.local.json");
if (!fs.existsSync(configPath)) {
  throw new Error(
    "Configuração privada ausente. Copie home-fontes.example.json para " +
    "home-fontes.local.json, preencha o ID da planilha e os gids das abas. " +
    "O arquivo local é ignorado pelo git."
  );
}
const configFontes = JSON.parse(fs.readFileSync(configPath, "utf8"));
const SHEET_ID = String(configFontes.sheetId || "").trim();
const ABAS = configFontes.abas || {};
const ABAS_OBRIGATORIAS = [
  "Bd_MV", "Bd_CVPe", "Bd_CVPa", "Bd_OP", "Bd_furto_Rural", "Bd_vis",
  "Bd_Saq_seguro", "Bd_Pol.Cid", "Bd_rol", "Bd_Pad.Esc", "Bd_Boemia",
  "Bd_trafico", "Metas26",
];
if (!SHEET_ID || ABAS_OBRIGATORIAS.some((aba) => !Object.hasOwn(ABAS, aba)) || Object.values(ABAS).some((gid) => !Number.isInteger(Number(gid)) || Number(gid) <= 0)) {
  throw new Error("home-fontes.local.json está incompleto ou possui gid inválido.");
}

const MUNICIPIOS_CANON = [
  "Águas Vermelhas", "Araçuaí", "Cachoeira de Pajeú", "Comercinho", "Coronel Murta",
  "Divisa Alegre", "Itaobim", "Itinga", "Medina", "Padre Paraíso", "Pedra Azul",
  "Ponto dos Volantes", "Virgem da Lapa",
];

function normKey(s) {
  return (s || "").toString().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
const CANON_KEYS = new Set(MUNICIPIOS_CANON.map(normKey));

// ------------------------------------------------------------
// Abas usadas, com gid confirmado por leitura direta da planilha
// (Arquivo > htmlview, pareando nome de aba com gid — não suposição,
// reconfirmado em 2026-09 pela listagem completa de 25 abas da
// planilha). Bd_a21007/Bd_PadEsc foram renomeadas pelo dono da planilha
// para Bd_Saq_seguro/Bd_Pad.Esc (mesmo gid, mesmo dado). Bd_RATCA/
// Bd_RedsCA (Cavalo de Aço) e Bd_CVBoemia/Bd_CVDrogas (fontes inválidas
// já removidas em correção anterior) não são mais buscadas — a Home não
// usa mais esses dados.
// ------------------------------------------------------------
function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

// ------------------------------------------------------------
// Parser CSV simples (aspas, vírgula, quebra de linha dentro de campo).
// ------------------------------------------------------------
function parseCsv(texto) {
  const linhas = [];
  let campo = "", linha = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') { dentroAspas = false; }
      else { campo += c; }
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ",") { linha.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        linha.push(campo); campo = "";
        if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
        linha = [];
      } else { campo += c; }
    }
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  if (linhas.length < 2) return { header: [], rows: [] };
  const header = linhas[0].map((h) => h.trim());
  const rows = linhas.slice(1).map((row) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = (row[idx] ?? "").trim()));
    // guarda a linha crua também, pra poder recuperar campos que
    // escorregaram de posição (ver DEFEITO_CONHECIDO_MUNICIPIO abaixo)
    // e pra leitura posicional (Metas26 por letra de coluna).
    Object.defineProperty(obj, "__raw", { value: row, enumerable: false });
    return obj;
  });
  return { header, rows };
}

async function baixarAba(nome, gid) {
  const url = csvUrl(gid);
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar aba ${nome} (gid ${gid})`);
  const texto = await resp.text();
  if (texto.trimStart().slice(0, 15).toLowerCase().startsWith("<!doctype")) {
    throw new Error(`Aba ${nome} (gid ${gid}) devolveu HTML, não CSV — verifique se a planilha continua compartilhada como "Qualquer pessoa com o link".`);
  }
  return parseCsv(texto);
}

// ------------------------------------------------------------
// DEFEITO_CONHECIDO_MUNICIPIO: em algumas linhas de algumas abas de
// exportação do SiGOp, um campo de data/hora de comunicação aparece sem
// que o cabeçalho declare essa coluna, empurrando UF/MUNICIPIO uma
// posição à frente SÓ NAQUELA linha. Em vez de confiar cegamente na
// posição nomeada "MUNICIPIO", procura o valor entre um pequeno
// intervalo de colunas vizinhas até achar um nome de município das 13
// cidades do 70º BPM. Não inventa dado — só localiza corretamente um
// valor que já está na linha, usando como âncora a lista fechada de
// municípios possíveis.
// ------------------------------------------------------------
function municipioRobusto(header, obj, colMunicipio) {
  const direto = normKey(obj[colMunicipio]);
  if (CANON_KEYS.has(direto)) return direto;
  const idxBase = header.indexOf(colMunicipio);
  if (idxBase === -1) return direto;
  for (const delta of [1, -1, 2]) {
    const idx = idxBase + delta;
    if (idx < 0 || idx >= obj.__raw.length) continue;
    const candidato = normKey(obj.__raw[idx]);
    if (CANON_KEYS.has(candidato)) return candidato;
  }
  return direto;
}

// ------------------------------------------------------------
// Um código de natureza do SiGOp tem o formato letra + 4 a 6 dígitos
// (ex.: I04033, I99000, B01121). Usado como âncora de formato pra achar
// a coluna certa quando o cabeçalho declarado não bate com a posição
// real do dado (mesmo tipo de defeito do municipioRobusto).
// ------------------------------------------------------------
function pareceCodigoNatureza(s) {
  return /^[A-Z]\d{4,6}$/.test((s || "").toString().trim().toUpperCase());
}
function naturezaRobusta(header, obj, colNatureza) {
  const norm = (s) => (s || "").toString().trim().toUpperCase();
  const direto = norm(obj[colNatureza]);
  if (pareceCodigoNatureza(direto)) return direto;
  const idxBase = header.indexOf(colNatureza);
  if (idxBase === -1) return direto;
  for (const delta of [1, -1, 2, -2]) {
    const idx = idxBase + delta;
    if (idx < 0 || idx >= obj.__raw.length) continue;
    const candidato = norm(obj.__raw[idx]);
    if (pareceCodigoNatureza(candidato)) return candidato;
  }
  return direto;
}

// ------------------------------------------------------------
// Data do fato: aceita DD/MM/AAAA (com ou sem hora) e ISO AAAA-MM-DD.
// ------------------------------------------------------------
function parseData(texto) {
  const t = (texto || "").trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return { ano: Number(br[3]), mes: Number(br[2]), dia: Number(br[1]) };
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) };
  return null;
}

function diasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

// ------------------------------------------------------------
// DEFEITO_CONHECIDO_DATA_FATO: algumas linhas vêm do export do SiGOp com
// DATA_FATO vazio, mas com ANO_FATO/MES_NUMERICO (ou ANO/MES) e
// DIA_NUMERICO já preenchidos na mesma linha. Remonta a data a partir
// desses três campos em vez de descartar a linha — mesmo princípio do
// municipioRobusto: localizar um valor que já está lá, nunca inventar.
// ------------------------------------------------------------
function dataRobusta(obj, colData) {
  const direto = parseData(obj[colData]);
  if (direto) return direto;
  const ano = Number(obj.ANO_FATO ?? obj.ANO);
  const mes = Number(obj.MES_NUMERICO ?? obj.MES);
  const dia = Number(obj.DIA_NUMERICO);
  if (ano && mes && dia) return { ano, mes, dia };
  return null;
}

// ------------------------------------------------------------
// Número em formato BR (vírgula decimal, ponto de milhar) ou puro
// (inteiro simples, formato mais comum nos campos *_TOTAL). Campo vazio
// ou não numérico devolve null — NUNCA vira 0 silenciosamente; quem
// chama decide como registrar a ausência/invalidez.
// ------------------------------------------------------------
function parseNumeroBR(texto) {
  if (texto === undefined || texto === null) return null;
  const t = String(texto).trim();
  if (t === "") return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const v = Number(normalizado);
  return Number.isFinite(v) ? v : null;
}

// ------------------------------------------------------------
// Acha uma coluna por nome ignorando maiúsculas/minúsculas, devolvendo o
// NOME REAL encontrado no cabeçalho (pra registrar no manifest, nunca
// deslocar coluna sem avisar).
// ------------------------------------------------------------
function acharColunaCI(header, nomeAlvo) {
  const alvo = (nomeAlvo || "").toLowerCase();
  return header.find((h) => h.toLowerCase() === alvo) || null;
}

// ------------------------------------------------------------
// Letra de coluna de planilha (A, B, ..., Z, AA, AB, ...) -> índice
// 0-based. Usado pra ler a Metas26 por posição, como pedido.
// ------------------------------------------------------------
function colLetraParaIndice(letra) {
  let n = 0;
  for (const c of letra.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

// ------------------------------------------------------------
// Confere se as colunas ESTRUTURAIS necessárias (chave, município, data)
// existem de fato no cabeçalho da aba — não a robustez linha-a-linha
// (municipioRobusto/dataRobusta já cobrem isso), mas se a aba, como um
// todo, declara essas colunas. Se uma delas não existe, não dá pra
// confiar que "cidade sem linha" == "cidade com resultado zero": pode
// ser um problema estrutural da própria fonte. Usado pra decidir entre
// "resultado 0 comprovado" e "sem dados" (Seção 1 da correção de 2026-09).
// ------------------------------------------------------------
function colunasEncontradas(header, cols) {
  return cols.every((c) => header.includes(c));
}

// ------------------------------------------------------------
// CORREÇÃO 2026-09 (achado ao calibrar "cobertura parcial"): algumas
// exportações trazem linhas de PREENCHIMENTO no fim do CSV — sem chave,
// sem município, sem data, só com um "0" residual numa coluna de total
// (ex.: 35 das 55 linhas de Bd_MV são assim: só IMV_TOTAL="0", os outros
// 73 campos vazios). Não são ocorrências rejeitadas por erro — são
// linhas sem NENHUMA informação identificadora, então nem chegam a ser
// "um registro" pra fins de contagem/rejeição. Excluí-las ANTES da
// extração evita que apareçam como "63% de rejeição" (falso positivo de
// cobertura parcial) só por causa de preenchimento vazio da planilha.
// Critério objetivo: chave, município E data todos vazios ao mesmo
// tempo — uma linha real de evento sempre tem pelo menos a data ou a
// chave preenchida.
// ------------------------------------------------------------
function linhaEstruturalmenteVazia(l, { colChave, colMunicipio, colData }) {
  return !(l[colChave] || "").trim() && !(l[colMunicipio] || "").trim() && !(l[colData] || "").trim();
}
function excluirLinhasVazias(linhas, opts) {
  let linhasVaziasIgnoradas = 0;
  const restantes = linhas.filter((l) => {
    if (linhaEstruturalmenteVazia(l, opts)) { linhasVaziasIgnoradas++; return false; }
    return true;
  });
  return { restantes, linhasVaziasIgnoradas };
}

// ------------------------------------------------------------
// Deduplica uma lista de linhas e devolve só eventos válidos:
// {municipio, ano, mes, dia}. Linhas com data inválida ou município
// fora das 13 cidades do 70º BPM são contadas como rejeitadas, nunca
// silenciosamente ignoradas. Linhas 100% vazias (sem chave/município/
// data) são descartadas ANTES, sem contar como rejeição (ver
// linhaEstruturalmenteVazia acima).
// ------------------------------------------------------------
function extrairEventos(header, linhasEntrada, { colChave, colMunicipio, colData }) {
  const { restantes: linhas, linhasVaziasIgnoradas } = excluirLinhasVazias(linhasEntrada, { colChave, colMunicipio, colData });
  const vistos = new Set();
  const eventos = [];
  let rejeitadasSemChave = 0, rejeitadasSemData = 0, rejeitadasMunicipioInvalido = 0, duplicadas = 0;
  for (const l of linhas) {
    const chave = (l[colChave] || "").trim();
    if (!chave) { rejeitadasSemChave++; continue; }
    if (vistos.has(chave)) { duplicadas++; continue; }
    const dt = dataRobusta(l, colData);
    if (!dt) { rejeitadasSemData++; continue; }
    const munKey = municipioRobusto(header, l, colMunicipio);
    if (!CANON_KEYS.has(munKey)) { rejeitadasMunicipioInvalido++; continue; }
    vistos.add(chave);
    eventos.push({ municipio: munKey, ano: dt.ano, mes: dt.mes, dia: dt.dia });
  }
  const colunasReconhecidas = colunasEncontradas(header, [colChave, colMunicipio, colData]);
  return { eventos, stats: { total: linhas.length, linhasVaziasIgnoradas, rejeitadasSemChave, rejeitadasSemData, rejeitadasMunicipioInvalido, duplicadas, colunasReconhecidas } };
}

// ------------------------------------------------------------
// Igual a extrairEventos, mas em vez de contar 1 por linha, lê e soma o
// valor de um campo (ex.: IMV_TOTAL) — pra indicadores que representam
// quantidade de vítimas, não quantidade de linhas. Linha com valor
// ausente/inválido é REJEITADA da soma (nunca vira 0) e contada à parte
// em valoresInvalidos.
// ------------------------------------------------------------
function extrairEventosValor(header, linhasEntrada, { colChave, colMunicipio, colData, campoValorAlvo }) {
  const nomeColunaValor = acharColunaCI(header, campoValorAlvo);
  const { restantes: linhas, linhasVaziasIgnoradas } = excluirLinhasVazias(linhasEntrada, { colChave, colMunicipio, colData });
  const vistos = new Set();
  const eventos = [];
  let rejeitadasSemChave = 0, rejeitadasSemData = 0, rejeitadasMunicipioInvalido = 0, duplicadas = 0, valoresInvalidos = 0;
  for (const l of linhas) {
    const chave = (l[colChave] || "").trim();
    if (!chave) { rejeitadasSemChave++; continue; }
    if (vistos.has(chave)) { duplicadas++; continue; }
    const dt = dataRobusta(l, colData);
    if (!dt) { rejeitadasSemData++; continue; }
    const munKey = municipioRobusto(header, l, colMunicipio);
    if (!CANON_KEYS.has(munKey)) { rejeitadasMunicipioInvalido++; continue; }
    const valor = nomeColunaValor ? parseNumeroBR(l[nomeColunaValor]) : null;
    if (valor === null) { valoresInvalidos++; continue; }
    vistos.add(chave);
    eventos.push({ municipio: munKey, ano: dt.ano, mes: dt.mes, dia: dt.dia, valor });
  }
  const colunasReconhecidas = colunasEncontradas(header, [colChave, colMunicipio, colData]) && !!nomeColunaValor;
  return {
    eventos,
    stats: { total: linhas.length, linhasVaziasIgnoradas, rejeitadasSemChave, rejeitadasSemData, rejeitadasMunicipioInvalido, duplicadas, valoresInvalidos, colunasReconhecidas },
    colunaValorEncontrada: nomeColunaValor,
  };
}

// ------------------------------------------------------------
// Acumula eventos em estrutura [indicador][municipioKey][ano][mes] =
// array cumulativo por dia (index 0 = dia 1). Se o evento tiver
// `.valor`, soma o valor (indicadores de quantidade de vítimas); senão
// soma 1 por evento (contagem de linhas/operações, comportamento
// original).
// ------------------------------------------------------------
function acumularPorDia(estrutura, indicador, eventos) {
  if (!estrutura[indicador]) estrutura[indicador] = {};
  const porChaveMes = new Map();
  for (const ev of eventos) {
    const chave = `${ev.municipio}|${ev.ano}|${ev.mes}`;
    if (!porChaveMes.has(chave)) porChaveMes.set(chave, {});
    const porDia = porChaveMes.get(chave);
    const valor = ev.valor !== undefined ? ev.valor : 1;
    porDia[ev.dia] = (porDia[ev.dia] || 0) + valor;
  }
  for (const [chave, porDia] of porChaveMes.entries()) {
    const [municipio, anoStr, mesStr] = chave.split("|");
    const ano = Number(anoStr), mes = Number(mesStr);
    const nDias = diasNoMes(ano, mes);
    const cumulativo = [];
    let acc = 0;
    for (let d = 1; d <= nDias; d++) {
      acc += porDia[d] || 0;
      cumulativo.push(acc);
    }
    if (!estrutura[indicador][municipio]) estrutura[indicador][municipio] = {};
    if (!estrutura[indicador][municipio][ano]) estrutura[indicador][municipio][ano] = {};
    estrutura[indicador][municipio][ano][mes] = cumulativo;
  }
}

// ------------------------------------------------------------
// Primeiro mês de uma lista de eventos JÁ EXTRAÍDA (não de uma estrutura
// dados[indicador][municipio] — evita a circularidade de usar o próprio
// resultado filtrado por indicador/natureza pra decidir onde a
// COBERTURA DA ABA começa: uma cidade sem nenhum Rolezinho em janeiro,
// por exemplo, não deve empurrar o início de cobertura de Rolezinho pra
// depois de janeiro só por causa disso).
// ------------------------------------------------------------
function primeiroMesEventos(eventos) {
  let primeiro = null;
  for (const ev of eventos) {
    if (!primeiro || ev.ano < primeiro.ano || (ev.ano === primeiro.ano && ev.mes < primeiro.mes)) primeiro = { ano: ev.ano, mes: ev.mes };
  }
  return primeiro;
}

function atualizarUltimoMes(ultimoMes, eventos) {
  for (const ev of eventos) {
    if (!ultimoMes.ano || ev.ano > ultimoMes.ano || (ev.ano === ultimoMes.ano && ev.mes > ultimoMes.mes)) {
      ultimoMes.ano = ev.ano;
      ultimoMes.mes = ev.mes;
    }
  }
}

const MESES_PT = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// ------------------------------------------------------------
// Metas26 lida por LETRA de coluna, exatamente como especificado —
// nunca por nome de cabeçalho (evita deslocar sem avisar se o cabeçalho
// mudar de nome no futuro; qualquer divergência letra<->cabeçalho fica
// registrada no manifest). K e P são deliberadamente ignoradas (Meta_
// Armas e Meta_Y15020) — não usadas por nenhum indicador da Home.
// ------------------------------------------------------------
const COLUNAS_METAS_LETRA = {
  G: "imv", H: "cvpe", I: "cvpa", J: "pog", L: "furto_rural", M: "pat_escolar",
  N: "prev_vd", O: "op_rural", Q: "visibilidade", R: "saque_seguro",
  S: "pol_cid_empresa", T: "pad_escolar", U: "rolezinho",
};

async function main() {
  console.log("Baixando abas da planilha...");
  const brutos = {};
  for (const [nome, gid] of Object.entries(ABAS)) {
    process.stdout.write(`  ${nome} (gid ${gid})... `);
    brutos[nome] = await baixarAba(nome, gid);
    console.log(`${brutos[nome].rows.length} linhas`);
  }

  const estrutura = {};
  const ultimoMes = { ano: null, mes: null };
  const statsRejeicao = {};
  const statsPorIndicador = {};

  // ------------------------------------------------------------
  // Início de cobertura temporal DA ABA (não do indicador filtrado): usa
  // TODAS as linhas da aba, sem filtro de natureza/nome de operação, só
  // pra achar o primeiro mês em que a fonte como um todo tem QUALQUER
  // registro. É o sinal certo pra decidir se "cidade sem linha nesse
  // indicador filtrado" é resultado zero comprovado (a fonte cobre o
  // período, só não teve ocorrência daquele tipo específico) — memorizado
  // por aba pra não reprocessar a cada indicador que a usa (ex.: Bd_OP
  // serve POG/Pat.Escolar/Prev.VD/Op.Rural).
  // ------------------------------------------------------------
  const primeiroMesAbaCache = {};
  function primeiroMesAba(nomeAba, opts) {
    if (nomeAba in primeiroMesAbaCache) return primeiroMesAbaCache[nomeAba];
    const { header, rows } = brutos[nomeAba];
    const { eventos } = extrairEventos(header, rows, opts);
    const primeiro = primeiroMesEventos(eventos);
    primeiroMesAbaCache[nomeAba] = primeiro;
    return primeiro;
  }

  function processar(nome, indicador, opts, filtro) {
    const { header, rows } = brutos[nome];
    let linhas = rows;
    if (filtro) linhas = linhas.filter(filtro);
    const { eventos, stats } = extrairEventos(header, linhas, opts);
    statsRejeicao[`${nome}${filtro ? ":" + indicador : ""}`] = stats;
    statsPorIndicador[indicador] = { aba: nome, opts, ...stats };
    acumularPorDia(estrutura, indicador, eventos);
    atualizarUltimoMes(ultimoMes, eventos);
    return eventos;
  }

  function processarValor(nome, indicador, opts) {
    const { header, rows } = brutos[nome];
    const { eventos, stats, colunaValorEncontrada } = extrairEventosValor(header, rows, opts);
    statsRejeicao[`${nome}:${indicador}`] = stats;
    statsPorIndicador[indicador] = { aba: nome, opts, campoValorAlvo: opts.campoValorAlvo, campoValorEncontrado: colunaValorEncontrada, ...stats };
    acumularPorDia(estrutura, indicador, eventos);
    atualizarUltimoMes(ultimoMes, eventos);
    return eventos;
  }

  // ---- IMV / CVPe / CVPa: somam o campo *_TOTAL (vítimas), não contam
  // linhas — corrigido em 2026-09 seguindo a "Atualização Definitiva". ----
  processarValor("Bd_MV", "imv", { colChave: "NUMERO_REDS", colMunicipio: "MUNICIPIO", colData: "DATA_FATO", campoValorAlvo: "IMV_TOTAL" });
  processarValor("Bd_CVPe", "cvpe", { colChave: "NUMERO_REDS", colMunicipio: "MUNICIPIO", colData: "DATA_FATO", campoValorAlvo: "ICVPE_TOTAL" });
  processarValor("Bd_CVPa", "cvpa", { colChave: "NUMERO_REDS", colMunicipio: "MUNICIPIO", colData: "DATA_FATO", campoValorAlvo: "ICVPA_TOTAL" });

  // ---- Bd_OP: uma aba, quatro indicadores, separados por natureza
  // (naturezas já confirmadas em produção; não afetadas pelo defeito de
  // deslocamento de coluna — reverificado). ----
  const NAT_POG = ["Y04009", "Y07001", "Y07002", "Y07003", "Y07010", "Y10001"];
  const NAT_PAT_ESCOLAR = ["Y15001"];
  const NAT_PREV_VD = ["Y07012"];
  const NAT_OP_RURAL = ["Y07014", "Y15010"];
  const opRow = { colChave: "NUMERO_RAT", colMunicipio: "MUNICIPIO", colData: "DATA_FATO" };
  const naturezaOp = (l) => naturezaRobusta(brutos.Bd_OP.header, l, "CODIGO_NATUREZA_PRINCIPAL");
  processar("Bd_OP", "pog", opRow, (l) => NAT_POG.includes(naturezaOp(l)));
  processar("Bd_OP", "pat_escolar", opRow, (l) => NAT_PAT_ESCOLAR.includes(naturezaOp(l)));
  processar("Bd_OP", "prev_vd", opRow, (l) => NAT_PREV_VD.includes(naturezaOp(l)));
  processar("Bd_OP", "op_rural", opRow, (l) => NAT_OP_RURAL.includes(naturezaOp(l)));

  // ---- Furto Rural: contagem simples de linhas válidas. ----
  processar("Bd_furto_Rural", "furto_rural", { colChave: "NUMERO_REDS", colMunicipio: "MUNICIPIO", colData: "DATA_FATO" });

  // ---- Visibilidade, Saque Seguro, Pol. Cid. Empresa, Pad. Escolar:
  // abas dedicadas (BOS), contagem simples de linhas válidas, sem
  // filtro de natureza — como pedido explicitamente na especificação.
  // RESSALVA (ver manifest.mapeamento.visibilidade): o Guia de
  // Comandantes já publicado no painel (index.html) descreve uma regra
  // mais restrita e antiga pra Visibilidade (natureza A21.000 + a
  // palavra "OPERAÇÃO VISIBILIDADE" no histórico, vindo de Bd_OP) — mas
  // a aba Bd_vis desta planilha é um export BOS dedicado (mesmo formato
  // de Bd_Saq_seguro/Bd_Pad.Esc/Bd_Pol.Cid) sem campo de histórico pra
  // aplicar esse filtro antigo, e a especificação atual pede
  // explicitamente para não filtrar. Seguida a especificação atual, que
  // se autodeclara autoridade sobre os mapeamentos anteriores. ----
  const bosOpts = (colChave, colMunicipio, colData) => ({ colChave, colMunicipio, colData });
  processar("Bd_vis", "visibilidade", bosOpts("REDS", "Municipio", "Data/Hora do Fato"));
  processar("Bd_Saq_seguro", "saque_seguro", bosOpts("REDS", "Municipio", "Data/Hora do Fato"));
  processar("Bd_Pol.Cid", "pol_cid_empresa", bosOpts("REDS", "Municipio", "Data/Hora do Fato"));
  processar("Bd_Pad.Esc", "pad_escolar", bosOpts("REDS", "Municipio", "Data/Hora do Fato"));

  // ---- Rolezinho: Bd_rol é um export bruto de natureza Y01003, que
  // mistura VÁRIAS operações diferentes (confirmado nos dados: contém
  // centenas de linhas "OPERACAO CAVALO DE ACO", "OPERACAO AGUERRIDO",
  // "OPERACAO CARNAVAL 2026" etc. junto com as de Rolezinho). Contar a
  // aba inteira como "Rolezinho" incluiria Cavalo de Aço e outras
  // operações não relacionadas — errado por definição, não só por
  // rigor. RESSALVA (ver manifest.mapeamento.rolezinho): a
  // especificação atual não pede filtro para esta aba, mas os DADOS
  // exigem um pra não conflitar com outro indicador. Reaproveitado o
  // filtro JÁ CONFIRMADO em produção (Guia de Comandantes/DEFS.rolezinho
  // do index.html): NOME_OPERACAO contém "ROLEZINHO" — não é uma regra
  // nova inventada agora. ----
  function rolezinhoValido(l) {
    return (l.NOME_OPERACAO || "").toUpperCase().includes("ROLEZINHO");
  }
  processar("Bd_rol", "rolezinho", { colChave: "NUMERO_RAT", colMunicipio: "MUNICIPIO", colData: "DATA_FATO" }, rolezinhoValido);

  // ---- IDOB: QOP = operações Boemia (Bd_Boemia, RAT). ----
  processar("Bd_Boemia", "idob_qop", { colChave: "NUMERO_RAT", colMunicipio: "MUNICIPIO", colData: "DATA_FATO" });

  // ---- IDOB: V = vítimas de IMV+CVPe+CVPa relacionadas ao universo da
  // Operação Boemia. Verificado: as três abas TÊM um campo confiável de
  // local do fato — DESCRICAO_LOCAL_IMEDIATO — com o valor "BAR /
  // LANCHONETE / RESTAURANTE / SIMILAR". Documentado, listado e usado
  // como pedido. RESSALVA (ver manifest.mapeamento.idob): essa categoria
  // é mais ampla que só "bar/boate" (agrupa também lanchonete/
  // restaurante/similar) — não existe, nesta planilha, uma categoria
  // isolada só para bar/boate. Não inventado nenhum vínculo: é a
  // categoria mais próxima realmente disponível. ----
  const CAMPO_LOCAL_IDOB = "DESCRICAO_LOCAL_IMEDIATO";
  const VALOR_LOCAL_IDOB = "BAR / LANCHONETE / RESTAURANTE / SIMILAR";
  function extrairVitimasIdob() {
    const fontes = [
      { nome: "Bd_MV", campoValorAlvo: "IMV_TOTAL" },
      { nome: "Bd_CVPe", campoValorAlvo: "ICVPE_TOTAL" },
      { nome: "Bd_CVPa", campoValorAlvo: "ICVPA_TOTAL" },
    ];
    const todosEventos = [];
    let linhasLidas = 0, linhasBar = 0, valoresInvalidos = 0, rejeitadas = 0;
    let campoLocalDisponivelEmTodas = true;
    for (const f of fontes) {
      const { header, rows } = brutos[f.nome];
      if (header.indexOf(CAMPO_LOCAL_IDOB) === -1) { campoLocalDisponivelEmTodas = false; continue; }
      const nomeColunaValor = acharColunaCI(header, f.campoValorAlvo);
      linhasLidas += rows.length;
      for (const l of rows) {
        if ((l[CAMPO_LOCAL_IDOB] || "").trim().toUpperCase() !== VALOR_LOCAL_IDOB) continue;
        linhasBar++;
        const chave = (l.NUMERO_REDS || "").trim();
        const dt = chave ? dataRobusta(l, "DATA_FATO") : null;
        if (!chave || !dt) { rejeitadas++; continue; }
        const munKey = municipioRobusto(header, l, "MUNICIPIO");
        if (!CANON_KEYS.has(munKey)) { rejeitadas++; continue; }
        const valor = nomeColunaValor ? parseNumeroBR(l[nomeColunaValor]) : null;
        if (valor === null) { valoresInvalidos++; continue; }
        todosEventos.push({ municipio: munKey, ano: dt.ano, mes: dt.mes, dia: dt.dia, valor });
      }
    }
    return {
      eventos: todosEventos,
      disponivel: campoLocalDisponivelEmTodas,
      stats: { linhasLidas, linhasBar, valoresInvalidos, rejeitadas },
    };
  }
  const idobVit = extrairVitimasIdob();
  const IDOB_CALCULAVEL = idobVit.disponivel;
  if (IDOB_CALCULAVEL) {
    acumularPorDia(estrutura, "idob_vit", idobVit.eventos);
    atualizarUltimoMes(ultimoMes, idobVit.eventos);
  }

  // ---- ITVD: T = REDS de tráfico/uso filtrados pelas 3 naturezas
  // confirmadas em produção (mantido igual à correção anterior). ----
  const NATUREZAS_ITVD = ["I04033", "I04028", "I99000"];
  const headerTrafico = brutos.Bd_trafico.header;
  let itvdNaturezaVazia = 0, itvdNaturezaForaDoEscopo = 0, itvdNaturezaAceita = 0;
  const naturezasExcluidasVistas = new Set();
  function naturezaTraficoValida(l) {
    const codigo = naturezaRobusta(headerTrafico, l, "CODIGO_NATUREZA_PRINCIPAL");
    if (!codigo || !pareceCodigoNatureza(codigo)) { itvdNaturezaVazia++; return false; }
    if (!NATUREZAS_ITVD.includes(codigo)) {
      itvdNaturezaForaDoEscopo++;
      naturezasExcluidasVistas.add(codigo);
      return false;
    }
    itvdNaturezaAceita++;
    return true;
  }
  processar("Bd_trafico", "itvd_trafico", { colChave: "NUMERO_REDS", colMunicipio: "MUNICIPIO", colData: "DATA_FATO" }, naturezaTraficoValida);

  // ---- ITVD: V = REDS distintos (não vítimas) de IMV+CVPe+CVPa,
  // unidos entre as três abas, sem repetir o mesmo REDS. A
  // especificação pede a leitura pela "coluna AL" dessas abas — mas
  // nesta planilha a coluna AL (índice 37) é CAUSA_PRESUMIDA em todas
  // as três, não um campo de REDS (verificado linha a linha). RESSALVA
  // (ver manifest.mapeamento.itvd): usado o campo NUMERO_REDS (o único
  // identificador de REDS realmente disponível nessas abas), que
  // corresponde à intenção literal do texto ("número do REDS") — a
  // referência à letra AL não foi seguida ao pé da letra porque não
  // aponta pra um campo de REDS nestes dados. Não inventado campo novo:
  // é o único identificador de REDS que existe. ----
  function contarRedsDistintosUniao(fontes) {
    const vistos = new Set();
    const eventos = [];
    let totalLinhas = 0, linhasVaziasIgnoradas = 0, aceitas = 0, duplicadasEntreAbas = 0, rejeitadasSemChaveOuData = 0, rejeitadasMunicipioInvalido = 0;
    for (const nome of fontes) {
      const { header, rows } = brutos[nome];
      const { restantes, linhasVaziasIgnoradas: vazias } = excluirLinhasVazias(rows, { colChave: "NUMERO_REDS", colMunicipio: "MUNICIPIO", colData: "DATA_FATO" });
      totalLinhas += restantes.length;
      linhasVaziasIgnoradas += vazias;
      for (const l of restantes) {
        const chave = (l.NUMERO_REDS || "").trim();
        if (!chave) { rejeitadasSemChaveOuData++; continue; }
        if (vistos.has(chave)) { duplicadasEntreAbas++; continue; }
        const dt = dataRobusta(l, "DATA_FATO");
        if (!dt) { rejeitadasSemChaveOuData++; continue; }
        const munKey = municipioRobusto(header, l, "MUNICIPIO");
        if (!CANON_KEYS.has(munKey)) { rejeitadasMunicipioInvalido++; continue; }
        vistos.add(chave);
        eventos.push({ municipio: munKey, ano: dt.ano, mes: dt.mes, dia: dt.dia });
        aceitas++;
      }
    }
    return { eventos, stats: { totalLinhas, linhasVaziasIgnoradas, aceitas, duplicadasEntreAbas, rejeitadasSemChaveOuData, rejeitadasMunicipioInvalido } };
  }
  const itvdVitUniao = contarRedsDistintosUniao(["Bd_MV", "Bd_CVPe", "Bd_CVPa"]);
  acumularPorDia(estrutura, "itvd_vit", itvdVitUniao.eventos);
  atualizarUltimoMes(ultimoMes, itvdVitUniao.eventos);

  // ------------------------------------------------------------
  // Metas: lê Metas26 por LETRA de coluna (posição), não por nome de
  // cabeçalho — exatamente como pedido. Registra letra + cabeçalho
  // encontrado em cada posição pra conferência (nunca desloca sem
  // avisar). IDOB e ITVD não têm meta na planilha — nunca inferidas.
  // ------------------------------------------------------------
  const metas = {};
  let metasProcessadas = 0, metasRejeitadas = 0;
  const metas26Colunas = {};
  for (const [letra, indicador] of Object.entries(COLUNAS_METAS_LETRA)) {
    const idx = colLetraParaIndice(letra);
    metas26Colunas[letra] = { indicador, indice: idx, cabecalhoEncontrado: brutos.Metas26.header[idx] ?? null };
  }
  for (const l of brutos.Metas26.rows) {
    const municipio = normKey(l.MUNICIPIO);
    if (!CANON_KEYS.has(municipio)) { metasRejeitadas++; continue; }
    const mesNome = (l.Mes || "").toLowerCase().trim();
    const mes = MESES_PT[mesNome] || Number(l["N.Mes"]) || null;
    const ano = Number(l.Ano);
    if (!mes || !ano) { metasRejeitadas++; continue; }
    for (const [letra, indicador] of Object.entries(COLUNAS_METAS_LETRA)) {
      const idx = colLetraParaIndice(letra);
      const valorTexto = l.__raw[idx];
      if (valorTexto === undefined || valorTexto === "") continue;
      const valor = parseNumeroBR(valorTexto);
      if (valor === null) continue;
      if (!metas[indicador]) metas[indicador] = {};
      if (!metas[indicador][municipio]) metas[indicador][municipio] = {};
      if (!metas[indicador][municipio][ano]) metas[indicador][municipio][ano] = {};
      metas[indicador][municipio][ano][mes] = valor;
      metasProcessadas++;
    }
  }

  // ------------------------------------------------------------
  // IDOB / ITVD: guarda os componentes brutos — o cálculo da fórmula
  // fica no cliente (home-nova.js), reaproveitando a mesma função nos
  // dois lugares (TOTAL e por cidade), nunca uma reimplementação
  // paralela.
  // ------------------------------------------------------------
  const componentes = {
    idob_qop: estrutura.idob_qop || {},
    idob_vit: estrutura.idob_vit || {},
    itvd_trafico: estrutura.itvd_trafico || {},
    itvd_vit: estrutura.itvd_vit || {},
  };
  delete estrutura.idob_qop; delete estrutura.idob_vit;
  delete estrutura.itvd_trafico; delete estrutura.itvd_vit;

  // ------------------------------------------------------------
  // Último mês com dado real POR INDICADOR — usado pela Home pra
  // distinguir "resultado zero de verdade" de "dado desatualizado".
  // ------------------------------------------------------------
  function ultimoMesDe(porMun) {
    let ultimo = null;
    for (const anos of Object.values(porMun)) {
      for (const [anoStr, meses] of Object.entries(anos)) {
        const ano = Number(anoStr);
        for (const mesStr of Object.keys(meses)) {
          const mes = Number(mesStr);
          if (!ultimo || ano > ultimo.ano || (ano === ultimo.ano && mes > ultimo.mes)) ultimo = { ano, mes };
        }
      }
    }
    return ultimo;
  }
  function primeiroMesDe(porMun) {
    let primeiro = null;
    for (const anos of Object.values(porMun)) {
      for (const [anoStr, meses] of Object.entries(anos)) {
        const ano = Number(anoStr);
        for (const mesStr of Object.keys(meses)) {
          const mes = Number(mesStr);
          if (!primeiro || ano < primeiro.ano || (ano === primeiro.ano && mes < primeiro.mes)) primeiro = { ano, mes };
        }
      }
    }
    return primeiro;
  }
  function maisAntigo(a, b) { if (!a) return b; if (!b) return a; return (a.ano < b.ano || (a.ano === b.ano && a.mes <= b.mes)) ? a : b; }
  function maisRecente(a, b) { if (!a) return b; if (!b) return a; return (a.ano > b.ano || (a.ano === b.ano && a.mes >= b.mes)) ? a : b; }
  function cidadesDe(porMun) { return Object.keys(porMun).filter((k) => CANON_KEYS.has(k)); }

  const ultimoMesPorIndicador = {};
  for (const [indicador, porMun] of Object.entries(estrutura)) {
    ultimoMesPorIndicador[indicador] = ultimoMesDe(porMun);
  }
  ultimoMesPorIndicador.idob = IDOB_CALCULAVEL ? maisRecente(ultimoMesDe(componentes.idob_qop), ultimoMesDe(componentes.idob_vit)) : null;
  ultimoMesPorIndicador.itvd = maisRecente(ultimoMesDe(componentes.itvd_trafico), ultimoMesDe(componentes.itvd_vit));

  // ------------------------------------------------------------
  // Validações obrigatórias — travam aqui se algo estiver errado em vez
  // de deixar a Home mostrar número furado.
  // ------------------------------------------------------------
  const erros = [];
  if (MUNICIPIOS_CANON.length !== 13) erros.push(`MUNICIPIOS_CANON tem ${MUNICIPIOS_CANON.length}, deveria ter 13.`);
  if (new Set(MUNICIPIOS_CANON.map(normKey)).size !== 13) erros.push("Há cidade duplicada em MUNICIPIOS_CANON.");
  if (erros.length) {
    console.error("ERROS DE VALIDAÇÃO — abortando geração:");
    erros.forEach((e) => console.error("  - " + e));
    process.exit(1);
  }

  // ------------------------------------------------------------
  // Qualidade e cobertura por indicador: 13 cidades esperadas, cidades
  // encontradas/ausentes, registros lidos/aceitos/rejeitados, período
  // inicial/final, status do mapeamento, calculável/motivo.
  // ------------------------------------------------------------
  function statsAgregados(...statsList) {
    const ag = { registrosLidos: 0, registrosAceitos: 0, registrosRejeitados: 0 };
    for (const s of statsList) {
      if (!s) continue;
      const invalidos = s.valoresInvalidos || 0;
      const rejeitados = (s.rejeitadasSemChave || 0) + (s.rejeitadasSemData || 0) + (s.rejeitadasMunicipioInvalido || 0) + (s.duplicadas || 0) + invalidos;
      ag.registrosLidos += s.total || 0;
      ag.registrosRejeitados += rejeitados;
      ag.registrosAceitos += (s.total || 0) - rejeitados;
    }
    return ag;
  }
  // ------------------------------------------------------------
  // CORREÇÃO 2026-09 (item 1 — "zero comprovado" vs. "sem dados"): a
  // simples ausência de uma linha da cidade num indicador de eventos NÃO
  // significa ausência de dado — pode ser, e na maioria das vezes é, um
  // resultado operacional zero de verdade (a fonte cobre o período, essa
  // cidade só não teve ocorrência daquele tipo). Só é "sem dados" quando
  // a própria aba não declara as colunas estruturais necessárias
  // (colunasReconhecidas=false) — nesse caso não dá pra confiar em nada
  // que a aba diz sobre essa cidade/período, incluindo um "zero".
  // "resultadoZeroComprovado" lista as cidades que TÊM cobertura
  // confirmada mas nenhuma ocorrência — exatamente as que a Home agora
  // mostra como resultado 0, nunca "sem dados".
  // ------------------------------------------------------------
  const cobertura = {};
  function registrarCobertura(indicador, { porMun, statsList, fontes, mapeamentoStatus, dadoCalculavel, motivoIndisponibilidade, extra }) {
    const cidadesEncontradas = cidadesDe(porMun);
    const cidadesAusentes = MUNICIPIOS_CANON.filter((c) => !cidadesEncontradas.includes(normKey(c)));
    const statsPrincipais = statsList[0] || {};
    const colunasReconhecidas = statsPrincipais.colunasReconhecidas !== false; // undefined (blocos sem essa checagem, ex.: extra manuais) trata como reconhecida
    const totalLido = statsList.reduce((s, st) => s + (st?.total || 0), 0);
    const totalRejeitado = statsAgregados(...statsList).registrosRejeitados;
    const taxaRejeicao = totalLido > 0 ? totalRejeitado / totalLido : 0;
    const coberturaParcial = !colunasReconhecidas || taxaRejeicao > 0.15; // limiar documentado: >15% das linhas lidas rejeitadas por erro estrutural
    const coberturaTemporalInicio = (statsPrincipais.aba && statsPrincipais.opts)
      ? primeiroMesAba(statsPrincipais.aba, statsPrincipais.opts)
      : primeiroMesDe(porMun);
    cobertura[indicador] = {
      fontes,
      cidadesEsperadas: 13,
      cidadesEncontradas: cidadesEncontradas.length,
      cidadesAusentes,
      ...statsAgregados(...statsList),
      periodoInicial: primeiroMesDe(porMun),
      periodoFinal: ultimoMesDe(porMun),
      mapeamento: mapeamentoStatus,
      dadoCalculavel,
      motivoIndisponibilidade: motivoIndisponibilidade || null,
      // ---- campos novos da correção de 2026-09 (zero vs. sem dados) ----
      fonteCarregada: true, // a geração inteira aborta se alguma aba falhar ao baixar — nunca chega aqui com aba não carregada
      coberturaTemporalInicio,
      coberturaTemporalFim: ultimoMesDe(porMun),
      municipioEsperado: MUNICIPIOS_CANON,
      municipioComOcorrencia: cidadesEncontradas,
      resultadoZeroComprovado: colunasReconhecidas ? cidadesAusentes : [],
      coberturaParcial,
      motivoSemDados: colunasReconhecidas ? null : `Colunas estruturais (chave/município/data) não reconhecidas no cabeçalho da aba ${statsPrincipais.aba || "?"} nesta geração — não é possível distinguir resultado zero de ausência de dado.`,
      ...(extra || {}),
    };
  }
  registrarCobertura("imv", { porMun: estrutura.imv, statsList: [statsPorIndicador.imv], fontes: ["Bd_MV (soma de IMV_TOTAL)"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("cvpe", { porMun: estrutura.cvpe, statsList: [statsPorIndicador.cvpe], fontes: ["Bd_CVPe (soma de ICVPE_TOTAL)"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("cvpa", { porMun: estrutura.cvpa, statsList: [statsPorIndicador.cvpa], fontes: ["Bd_CVPa (soma de ICVPA_TOTAL)"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("pog", { porMun: estrutura.pog, statsList: [statsPorIndicador.pog], fontes: ["Bd_OP"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("furto_rural", { porMun: estrutura.furto_rural, statsList: [statsPorIndicador.furto_rural], fontes: ["Bd_furto_Rural"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("pat_escolar", { porMun: estrutura.pat_escolar, statsList: [statsPorIndicador.pat_escolar], fontes: ["Bd_OP"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("prev_vd", { porMun: estrutura.prev_vd, statsList: [statsPorIndicador.prev_vd], fontes: ["Bd_OP"], mapeamentoStatus: "confirmado", dadoCalculavel: true, extra: { observacao: "Não confundir com a página completa de Violência Doméstica do painel — este é só o indicador operacional Y07012." } });
  registrarCobertura("op_rural", { porMun: estrutura.op_rural, statsList: [statsPorIndicador.op_rural], fontes: ["Bd_OP"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("visibilidade", {
    porMun: estrutura.visibilidade, statsList: [statsPorIndicador.visibilidade], fontes: ["Bd_vis"], mapeamentoStatus: "confirmado, com ressalva", dadoCalculavel: true,
    extra: { observacao: "O Guia de Comandantes já publicado no painel descreve uma regra mais antiga e restrita (natureza A21.000 + \"OPERAÇÃO VISIBILIDADE\" no histórico, via Bd_OP). A especificação atual pede para usar Bd_vis (export BOS dedicado) sem esse filtro adicional — seguida a especificação atual, que se declara autoridade sobre mapeamentos anteriores. Bd_vis não tem campo de histórico para aplicar a regra antiga mesmo se quiséssemos." },
  });
  registrarCobertura("saque_seguro", { porMun: estrutura.saque_seguro, statsList: [statsPorIndicador.saque_seguro], fontes: ["Bd_Saq_seguro"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("pol_cid_empresa", { porMun: estrutura.pol_cid_empresa, statsList: [statsPorIndicador.pol_cid_empresa], fontes: ["Bd_Pol.Cid"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("pad_escolar", { porMun: estrutura.pad_escolar, statsList: [statsPorIndicador.pad_escolar], fontes: ["Bd_Pad.Esc"], mapeamentoStatus: "confirmado", dadoCalculavel: true });
  registrarCobertura("rolezinho", {
    porMun: estrutura.rolezinho, statsList: [statsPorIndicador.rolezinho], fontes: ["Bd_rol (filtrado por NOME_OPERACAO contém \"ROLEZINHO\")"], mapeamentoStatus: "confirmado, com ressalva", dadoCalculavel: true,
    extra: { observacao: "Bd_rol mistura várias operações diferentes sob a mesma natureza Y01003 (Cavalo de Aço, Aguerrido, Carnaval, Batida Policial etc. — confirmado nos dados). Contar a aba inteira incluiria Cavalo de Aço e outras operações não relacionadas. Aplicado o filtro NOME_OPERACAO contém \"ROLEZINHO\", já confirmado em produção (Guia de Comandantes) — não é uma regra nova inventada, mas diverge da especificação atual, que não pedia filtro para esta aba." },
  });

  // IDOB — CORREÇÃO 2026-09 (item 2 do pedido corretivo): a categoria
  // DESCRICAO_LOCAL_IMEDIATO="BAR / LANCHONETE / RESTAURANTE / SIMILAR"
  // ainda não foi validada oficialmente como equivalente a "bar/boate" —
  // por isso o resultado é sempre PROVISÓRIO (statusQualidade), mesmo
  // quando calculável. A Home nunca trata esse número como definitivo:
  // sem cor de desempenho, sem cumprimento, sem variação (já garantido
  // por não ter meta), com selo "A validar".
  {
    const idobStats = statsAgregados({ total: idobVit.stats.linhasBar, rejeitadasSemChave: 0, rejeitadasSemData: idobVit.stats.rejeitadas, rejeitadasMunicipioInvalido: 0, duplicadas: 0, valoresInvalidos: idobVit.stats.valoresInvalidos });
    const cidadesEncontradasIdob = cidadesDe(componentes.idob_qop);
    const cidadesAusentesIdob = MUNICIPIOS_CANON.filter((c) => !cidadesEncontradasIdob.includes(normKey(c)));
    const idobColunasReconhecidas = statsPorIndicador.idob_qop?.colunasReconhecidas !== false;
    cobertura.idob = {
      fontes: ["Bd_Boemia (qop)", IDOB_CALCULAVEL ? `Bd_MV+Bd_CVPe+Bd_CVPa filtrados por ${CAMPO_LOCAL_IDOB}="${VALOR_LOCAL_IDOB}" (vítimas)` : "vítimas indisponíveis"],
      cidadesEsperadas: 13,
      cidadesEncontradas: cidadesEncontradasIdob.length,
      cidadesAusentes: cidadesAusentesIdob,
      registrosLidos: (statsPorIndicador.idob_qop?.total || 0) + idobVit.stats.linhasLidas,
      registrosAceitos: idobStats.registrosAceitos,
      registrosRejeitados: idobStats.registrosRejeitados,
      periodoInicial: maisAntigo(primeiroMesDe(componentes.idob_qop), IDOB_CALCULAVEL ? primeiroMesDe(componentes.idob_vit) : null),
      periodoFinal: ultimoMesPorIndicador.idob,
      mapeamento: IDOB_CALCULAVEL ? "confirmado, com ressalva de categoria — PROVISÓRIO" : "indisponível",
      dadoCalculavel: IDOB_CALCULAVEL,
      motivoIndisponibilidade: IDOB_CALCULAVEL ? null : "Campo DESCRICAO_LOCAL_IMEDIATO ausente em uma ou mais das abas Bd_MV/Bd_CVPe/Bd_CVPa nesta geração.",
      qopDisponivel: cidadesEncontradasIdob.length > 0,
      vitimasBarBoateDisponiveis: IDOB_CALCULAVEL,
      idobCalculavel: IDOB_CALCULAVEL,
      coberturaMunicipios: cidadesEncontradasIdob,
      campoLocalUsado: CAMPO_LOCAL_IDOB,
      valorLocalUsado: VALOR_LOCAL_IDOB,
      // ---- campos novos (zero vs. sem dados) ----
      fonteCarregada: true,
      coberturaTemporalInicio: statsPorIndicador.idob_qop ? primeiroMesAba(statsPorIndicador.idob_qop.aba, statsPorIndicador.idob_qop.opts) : null,
      coberturaTemporalFim: ultimoMesPorIndicador.idob,
      municipioEsperado: MUNICIPIOS_CANON,
      municipioComOcorrencia: cidadesEncontradasIdob,
      resultadoZeroComprovado: (IDOB_CALCULAVEL && idobColunasReconhecidas) ? cidadesAusentesIdob : [],
      coberturaParcial: !idobColunasReconhecidas,
      motivoSemDados: idobColunasReconhecidas ? null : "Colunas estruturais não reconhecidas em Bd_Boemia nesta geração.",
      // ---- campos novos (IDOB provisório — item 2 do pedido corretivo) ----
      statusQualidade: IDOB_CALCULAVEL ? "provisorio" : "indisponivel",
      pendenteValidacaoOficial: true,
      categoriaUtilizada: VALOR_LOCAL_IDOB,
      textoProvisorio: "Cálculo provisório: vítimas filtradas pela categoria BAR / LANCHONETE / RESTAURANTE / SIMILAR. A categoria inclui estabelecimentos além de bar/boate.",
    };
  }

  // ITVD
  {
    const cidadesTrafico = cidadesDe(componentes.itvd_trafico);
    const cidadesVit = cidadesDe(componentes.itvd_vit);
    const cidadesEncontradas = [...new Set([...cidadesTrafico, ...cidadesVit])];
    const cidadesAusentesItvd = MUNICIPIOS_CANON.filter((c) => !cidadesEncontradas.includes(normKey(c)));
    const itvdStatsAg = statsAgregados(statsPorIndicador.itvd_trafico, { total: itvdVitUniao.stats.totalLinhas, rejeitadasSemChave: itvdVitUniao.stats.rejeitadasSemChaveOuData, rejeitadasSemData: 0, rejeitadasMunicipioInvalido: itvdVitUniao.stats.rejeitadasMunicipioInvalido, duplicadas: itvdVitUniao.stats.duplicadasEntreAbas });
    const itvdColunasReconhecidas = statsPorIndicador.itvd_trafico?.colunasReconhecidas !== false;
    cobertura.itvd = {
      fontes: ["Bd_trafico (filtrado por natureza I04033/I04028/I99000)", "Bd_MV+Bd_CVPe+Bd_CVPa (REDS distintos, união, campo NUMERO_REDS)"],
      cidadesEsperadas: 13,
      cidadesEncontradas: cidadesEncontradas.length,
      cidadesAusentes: cidadesAusentesItvd,
      ...itvdStatsAg,
      filtroNatureza: {
        codigosAceitos: NATUREZAS_ITVD,
        linhasAceitas: itvdNaturezaAceita,
        linhasForaDoEscopo: itvdNaturezaForaDoEscopo,
        linhasSemNaturezaReconhecivel: itvdNaturezaVazia,
        naturezasExcluidasEncontradas: [...naturezasExcluidasVistas],
      },
      periodoInicial: maisAntigo(primeiroMesDe(componentes.itvd_trafico), primeiroMesDe(componentes.itvd_vit)),
      periodoFinal: ultimoMesPorIndicador.itvd,
      mapeamento: "confirmado, com ressalva de coluna (ver mapeamento.itvd.observacao)",
      dadoCalculavel: true,
      motivoIndisponibilidade: null,
      // ---- campos novos (zero vs. sem dados / T=0 "sem base para cálculo") ----
      fonteCarregada: true,
      coberturaTemporalInicio: statsPorIndicador.itvd_trafico ? primeiroMesAba(statsPorIndicador.itvd_trafico.aba, statsPorIndicador.itvd_trafico.opts) : null,
      coberturaTemporalFim: ultimoMesPorIndicador.itvd,
      municipioEsperado: MUNICIPIOS_CANON,
      municipioComOcorrencia: cidadesEncontradas,
      resultadoZeroComprovado: itvdColunasReconhecidas ? cidadesAusentesItvd : [],
      coberturaParcial: !itvdColunasReconhecidas || (itvdStatsAg.registrosLidos > 0 && itvdStatsAg.registrosRejeitados / itvdStatsAg.registrosLidos > 0.15),
      motivoSemDados: itvdColunasReconhecidas ? null : "Colunas estruturais não reconhecidas em Bd_trafico nesta geração.",
      textoSemBase: "O ITVD não é calculado quando não existem REDS de tráfico/uso no período, pois o denominador da fórmula é zero.",
    };
  }

  // ------------------------------------------------------------
  // Detecção de anomalia: compara com a geração anterior, se existir,
  // ANTES de sobrescrever o arquivo.
  // ------------------------------------------------------------
  const outPath = path.join(__dirname, "..", "home-dados.json");
  let anteriorSaida = null;
  try {
    anteriorSaida = JSON.parse(fs.readFileSync(outPath, "utf8"));
  } catch {
    anteriorSaida = null;
  }
  const cabecalhosAtuais = Object.fromEntries(Object.entries(brutos).map(([nome, b]) => [nome, b.header]));
  // O JSON publicado registra apenas uma assinatura dos cabeçalhos. Isso
  // permite detectar mudanças estruturais sem expor o endereço da fonte,
  // gids ou o esquema completo da planilha no site público.
  const cabecalhosAssinaturas = Object.fromEntries(
    Object.entries(cabecalhosAtuais).map(([nome, header]) => [
      nome,
      createHash("sha256").update(JSON.stringify(header)).digest("hex"),
    ])
  );
  function detectarAnomalias(anterior) {
    const alertas = [];
    if (!anterior || !anterior.manifest) return alertas;
    const mAnt = anterior.manifest;
    for (const [ind, cfg] of Object.entries(cobertura)) {
      const antCfg = mAnt.cobertura?.[ind];
      if (!antCfg) continue;
      if (antCfg.cidadesEncontradas > 0 && cfg.cidadesEncontradas === 0) {
        alertas.push(`"${ind}": perdeu toda a cobertura municipal (tinha ${antCfg.cidadesEncontradas} cidades, agora 0).`);
      } else if (cfg.cidadesEncontradas < antCfg.cidadesEncontradas) {
        alertas.push(`"${ind}": cobertura municipal caiu de ${antCfg.cidadesEncontradas} para ${cfg.cidadesEncontradas} cidades.`);
      }
      if (antCfg.registrosAceitos > 0 && cfg.registrosAceitos === 0) {
        alertas.push(`"${ind}": ficou sem nenhum registro aceito (antes: ${antCfg.registrosAceitos}).`);
      } else if (antCfg.registrosAceitos > 0) {
        const variacao = (cfg.registrosAceitos - antCfg.registrosAceitos) / antCfg.registrosAceitos;
        if (Math.abs(variacao) > 0.5) {
          alertas.push(`"${ind}": registros aceitos variaram ${(variacao * 100).toFixed(0)}% frente à geração anterior (${antCfg.registrosAceitos} -> ${cfg.registrosAceitos}).`);
        }
      }
    }
    for (const [aba, assinaturaNova] of Object.entries(cabecalhosAssinaturas)) {
      const assinaturaAnt = mAnt.fonte?.cabecalhosAssinaturas?.[aba];
      if (assinaturaAnt && assinaturaAnt !== assinaturaNova) {
        alertas.push(`Cabeçalho da aba "${aba}" mudou em relação à geração anterior — reconferir mapeamento de colunas antes de confiar nos números.`);
      }
    }
    if (naturezasExcluidasVistas.size) {
      alertas.push(`Bd_trafico teve ${itvdNaturezaForaDoEscopo} linha(s) com natureza fora do escopo do ITVD (${[...naturezasExcluidasVistas].join(", ")}) — excluídas corretamente do cálculo.`);
    }
    return alertas;
  }
  const alertasAnomalia = detectarAnomalias(anteriorSaida);

  const manifest = {
    geradoEm: new Date().toISOString(),
    fonte: {
      descricao: "Base interna GDO 2026",
      cabecalhosAssinaturas,
    },
    ultimoMesComDadosGlobal: ultimoMes,
    ultimoMesPorIndicador,
    municipiosCanon: MUNICIPIOS_CANON,
    metas26Colunas,
    mapeamento: {
      imv: { abas: ["Bd_MV"], status: "confirmado", regra: "Soma de IMV_TOTAL (vítimas) por REDS único, filtrado por período." },
      cvpe: { abas: ["Bd_CVPe"], status: "confirmado", regra: "Soma de ICVPE_TOTAL (vítimas) por REDS único, filtrado por período." },
      cvpa: { abas: ["Bd_CVPa"], status: "confirmado", regra: "Soma de ICVPA_TOTAL (vítimas) por REDS único, filtrado por período." },
      pog: { abas: ["Bd_OP"], status: "confirmado", regra: "RAT com CODIGO_NATUREZA_PRINCIPAL em " + JSON.stringify(NAT_POG) + "." },
      furto_rural: { abas: ["Bd_furto_Rural"], status: "confirmado", regra: "Contagem de REDS únicos." },
      pat_escolar: { abas: ["Bd_OP"], status: "confirmado", regra: "RAT com natureza Y15001." },
      prev_vd: { abas: ["Bd_OP"], status: "confirmado", regra: "RAT com natureza Y07012." },
      op_rural: { abas: ["Bd_OP"], status: "confirmado", regra: "RAT com natureza em ['Y07014','Y15010']." },
      visibilidade: { abas: ["Bd_vis"], status: "confirmado, com ressalva", regra: "Contagem de REDS únicos, sem filtro de natureza.", observacao: cobertura.visibilidade.observacao },
      saque_seguro: { abas: ["Bd_Saq_seguro"], status: "confirmado", regra: "Contagem de REDS únicos (aba renomeada de Bd_a21007 — mesmo gid/dado)." },
      pol_cid_empresa: { abas: ["Bd_Pol.Cid"], status: "confirmado", regra: "Contagem de REDS únicos." },
      pad_escolar: { abas: ["Bd_Pad.Esc"], status: "confirmado", regra: "Contagem de REDS únicos (aba renomeada de Bd_PadEsc — mesmo gid/dado)." },
      rolezinho: { abas: ["Bd_rol"], status: "confirmado, com ressalva", regra: "RAT com natureza Y01003 E NOME_OPERACAO contém \"ROLEZINHO\".", observacao: cobertura.rolezinho.observacao },
      idob: {
        abas: ["Bd_Boemia", "Bd_MV", "Bd_CVPe", "Bd_CVPa"],
        status: IDOB_CALCULAVEL ? "confirmado, com ressalva de categoria — PROVISÓRIO" : "indisponível",
        statusQualidade: IDOB_CALCULAVEL ? "provisorio" : "indisponivel",
        pendenteValidacaoOficial: true,
        regra: "IDOB = ((QOP − V×10) ÷ QOP) × 100. QOP = RAT únicos em Bd_Boemia. V = soma de IMV_TOTAL+ICVPE_TOTAL+ICVPA_TOTAL das linhas com DESCRICAO_LOCAL_IMEDIATO = \"BAR / LANCHONETE / RESTAURANTE / SIMILAR\".",
        observacao: "Verificado em 2026-09: as abas Bd_MV/Bd_CVPe/Bd_CVPa têm o campo DESCRICAO_LOCAL_IMEDIATO, com a categoria \"BAR / LANCHONETE / RESTAURANTE / SIMILAR\" — a única disponível que contém \"BAR\". RESSALVA: essa categoria é mais ampla que só bar/boate (agrupa também lanchonete/restaurante/similar) — não existe, nesta planilha, uma categoria isolada só para bar/boate. Usada por ser a aproximação documentada mais próxima realmente disponível, não uma invenção de vínculo. Sem meta oficial confirmada na Metas26 — Home mostra \"Meta não informada\", nunca calcula variação contra meta. CORREÇÃO 2026-09: até validação oficial de que essa categoria equivale a \"bar/boate\", o resultado é tratado como PROVISÓRIO na Home — sem cor de desempenho, com selo \"A validar\".",
      },
      itvd: {
        abas: ["Bd_trafico", "Bd_MV", "Bd_CVPe", "Bd_CVPa"],
        status: "confirmado, com ressalva de coluna",
        regra: "ITVD = ((T − V×2) ÷ T) × 100. T = REDS distintos em Bd_trafico com natureza I04033/I04028/I99000. V = REDS distintos (NUMERO_REDS) da união de Bd_MV+Bd_CVPe+Bd_CVPa, sem repetir REDS entre abas.",
        observacao: "A especificação pede ler o REDS pela \"coluna AL\" de Bd_MV/Bd_CVPe/Bd_CVPa — verificado que, nesta planilha, a coluna AL (índice 37) é CAUSA_PRESUMIDA nas três abas, não um campo de REDS. Usado o campo NUMERO_REDS (único identificador de REDS disponível nessas abas), que corresponde à intenção literal do texto (\"número do REDS\"). Sem meta oficial confirmada na Metas26 — Home mostra \"Meta não informada\", nunca calcula variação contra meta. CORREÇÃO 2026-09: quando T=0 (sem REDS de tráfico/uso no período), a fórmula tem denominador zero — Home e página de detalhamento (renderITVDPage) foram padronizadas para mostrar \"Sem base para cálculo\" nesse caso, nunca mais 0%/100% inventado.",
      },
    },
    metasSemColuna: ["idob", "itvd"],
    linhasRejeitadas: statsRejeicao,
    metasRejeitadas,
    metasProcessadas,
    cobertura,
    alertasAnomalia,
  };

  // ------------------------------------------------------------
  // Escrita segura: grava num arquivo temporário, valida a estrutura
  // mínima e só então substitui o home-dados.json anterior.
  // ------------------------------------------------------------
  const saida = { manifest, dados: estrutura, componentes, metas };
  const jsonTexto = JSON.stringify(saida);

  const validacoes = [];
  let parsed;
  try {
    parsed = JSON.parse(jsonTexto);
  } catch (e) {
    validacoes.push(`JSON gerado é inválido: ${e.message}`);
  }
  if (parsed) {
    if (!parsed.dados || typeof parsed.dados !== "object") validacoes.push("Estrutura 'dados' ausente.");
    if (!parsed.manifest || !parsed.manifest.cobertura) validacoes.push("Estrutura 'manifest.cobertura' ausente.");
    const algumaCidadeReconhecida = Object.values(parsed.dados || {}).some((porMun) => Object.keys(porMun || {}).some((k) => CANON_KEYS.has(k)));
    if (!algumaCidadeReconhecida) validacoes.push("Nenhuma cidade das 13 do 70º BPM foi reconhecida em nenhum indicador.");
    const algumResultado = Object.values(parsed.dados || {}).some((porMun) => Object.values(porMun || {}).some((anos) => Object.values(anos || {}).some((meses) => Object.values(meses || {}).some((arr) => Array.isArray(arr) && arr.some((v) => v > 0)))));
    if (!algumResultado) validacoes.push("Todos os resultados vieram vazios/zerados em todos os indicadores — geração suspeita.");
    const NUM_INDICADORES_ESPERADOS = 13; // 13 na matriz `estrutura` (IDOB/ITVD ficam em `componentes`)
    if (Object.keys(parsed.dados).length !== NUM_INDICADORES_ESPERADOS) {
      validacoes.push(`Esperado ${NUM_INDICADORES_ESPERADOS} indicadores em 'dados', encontrado ${Object.keys(parsed.dados).length}.`);
    }
  }

  if (validacoes.length) {
    console.error("VALIDAÇÃO FALHOU — home-dados.json anterior NÃO foi tocado:");
    validacoes.forEach((v) => console.error("  - " + v));
    process.exit(1);
  }

  const tmpPath = outPath + ".tmp";
  fs.writeFileSync(tmpPath, jsonTexto);
  fs.renameSync(tmpPath, outPath);
  console.log(`\nGravado ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
  console.log(`Último mês com dados (global): ${ultimoMes.mes}/${ultimoMes.ano}`);
  console.log(`Metas processadas: ${metasProcessadas}, rejeitadas: ${metasRejeitadas}`);
  console.log(`IDOB calculável: ${IDOB_CALCULAVEL} (linhas bar/boate encontradas: ${idobVit.stats.linhasBar})`);
  console.log(`ITVD — natureza aceita: ${itvdNaturezaAceita}, fora de escopo: ${itvdNaturezaForaDoEscopo} (${[...naturezasExcluidasVistas].join(", ") || "nenhuma"})`);
  console.log(`ITVD — REDS distintos união (V): ${itvdVitUniao.stats.aceitas} aceitos, ${itvdVitUniao.stats.duplicadasEntreAbas} duplicados entre abas`);
  console.log(`Rolezinho: ${statsPorIndicador.rolezinho?.total || 0} linhas em Bd_rol, filtro NOME_OPERACAO aplicado.`);
  if (alertasAnomalia.length) {
    console.log(`\nALERTAS DE ANOMALIA (${alertasAnomalia.length}) comparando com a geração anterior:`);
    alertasAnomalia.forEach((a) => console.log("  - " + a));
  } else if (anteriorSaida) {
    console.log("\nSem anomalias detectadas em relação à geração anterior.");
  }
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
