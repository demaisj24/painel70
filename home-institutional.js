function institutionalMetric(label, value, meta, status, tone='neutral') {
  const metaText = meta === null ? 'Resultado acumulado' : `Meta acumulada: ${meta}`;
  const toneClass = tone === 'good' ? 'is-good' : (tone === 'alert' ? 'is-alert' : (tone === 'watch' ? 'is-watch' : ''));
  return `<div class="home-metric ${toneClass}">
    <div class="home-metric-label">${label}</div>
    <div class="home-metric-value">${value}</div>
    <div class="home-metric-meta">${metaText}</div>
    <div class="home-metric-status">${status}</div>
  </div>`;
}

function renderHomeInstitutional() {
  const miMv=DATA.mv.total_acum.length-1, miCvpe=DATA.cvpe.total_acum.length-1, miCvpa=DATA.cvpa.total_acum.length-1;
  const miFurto=DATA.furto.total_acum.length-1, miArmas=DATA.armas.total_acum.length-1;
  const miPog=DATA.pog.total_acum.length-1, miIdob=DATA.idob.total_qtdeop_acum.length-1;
  const miSaque=DATA.saque_seguro.total_acum.length-1;
  const mvAcum=DATA.mv.total_acum[miMv], mvMeta=DATA.mv.total_meta_acum[miMv];
  const cvpeAcum=DATA.cvpe.total_acum[miCvpe], cvpeMeta=DATA.cvpe.total_meta_acum[miCvpe];
  const cvpaAcum=DATA.cvpa.total_acum[miCvpa], cvpaMeta=DATA.cvpa.total_meta_acum[miCvpa];
  const furtoAcum=DATA.furto.total_acum[miFurto], furtoMeta=DATA.furto.total_meta_acum[miFurto];
  const armasAcum=DATA.armas.total_acum[miArmas];
  const pogAcum=DATA.pog.total_acum[miPog], pogMeta=DATA.pog.total_meta_acum[miPog];
  const saqueAcum=DATA.saque_seguro.total_acum[miSaque], saqueMeta=DATA.saque_seguro.total_meta_acum[miSaque];
  const idobQop=DATA.idob.total_qtdeop_acum[miIdob];
  const idobVit=DATA.idob.total_mv_acum[miIdob]+DATA.idob.total_cvpe_acum[miIdob]+DATA.idob.total_cvpa_acum[miIdob];
  const idobVal=idobQop ? ((idobQop-idobVit*10)/idobQop*100) : 0;
  const latestMonth=DATA.saque_seguro.meses[DATA.saque_seguro.meses.length-1];
  const tetoStatus=(real,meta)=>real<=meta?['Dentro da meta','good']:['Acima da meta','alert'];
  const pisoStatus=(real,meta)=>real>=meta?['Meta alcançada','good']:['Abaixo da meta','alert'];
  const mvSt=tetoStatus(mvAcum,mvMeta), cvpeSt=tetoStatus(cvpeAcum,cvpeMeta), cvpaSt=tetoStatus(cvpaAcum,cvpaMeta);
  const furtoSt=tetoStatus(furtoAcum,furtoMeta), pogSt=pisoStatus(pogAcum,pogMeta), saqueSt=pisoStatus(saqueAcum,saqueMeta);
  const idobSt=idobVal>=95?['Desempenho adequado','good']:(idobVal>=85?['Faixa de atenção','watch']:['Desempenho crítico','alert']);

  let html=`<div class="home-shell">
    <header class="home-header">
      <div>
        <div class="home-eyebrow">Síntese operacional</div>
        <h1 class="home-heading">Situação dos indicadores do 70º BPM</h1>
        <p class="home-subtitle">Visão consolidada para acompanhamento do comando, identificação de desvios e priorização das ações das frações.</p>
      </div>
      <div class="home-period"><strong>Janeiro a ${latestMonth} de 2026</strong><span>Dados consolidados disponíveis</span></div>
    </header>
    <div class="home-alert" id="apCtaHome" role="button" tabindex="0">
      <div class="home-alert-bar"></div>
      <div><div class="home-alert-title">Análise preditiva e ocorrências prioritárias</div><div class="home-alert-sub">Consulte eventos de maior gravidade, reincidência e prioridades por município.</div></div>
      <div class="home-alert-action">Abrir análise &#8594;</div>
    </div>
    <div class="home-section-head"><h2>Indicadores estratégicos</h2><p>Resultado acumulado comparado à meta vigente</p></div>
    <div class="home-metrics">`;
  html+=institutionalMetric('Mortes violentas',mvAcum,mvMeta,mvSt[0],mvSt[1]);
  html+=institutionalMetric('Crimes violentos contra a pessoa',cvpeAcum,cvpeMeta,cvpeSt[0],cvpeSt[1]);
  html+=institutionalMetric('Crimes violentos contra o patrimônio',cvpaAcum,cvpaMeta,cvpaSt[0],cvpaSt[1]);
  html+=institutionalMetric('Furto em zona rural',furtoAcum,furtoMeta,furtoSt[0],furtoSt[1]);
  html+=institutionalMetric('Policiamento orientado ao ganho',pogAcum,pogMeta,pogSt[0],pogSt[1]);
  html+=institutionalMetric('Armas de fogo apreendidas',armasAcum,null,'Resultado acumulado','neutral');
  html+=institutionalMetric('IDOB',`${idobVal.toFixed(1)}%`,null,idobSt[0],idobSt[1]);
  html+=institutionalMetric('Operação Saque Seguro',saqueAcum,saqueMeta,saqueSt[0],saqueSt[1]);
  html+=`</div>
    <div class="home-note"><b>Nota de atualização:</b> ITVD aguarda confirmação da fonte correta. RC, VCP, VTCV, VT e MRPP permanecem como fotografia de julho/2026. Indicadores sem fonte validada não entram na síntese estratégica.</div>
    <div class="home-section-head"><h2>Desempenho por município</h2><p>Leitura mensal, acumulada e classificação geral</p></div>`;
  html+=renderCumprimentoMatrix('mes');
  html+=renderCumprimentoMatrix('acum');
  html+=renderRankingTable('acum');
  html+='</div>';
  document.getElementById('main').innerHTML=html;

  const openPredictive=()=>{
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    const navBtn=document.querySelector('[data-page="analise_preditiva"]');
    if(navBtn) navBtn.classList.add('active');
    pages.analise_preditiva();
  };
  const cta=document.getElementById('apCtaHome');
  cta.addEventListener('click',openPredictive);
  cta.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPredictive();}});
}

pages.home=renderHomeInstitutional;
if(document.querySelector('.nav-btn.active[data-page="home"]')) renderHomeInstitutional();
