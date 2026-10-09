(() => {
  "use strict";
  const D = window.LIGA_DATA || {};
  const teams = D.teams || {};
  const SEED = Array.isArray(window.LALIGA_MATCH_SEED) ? window.LALIGA_MATCH_SEED : [];
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1";
  const state = { events: new Map(), summaries: new Map(), activeKey: null, liveData: null, busy: false };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const key = (h,a) => `${h}:${a}`;
  const teamName = c => teams[c]?.short || teams[c]?.name || c;
  const finished = s => ["finished","post","complete","completed","afterpenalties","afterextra"].includes(String(s||"").toLowerCase());
  const liveStatus = s => ["inprogress","in","live"].includes(String(s||"").toLowerCase());
  const aliases = {
    ALA:["deportivo alaves","alaves"],ATH:["athletic club","athletic bilbao"],ATM:["atletico madrid","atletico de madrid"],
    BAR:["barcelona","fc barcelona"],BET:["real betis","real betis balompie","betis"],CEL:["celta vigo","rc celta","celta","celta de vigo"],
    DEP:["deportivo la coruna","deportivo de la coruna","rc deportivo","deportivo"],ELC:["elche","elche cf"],ESP:["espanyol","rcd espanyol","espanyol barcelona","rcd espanyol de barcelona"],
    GET:["getafe","getafe cf"],LEV:["levante","levante ud"],MGA:["malaga","malaga cf"],OSA:["osasuna","ca osasuna"],RAC:["racing santander","racing de santander","real racing club"],
    RAY:["rayo vallecano","rayo"],RMA:["real madrid","real madrid cf"],RSO:["real sociedad","real sociedad san sebastian"],SEV:["sevilla","sevilla fc"],VAL:["valencia","valencia cf"],VIL:["villarreal","villarreal cf"]
  };
  const aliasEntries = Object.entries(aliases).flatMap(([c,arr])=>arr.map(x=>[norm(x),c]));
  function codeFor(t={}) {
    const vals = typeof t === "string" ? [t] : [t.displayName,t.shortDisplayName,t.name,t.location,t.slug,t.abbreviation];
    for (const v of vals) {
      const n=norm(v); if(!n) continue;
      const exact=aliasEntries.find(([a])=>n===a);
      if(exact) return exact[1];
      const matches=aliasEntries
        .filter(([a])=>a.length>=4 && (n.includes(a)||a.includes(n)))
        .sort((x,y)=>y[0].length-x[0].length);
      if(matches.length) return matches[0][1];
    }
    return null;
  }
  function seedEvents(){ for(const e of SEED) state.events.set(key(e.home,e.away), {...e, provider:"LALIGA TOTAL respaldo"}); }
  function mergeEvent(e){ if(!e?.home || !e?.away) return; const k=key(e.home,e.away), old=state.events.get(k)||{}; state.events.set(k,{...old,...e}); }
  async function loadLiveData(){
    try{
      const r=await fetch(`live-data.json?v=${Date.now()}`,{cache:"no-store"});
      if(!r.ok) return;
      const data=await r.json(); state.liveData=data;
      for(const e of data.events||[]) mergeEvent(e);
    }catch(_){}
  }
  function parseScore(v){ if(v && typeof v==="object") v=v.value ?? v.displayValue; const n=Number(v); return Number.isFinite(n)?n:null; }
  function parseScoreboardEvent(event){
    const comp=event?.competitions?.[0]; if(!comp) return null;
    let home=null,away=null,homeScore=null,awayScore=null;
    for(const c of comp.competitors||[]){
      const code=codeFor(c.team||{});
      if(c.homeAway==="home"){home=code;homeScore=parseScore(c.score);}
      if(c.homeAway==="away"){away=code;awayScore=parseScore(c.score);}
    }
    if(!home||!away) return null;
    const st=comp.status?.type||event.status?.type||{};
    const stateCode=String(st.state||"").toLowerCase();
    const isDone=Boolean(st.completed)||stateCode==="post";
    const status=isDone?"finished":stateCode==="in"?"inprogress":"notstarted";
    return {id:String(event.id||""),home,away,homeScore:isDone||status==="inprogress"?homeScore:null,awayScore:isDone||status==="inprogress"?awayScore:null,status,kickoff:event.date||comp.date||null,provider:"ESPN cliente"};
  }
  async function hydrateSeason(){
    if(state.busy) return; state.busy=true;
    try{
      const r=await fetch(`${ESPN}/scoreboard?dates=20260801-20270630&limit=500`,{cache:"no-store",mode:"cors"});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const data=await r.json();
      for(const raw of data.events||[]){ const e=parseScoreboardEvent(raw); if(e) mergeEvent(e); }
    }catch(e){ console.info("LALIGA TOTAL: actualización de resultados en navegador no disponible",e); }
    finally{ state.busy=false; decorateAll(); }
  }
  function eventForMatchKey(matchKey){
    const [,h,a]=String(matchKey||"").split(":");
    return state.events.get(key(h,a))||null;
  }
  function humanDate(iso){
    if(!iso) return "Horario por confirmar";
    const d=new Date(iso); if(Number.isNaN(d.getTime())) return "Horario por confirmar";
    return new Intl.DateTimeFormat("es-ES",{timeZone:"Europe/Madrid",weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d);
  }
  function countdownText(iso){
    const t=new Date(iso).getTime(); if(!Number.isFinite(t)) return "";
    let ms=t-Date.now();
    if(ms<=0 && ms>-3*60*60*1000) return "Comenzando / en juego";
    if(ms<=0) return "";
    const d=Math.floor(ms/864e5),h=Math.floor(ms/36e5)%24,m=Math.floor(ms/6e4)%60,s=Math.floor(ms/1000)%60;
    return `${d}d ${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
  }
  function watchHTML(names=[]){
    const detected=(names||[]).filter(Boolean);
    return `<div class="watch-box"><div><small>📺 Dónde verlo en España</small><b>${detected.length?esc(detected.join(" · ")):"DAZN LaLiga / LALIGA TV por M+ · según asignación de jornada"}</b><span>También disponible dentro de las ofertas de fútbol compatibles de Orange TV. Verifica el operador exacto antes del inicio.</span></div><div class="watch-links"><a href="https://www.laliga.com/donde-ver-laliga-easports" target="_blank" rel="noopener">Guía oficial LALIGA ↗</a><a href="https://www.dazn.com/es-ES/" target="_blank" rel="noopener">DAZN ↗</a><a href="https://www.movistarplus.es/deportes/futbol/la-liga-ea-sports/calendario" target="_blank" rel="noopener">Movistar Plus+ ↗</a><a href="https://www.orange.es/orange-tv/futbol/laliga" target="_blank" rel="noopener">Orange TV ↗</a></div></div>`;
  }
  function smallPrediction(card){
    const pred=card.querySelector(".prediction");
    if(!pred) return;
    pred.classList.add("prediction-small");
    const b=pred.querySelector("b");
    const current=b?.textContent?.trim();
    if(current && !current.toLowerCase().includes("finalizado")) pred.innerHTML=`<small>🔮 Predicción previa del modelo</small><b>${esc(current)}</b>`;
  }
  function decorateCard(card){
    const btn=card.querySelector(".match-open[data-matchkey]"); if(!btn) return;
    const mk=btn.dataset.matchkey, ev=eventForMatchKey(mk); if(!ev) return;
    const score=card.querySelector(".match-teams strong");
    const metaTime=card.querySelector(".match-meta time");
    if(metaTime && ev.kickoff) metaTime.textContent=humanDate(ev.kickoff);
    let cd=card.querySelector(".match-countdown");
    if(finished(ev.status)){
      if(score && ev.homeScore!=null) score.textContent=`${ev.homeScore} – ${ev.awayScore}`;
      card.classList.add("is-finished");
      const pred=card.querySelector(".prediction"); if(pred){
        const old=pred.querySelector("b")?.textContent||"";
        const text=old.toLowerCase().includes("finalizado")?"":old;
        pred.innerHTML=`<small>✅ Resultado final</small><b>Finalizado</b>${text?`<span>Predicción previa: ${esc(text)}</span>`:""}`;
        pred.classList.add("prediction-small");
      }
      if(cd) cd.remove();
    }else{
      smallPrediction(card);
      if(!cd){cd=document.createElement("div");cd.className="match-countdown";card.querySelector(".match-meta")?.after(cd);}
      const tick=()=>{const txt=countdownText(ev.kickoff);cd.innerHTML=txt?`<small>⏳ Cuenta atrás</small><b>${esc(txt)}</b>`:"";};
      tick(); if(!cd.dataset.timer){cd.dataset.timer="1";setInterval(tick,1000);}
    }
    if(!card.querySelector(".match-watch-mini")){
      const w=document.createElement("div");w.className="match-watch-mini";w.innerHTML=`📺 <span>DAZN LaLiga / LALIGA TV por M+ · <button type="button">dónde verlo</button></span>`;
      w.querySelector("button")?.addEventListener("click",e=>{e.stopPropagation();window.open("https://www.laliga.com/donde-ver-laliga-easports","_blank","noopener");});
      card.querySelector(".match-actions")?.before(w);
    }
  }
  function statName(s){return s?.label||s?.displayName||s?.name||s?.abbreviation||"Dato";}
  function summaryStats(summary){
    const teamsBox=summary?.boxscore?.teams||[];
    if(teamsBox.length<2) return [];
    const map={};
    for(const t of teamsBox){
      const code=codeFor(t.team||{});
      if(!code) continue;
      map[code]={};
      for(const s of t.statistics||[]) map[code][norm(statName(s))]=s.displayValue??s.value??"—";
    }
    const h=codeFor(teamsBox.find(x=>x.homeAway==="home")?.team||{})||Object.keys(map)[0];
    const a=codeFor(teamsBox.find(x=>x.homeAway==="away")?.team||{})||Object.keys(map)[1];
    if(!h||!a) return [];
    const labels=[
      ["posesion","Posesión"],["possession","Posesión"],["tiros","Tiros"],["total shots","Tiros"],["shots","Tiros"],
      ["shots on target","Tiros a puerta"],["tiros a puerta","Tiros a puerta"],["corners","Córners"],["corner kicks","Córners"],
      ["fouls committed","Faltas"],["fouls","Faltas"],["yellow cards","Tarjetas amarillas"],["red cards","Tarjetas rojas"],
      ["offsides","Fueras de juego"],["saves","Paradas"]
    ];
    const out=[],used=new Set();
    for(const [needle,label] of labels){
      const k=Object.keys(map[h]||{}).find(x=>x.includes(needle))||Object.keys(map[a]||{}).find(x=>x.includes(needle));
      if(k && !used.has(label)){used.add(label);out.push({label,home:map[h]?.[k]??"—",away:map[a]?.[k]??"—"});}
    }
    if(!out.length){
      const common=Object.keys(map[h]||{}).filter(k=>Object.prototype.hasOwnProperty.call(map[a]||{},k)).slice(0,12);
      for(const k of common) out.push({label:k.replace(/\b\w/g,m=>m.toUpperCase()),home:map[h][k],away:map[a][k]});
    }
    return out;
  }
  function summaryIncidents(summary){
    const raw=[...(summary?.keyEvents||[]),...(summary?.plays||[])];
    const seen=new Set(),out=[];
    for(const x of raw){
      const text=x.text||x.shortText||x.type?.text||x.type?.description||"";
      const low=norm(text);
      if(!/(goal|gol|yellow|amarill|red card|roja|penalty|penal)/.test(low)) continue;
      const clock=x.clock?.displayValue||x.clock?.value||x.time||"";
      const sig=`${clock}:${text}`;if(seen.has(sig))continue;seen.add(sig);
      let icon=/(yellow|amarill)/.test(low)?"🟨":/(red card|roja)/.test(low)?"🟥":/(goal|gol|penalty|penal)/.test(low)?"⚽":"•";
      out.push({clock,text,icon});
    }
    return out.slice(0,40);
  }
  function broadcasters(summary){
    const names=[];
    for(const b of summary?.header?.competitions?.[0]?.broadcasts||[]) for(const n of b.names||[]) if(n&&!names.includes(n)) names.push(n);
    for(const b of summary?.broadcasts||[]) for(const n of b.names||[]) if(n&&!names.includes(n)) names.push(n);
    return names;
  }
  async function fetchSummary(ev){
    if(!ev?.id) return null;
    if(state.summaries.has(String(ev.id))) return state.summaries.get(String(ev.id));
    try{
      const r=await fetch(`${ESPN}/summary?event=${encodeURIComponent(ev.id)}`,{cache:"no-store",mode:"cors"});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const data=await r.json();state.summaries.set(String(ev.id),data);return data;
    }catch(e){console.info("LALIGA TOTAL: detalle ESPN no disponible",e);return null;}
  }
  function basicRealPanel(ev,h,a){
    return `<section class="real-match-center"><div class="real-title"><span>DATOS REALES DEL PARTIDO</span><b>${finished(ev?.status)?"Finalizado":liveStatus(ev?.status)?"En directo":"Previa real"}</b></div><div class="real-score"><strong>${esc(teamName(h))}</strong><b>${ev?.homeScore!=null?`${ev.homeScore} – ${ev.awayScore}`:"vs"}</b><strong>${esc(teamName(a))}</strong></div><p>${esc(humanDate(ev?.kickoff))}</p><div class="real-loading">Cargando goleadores, tarjetas, córners y estadísticas disponibles…</div></section>`;
  }
  async function decorateDetail(){
    const root=document.getElementById("detail-content"); if(!root||!state.activeKey) return;
    const hero=root.querySelector(".match-detail-hero"); if(!hero||hero.dataset.realEnhanced===state.activeKey) return;
    const [,h,a]=state.activeKey.split(":"),ev=eventForMatchKey(state.activeKey)||{home:h,away:a};
    hero.dataset.realEnhanced=state.activeKey;
    const score=hero.querySelector(".big-match strong");
    if(ev.homeScore!=null && score) score.textContent=`${ev.homeScore} – ${ev.awayScore}`;
    const eyebrow=hero.querySelector(".eyebrow");
    if(eyebrow) eyebrow.textContent=`Jornada ${state.activeKey.split(":")[0]} · ${finished(ev.status)?"FINALIZADO":liveStatus(ev.status)?"EN DIRECTO":"PRÓXIMO PARTIDO"}`;
    const prob=hero.querySelector(".probability");
    if(prob){prob.classList.add("prediction-small-detail");prob.insertAdjacentHTML("afterbegin","<small>🔮 Predicción previa de LALIGA TOTAL</small>");}
    if(!finished(ev.status) && ev.kickoff && !hero.querySelector(".detail-countdown")){
      const c=document.createElement("div");c.className="detail-countdown";hero.querySelector(".hero-actions")?.before(c);
      const tick=()=>{const txt=countdownText(ev.kickoff);c.innerHTML=txt?`<small>⏳ Cuenta atrás para el partido</small><b>${esc(txt)}</b>`:"";};tick();setInterval(tick,1000);
    }
    hero.insertAdjacentHTML("afterend",basicRealPanel(ev,h,a));
    const panel=root.querySelector(".real-match-center");
    const summary=await fetchSummary(ev);
    const stats=summaryStats(summary||{});
    const inc=summaryIncidents(summary||{});
    const tv=broadcasters(summary||{});
    panel.innerHTML=`<div class="real-title"><span>DATOS REALES DEL PARTIDO</span><b>${finished(ev.status)?"Finalizado":liveStatus(ev.status)?"En directo":"Información previa"}</b></div><div class="real-score"><strong>${esc(teamName(h))}</strong><b>${ev.homeScore!=null?`${ev.homeScore} – ${ev.awayScore}`:"vs"}</b><strong>${esc(teamName(a))}</strong></div><p>${esc(humanDate(ev.kickoff))}</p>${inc.length?`<div class="real-block"><h3>⚽ Goles y tarjetas</h3><div class="real-timeline">${inc.map(x=>`<div><time>${esc(x.clock||"")}</time><span>${x.icon} ${esc(x.text)}</span></div>`).join("")}</div></div>`:`<div class="real-block"><h3>⚽ Goles y tarjetas</h3><p>${finished(ev.status)?"El proveedor no ha devuelto todavía el detalle de incidencias para este partido. El resultado real sí queda guardado.":"Aparecerán aquí automáticamente durante y después del partido."}</p></div>`}${stats.length?`<div class="real-block"><h3>📊 Estadísticas reales</h3><div class="real-stats">${stats.map(s=>`<div><b>${esc(s.home)}</b><span>${esc(s.label)}</span><b>${esc(s.away)}</b></div>`).join("")}</div></div>`:`<div class="real-block"><h3>📊 Estadísticas reales</h3><p>${finished(ev.status)?"Córners, tiros, posesión y demás métricas se mostrarán automáticamente cuando estén disponibles en el proveedor.":"Las estadísticas aparecerán al comenzar el partido."}</p></div>`}${watchHTML(tv)}<div class="real-source">Resultado/horario: caché de LALIGA TOTAL y actualización en navegador. Detalle estadístico: proveedor deportivo cuando responde.</div>`;
  }
  function decorateAll(){ document.querySelectorAll(".match-card").forEach(decorateCard); decorateDetail(); }
  document.addEventListener("click",e=>{const b=e.target.closest(".match-open[data-matchkey],.fixture-open[data-matchkey]");if(b) state.activeKey=b.dataset.matchkey;},true);
  async function init(){seedEvents();await loadLiveData();decorateAll();hydrateSeason();setInterval(()=>{hydrateSeason();decorateAll();},60000);}
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
  new MutationObserver(()=>requestAnimationFrame(decorateAll)).observe(document.documentElement,{subtree:true,childList:true});
})();