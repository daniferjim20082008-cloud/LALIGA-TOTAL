(() => {
  "use strict";
  const D=window.LIGA_DATA||{};
  let data={matches:{}};
  let activeKey=null;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const icon=t=>t==="goal"?"⚽":t==="red"?"🟥":"🟨";

  function itemFor(key){return data.matches?.[String(key||"")]||null;}
  function isFinished(x){return x?.status==="finished"&&x.homeScore!=null&&x.awayScore!=null;}
  function positionMap(){const map={};(D.standings||[]).forEach((r,i)=>map[r[0]]={pos:i+1,points:r[1],played:r[2],gf:r[6],ga:r[7]});return map;}
  function strength(code){const r=positionMap()[code];if(!r)return 1;const ppg=r.played?r.points/r.played:1.2,gdpg=r.played?(r.gf-r.ga)/r.played:0;return Math.max(.35,ppg+.22*gdpg);}
  function prediction(home,away){const delta=Math.max(-1.6,Math.min(1.6,(strength(home)-strength(away))*.55+.32));const hp=Math.round(Math.max(18,Math.min(68,39+delta*18))),ap=Math.round(Math.max(14,Math.min(58,31-delta*15)));const dp=Math.max(12,100-hp-ap),total=hp+dp+ap;return [Math.round(hp*100/total),Math.round(dp*100/total),Math.round(ap*100/total)];}
  function predictionHTML(key){const [,h,a]=String(key||"").split(":");if(!h||!a)return "";const p=prediction(h,a);return `<small>🔮 Predicción previa</small><b>1 ${p[0]}% · X ${p[1]}% · 2 ${p[2]}%</b>`;}

  function patchCard(card){
    const button=card.querySelector(".match-open[data-matchkey]");if(!button)return;
    const key=button.dataset.matchkey,item=itemFor(key);if(!item)return;
    if(isFinished(item)){
      const score=card.querySelector(".match-teams strong");if(score&&score.textContent!==`${item.homeScore} – ${item.awayScore}`)score.textContent=`${item.homeScore} – ${item.awayScore}`;
      card.classList.add("is-finished","official-result");
      const pred=card.querySelector(".prediction");
      if(pred&&pred.dataset.officialPrediction!==key){pred.classList.add("prediction-small");pred.innerHTML=predictionHTML(key);pred.dataset.officialPrediction=key;}
    }
    if(!card.querySelector(".official-match-badge")){
      const badge=document.createElement("div");badge.className="official-match-badge";badge.textContent="✓ Resultado verificado · LALIGA";
      card.querySelector(".match-actions")?.before(badge);
    }
  }

  function detailKey(root){
    if(activeKey&&itemFor(activeKey))return activeKey;
    const hero=root.querySelector(".match-detail-hero");if(!hero)return null;
    const codes=[...hero.querySelectorAll(".big-match [data-team]")].map(x=>x.dataset.team).filter(Boolean);
    if(codes.length!==2)return null;
    return Object.keys(data.matches||{}).find(k=>{const [,h,a]=k.split(":");return h===codes[0]&&a===codes[1];})||null;
  }
  function timelineHTML(item){
    const incidents=item.incidents||[];
    if(incidents.length){
      return `<div class="real-timeline official-timeline">${incidents.map(x=>`<div><time>${esc(x.minute||"—")}</time><span>${icon(x.type)} ${esc(x.text||"")}</span></div>`).join("")}</div>`;
    }
    const scorers=item.scorers||[];
    if(scorers.length)return `<div class="official-scorers">${scorers.map(x=>`<span>⚽ ${esc(x)}</span>`).join("")}</div>`;
    return `<p>No hay incidencias oficiales detalladas en la caché para este partido.</p>`;
  }
  function statsHTML(item){
    const stats=item.statistics||[];
    if(!stats.length)return `<p>Las estadísticas oficiales todavía no están disponibles.</p>`;
    return `<div class="real-stats official-stats">${stats.map(s=>`<div><b>${esc(s.home)}</b><span>${esc(s.name)}</span><b>${esc(s.away)}</b></div>`).join("")}</div>`;
  }
  function findBlock(panel,text){return [...panel.querySelectorAll(".real-block")].find(x=>x.querySelector("h3")?.textContent.includes(text));}
  function ensureDetailPrediction(root,key){
    const hero=root.querySelector(".match-detail-hero");if(!hero)return;
    let box=hero.querySelector(".official-detail-prediction");
    if(!box){box=document.createElement("div");box.className="probability prediction-small-detail official-detail-prediction";hero.querySelector(".hero-actions")?.before(box);}
    if(box.dataset.matchkey!==key){const [,h,a]=key.split(":"),p=prediction(h,a);box.innerHTML=`<small>🔮 Predicción previa de LALIGA TOTAL</small><span>1 <b>${p[0]}%</b></span><span>X <b>${p[1]}%</b></span><span>2 <b>${p[2]}%</b></span>`;box.dataset.matchkey=key;}
  }
  function patchDetail(){
    const root=document.getElementById("detail-content");if(!root)return;
    const key=detailKey(root),item=itemFor(key);if(!item)return;
    const panel=root.querySelector(".real-match-center");if(!panel)return;
    panel.classList.add("official-match-center");
    const status=panel.querySelector(".real-title b");const wantedStatus=isFinished(item)?"Finalizado · oficial":item.status==="inprogress"?"En directo · oficial":"Datos oficiales";if(status&&status.textContent!==wantedStatus)status.textContent=wantedStatus;
    if(item.homeScore!=null&&item.awayScore!=null){
      const wanted=`${item.homeScore} – ${item.awayScore}`;
      const score=panel.querySelector(".real-score b");if(score&&score.textContent!==wanted)score.textContent=wanted;
      const heroScore=root.querySelector(".match-detail-hero .big-match strong");if(heroScore&&heroScore.textContent!==wanted)heroScore.textContent=wanted;
    }
    if(isFinished(item))ensureDetailPrediction(root,key);
    const incidents=findBlock(panel,"Goles y tarjetas");if(incidents&&incidents.dataset.officialKey!==key){incidents.innerHTML=`<h3>⚽ Goles y tarjetas</h3>${timelineHTML(item)}`;incidents.dataset.officialKey=key;}
    const stats=findBlock(panel,"Estadísticas");if(stats&&stats.dataset.officialKey!==key){stats.innerHTML=`<h3>📊 Estadísticas oficiales</h3>${statsHTML(item)}`;stats.dataset.officialKey=key;}
    let source=panel.querySelector(".real-source");
    if(!source){source=document.createElement("p");source.className="real-source";panel.appendChild(source);}
    if(source.dataset.officialKey!==key){source.innerHTML=`Fuente prioritaria: <a href="${esc(item.url||"https://www.laliga.com/laliga-easports/resultados")}" target="_blank" rel="noopener">LALIGA oficial ↗</a>. ESPN y SofaScore actúan como respaldo cuando aportan campos adicionales.`;source.dataset.officialKey=key;}
  }
  function markActive(e){const b=e.target.closest(".match-open[data-matchkey],.fixture-open[data-matchkey]");if(b)activeKey=b.dataset.matchkey;}
  function patch(){document.querySelectorAll(".match-card").forEach(patchCard);patchDetail();}
  async function init(){
    try{const r=await fetch(`official-match-data.json?v=${Date.now()}`,{cache:"no-store"});if(r.ok)data=await r.json();}catch(_){}
    patch();
  }
  document.addEventListener("click",markActive,true);
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
})();
