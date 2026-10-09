(() => {
  "use strict";
  let data={matches:{}};
  let activeKey=null;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const icon=t=>t==="goal"?"⚽":t==="red"?"🟥":"🟨";

  function itemFor(key){return data.matches?.[String(key||"")]||null;}
  function isFinished(x){return x?.status==="finished"&&x.homeScore!=null&&x.awayScore!=null;}

  function patchCard(card){
    const button=card.querySelector(".match-open[data-matchkey]");if(!button)return;
    const item=itemFor(button.dataset.matchkey);if(!item)return;
    if(isFinished(item)){
      const score=card.querySelector(".match-teams strong");if(score)score.textContent=`${item.homeScore} – ${item.awayScore}`;
      card.classList.add("is-finished","official-result");
      const pred=card.querySelector(".prediction");if(pred){pred.classList.add("prediction-small");const label=pred.querySelector("small");if(label&&!/resultado final/i.test(label.textContent||""))label.textContent="✅ Resultado oficial";}
    }
    if(!card.querySelector(".official-match-badge")){
      const badge=document.createElement("div");badge.className="official-match-badge";badge.textContent="Fuente: LALIGA oficial";
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
  function patchDetail(){
    const root=document.getElementById("detail-content");if(!root)return;
    const key=detailKey(root),item=itemFor(key);if(!item)return;
    const panel=root.querySelector(".real-match-center");if(!panel)return;
    panel.classList.add("official-match-center");
    const status=panel.querySelector(".real-title b");if(status)status.textContent=isFinished(item)?"Finalizado · oficial":item.status==="inprogress"?"En directo · oficial":"Datos oficiales";
    if(item.homeScore!=null&&item.awayScore!=null){
      const score=panel.querySelector(".real-score b");if(score)score.textContent=`${item.homeScore} – ${item.awayScore}`;
      const heroScore=root.querySelector(".match-detail-hero .big-match strong");if(heroScore)heroScore.textContent=`${item.homeScore} – ${item.awayScore}`;
    }
    const incidents=findBlock(panel,"Goles y tarjetas");if(incidents)incidents.innerHTML=`<h3>⚽ Goles y tarjetas</h3>${timelineHTML(item)}`;
    const stats=findBlock(panel,"Estadísticas reales");if(stats)stats.innerHTML=`<h3>📊 Estadísticas oficiales</h3>${statsHTML(item)}`;
    let source=panel.querySelector(".real-source");
    if(!source){source=document.createElement("p");source.className="real-source";panel.appendChild(source);}
    source.innerHTML=`Fuente prioritaria: <a href="${esc(item.url||"https://www.laliga.com/laliga-easports/resultados")}" target="_blank" rel="noopener">LALIGA oficial ↗</a>. ESPN y SofaScore actúan como respaldo cuando aportan campos adicionales.`;
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
