(() => {
  'use strict';
  const D = window.LIGA_DATA || {};
  const seed = Array.isArray(window.LALIGA_MATCH_SEED) ? window.LALIGA_MATCH_SEED : [];
  const teams = D.teams || {};
  let official = {matches:{}};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tname = c => teams[c]?.short || teams[c]?.name || c;
  const seedMap = new Map(seed.map(x => [`${x.home}:${x.away}`, x]));

  function officialFor(matchKey){
    const x = official.matches?.[matchKey];
    return x && x.status === 'finished' && x.homeScore != null && x.awayScore != null ? x : null;
  }
  function resultFor(matchKey){
    const o = officialFor(matchKey); if (o) return {...o, provider:'LALIGA oficial'};
    const [,h,a] = String(matchKey||'').split(':');
    const s = seedMap.get(`${h}:${a}`);
    return s && s.status === 'finished' && s.homeScore != null && s.awayScore != null ? {...s, provider:'resultado verificado'} : null;
  }
  function seedFor(matchKey){
    const [,h,a] = String(matchKey||'').split(':');
    return seedMap.get(`${h}:${a}`) || null;
  }
  function predictionText(card){
    const b = card?.querySelector('.prediction b');
    const text = (b?.textContent || '').trim();
    if (/^1\s+\d+%/i.test(text)) return text;
    return card?.dataset.prediction || '';
  }
  function patchStatusLabels(){
    const auto=document.querySelector('.topbar .btn.dark');if(auto && auto.textContent!=='AUTO · 15 MIN')auto.textContent='AUTO · 15 MIN';
    document.querySelectorAll('.hero-stats div').forEach(x=>{if((x.querySelector('small')?.textContent||'').toLowerCase().includes('actualización')){const b=x.querySelector('b');if(b && b.textContent!=='15m')b.textContent='15m';}});
  }
  function patchCard(card){
    const btn = card.querySelector('.match-open[data-matchkey]'); if(!btn) return;
    const mk = btn.dataset.matchkey, result = resultFor(mk), schedule = seedFor(mk);
    const score = card.querySelector('.match-teams strong');
    const pred = card.querySelector('.prediction');
    const before = predictionText(card);
    if(before) card.dataset.prediction = before;

    if(result){
      if(score && score.textContent!==`${result.homeScore} – ${result.awayScore}`) score.textContent = `${result.homeScore} – ${result.awayScore}`;
      card.classList.add('real-result-card');
      card.querySelector('.result-pending')?.remove();
      let badge = card.querySelector('.real-result-badge');
      if(!badge){ badge=document.createElement('div'); badge.className='real-result-badge'; card.querySelector('.match-teams')?.before(badge); }
      if(badge.textContent!==`✅ RESULTADO REAL · ${result.provider}`)badge.textContent = `✅ RESULTADO REAL · ${result.provider}`;
      if(pred){
        const p = card.dataset.prediction || before;
        pred.classList.add('prediction-small','prediction-only');
        const html=`<small>🔮 Predicción previa del modelo</small><b>${esc(p || 'No disponible')}</b>`;
        if(pred.innerHTML!==html)pred.innerHTML=html;
      }
    } else {
      if(score && score.textContent!=='VS') score.textContent = 'VS';
      card.classList.remove('real-result-card','official-result','is-finished');
      card.querySelector('.real-result-badge')?.remove();
      card.querySelector('.official-match-badge')?.remove();
      if(pred){
        const p = card.dataset.prediction || before;
        pred.classList.add('prediction-small','prediction-only');
        const html=`<small>🔮 Predicción previa · no es un resultado</small><b>${esc(p || 'Pendiente')}</b>`;
        if(pred.innerHTML!==html)pred.innerHTML=html;
      }
      if(schedule?.kickoff && new Date(schedule.kickoff).getTime() < Date.now() - 3*3600e3){
        let wait = card.querySelector('.result-pending');
        if(!wait){ wait=document.createElement('div'); wait.className='result-pending'; card.querySelector('.match-actions')?.before(wait); }
        if(wait.textContent!=='Resultado real pendiente de sincronización')wait.textContent='Resultado real pendiente de sincronización';
      }
    }
  }
  function patchDetail(){
    const root=document.getElementById('detail-content'); if(!root) return;
    const big = root.querySelector('.big-match'); if(!big) return;
    const codes=[...big.querySelectorAll('[data-team]')].map(x=>x.dataset.team);
    if(codes.length!==2) return;
    const mk=Object.keys(official.matches||{}).find(k=>{const [,h,a]=k.split(':');return h===codes[0]&&a===codes[1];}) || (()=>{
      const r=(root.querySelector('.match-detail-hero .eyebrow')?.textContent||'').match(/Jornada\s+(\d+)/i)?.[1];
      return r?`${r}:${codes[0]}:${codes[1]}`:null;
    })();
    if(!mk) return;
    const result=resultFor(mk), score=big.querySelector('strong');
    if(score){const wanted=result?`${result.homeScore} – ${result.awayScore}`:'VS';if(score.textContent!==wanted)score.textContent=wanted;}
    const hero=root.querySelector('.match-detail-hero');
    if(hero && !hero.querySelector('.detail-prediction-note')){
      const prob=hero.querySelector('.probability');
      const note=document.createElement('div'); note.className='detail-prediction-note';
      note.innerHTML='<small>🔮 Predicción previa</small><span>Estimación recreativa del modelo; el marcador superior es el resultado real cuando el partido ha finalizado.</span>';
      prob ? prob.before(note) : hero.querySelector('.hero-actions')?.before(note);
    }
    const eyebrow=hero?.querySelector('.eyebrow');
    if(eyebrow && result){const wanted=`${eyebrow.textContent.replace(/·.*$/,'').trim()} · FINALIZADO · RESULTADO REAL`;if(eyebrow.textContent!==wanted)eyebrow.textContent=wanted;}
  }
  function recentResults(){
    const map=new Map();
    seed.filter(x=>x.status==='finished'&&x.homeScore!=null).forEach(x=>map.set(`${x.home}:${x.away}`,{...x,provider:'resultado verificado'}));
    Object.values(official.matches||{}).filter(x=>x.status==='finished'&&x.homeScore!=null&&x.awayScore!=null).forEach(x=>{
      const old=map.get(`${x.home}:${x.away}`)||{};map.set(`${x.home}:${x.away}`,{...old,...x,provider:'LALIGA oficial'});
    });
    return [...map.values()].sort((a,b)=>new Date(b.kickoff||b.updated||0)-new Date(a.kickoff||a.updated||0)).slice(0,12);
  }
  function renderRecent(){
    const root=document.getElementById('real-results-list'); if(!root) return;
    const played=recentResults();
    const html=played.length?played.map(x=>`<article class="recent-result-card"><div class="recent-result-top"><span>FINAL</span><time>${x.kickoff?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'short'}).format(new Date(x.kickoff)):''}</time></div><div class="recent-result-teams"><b>${esc(tname(x.home))}</b><strong>${x.homeScore} – ${x.awayScore}</strong><b>${esc(tname(x.away))}</b></div><small>${esc(x.provider||'Resultado real')}</small></article>`) .join(''):'<p>Todavía no hay resultados reales disponibles.</p>';
    if(root.innerHTML!==html)root.innerHTML=html;
  }
  async function loadOfficial(){
    try{const r=await fetch(`official-match-data.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok)official=await r.json();}catch(_){}
  }
  function loadOfficialRosters(){if(document.querySelector('script[src="official-rosters.js"]'))return;const s=document.createElement('script');s.src='official-rosters.js';s.defer=true;document.body.appendChild(s);}
  function patch(){ patchStatusLabels(); document.querySelectorAll('.match-card').forEach(patchCard); patchDetail(); renderRecent(); }
  async function init(){ loadOfficialRosters(); await loadOfficial(); patch(); }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
  setInterval(async()=>{await loadOfficial();patch();},5*60*1000);
})();
