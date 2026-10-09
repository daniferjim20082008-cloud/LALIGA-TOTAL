(() => {
  "use strict";
  const D=window.LIGA_DATA||{};
  const OFFICIAL="https://www.laliga.com/donde-ver-laliga-easports";
  let data={broadcasts:{}};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function keyFromMatchKey(value){const [,h,a]=String(value||"").split(":");return h&&a?`${h}:${a}`:"";}
  function codesFromMatchKey(value){const [,h,a]=String(value||"").split(":");return h&&a?[h,a]:[];}
  function operatorsFor(matchKey){return data.broadcasts?.[keyFromMatchKey(matchKey)]||[];}

  function positionMap(){
    const map={};
    (D.standings||[]).forEach((r,i)=>map[r[0]]={pos:i+1,points:Number(r[1]||0),played:Number(r[2]||0),gf:Number(r[6]||0),ga:Number(r[7]||0)});
    return map;
  }
  function strength(code){
    const r=positionMap()[code];if(!r)return 1;
    const ppg=r.played?r.points/r.played:1.2,gdpg=r.played?(r.gf-r.ga)/r.played:0;
    return Math.max(.35,ppg+.22*gdpg);
  }
  function predict(home,away){
    const delta=Math.max(-1.6,Math.min(1.6,(strength(home)-strength(away))*.55+.32));
    const hp=Math.round(Math.max(18,Math.min(68,39+delta*18))),ap=Math.round(Math.max(14,Math.min(58,31-delta*15)));
    const dp=Math.max(12,100-hp-ap),total=hp+dp+ap;
    return [Math.round(hp*100/total),Math.round(dp*100/total),Math.round(ap*100/total)];
  }
  function predictionLabel(matchKey){
    const [h,a]=codesFromMatchKey(matchKey);if(!h||!a)return"";
    const p=predict(h,a);return `1 ${p[0]}% · X ${p[1]}% · 2 ${p[2]}%`;
  }
  function preserveCardPrediction(card,matchKey){
    if(!card.classList.contains("is-finished"))return;
    const pred=card.querySelector(".prediction");if(!pred||pred.querySelector(".model-prior"))return;
    const existing=[...pred.querySelectorAll("span")].some(x=>/predicci[oó]n previa/i.test(x.textContent||""));
    if(existing)return;
    const text=predictionLabel(matchKey);if(!text)return;
    const span=document.createElement("span");span.className="model-prior";span.textContent=`Predicción previa: ${text}`;pred.appendChild(span);
  }
  function preserveDetailPrediction(root,matchKey){
    const hero=root.querySelector(".match-detail-hero");if(!hero||hero.querySelector(".model-prior-detail"))return;
    if(hero.querySelector(".probability"))return;
    const text=predictionLabel(matchKey);if(!text)return;
    const box=document.createElement("div");box.className="probability prediction-small-detail model-prior-detail";
    box.innerHTML=`<small>🔮 Predicción previa de LALIGA TOTAL</small><span>${esc(text)}</span>`;
    hero.querySelector(".hero-actions")?.before(box);
  }

  function patchCard(card){
    const b=card.querySelector(".match-open[data-matchkey]");if(!b)return;
    preserveCardPrediction(card,b.dataset.matchkey);
    const ops=operatorsFor(b.dataset.matchkey);if(!ops.length)return;
    let box=card.querySelector(".match-watch-mini");
    if(!box){box=document.createElement("div");box.className="match-watch-mini";card.querySelector(".match-actions")?.before(box);}
    const signature=ops.join("|");
    if(box.dataset.officialBroadcast===signature)return;
    box.innerHTML=`📺 <span><b>${esc(ops.join(" · "))}</b> · <a href="${OFFICIAL}" target="_blank" rel="noopener">guía oficial ↗</a></span>`;
    box.dataset.officialBroadcast=signature;
  }
  function currentDetailMatchKey(root){
    const active=document.querySelector("[data-matchkey][data-active-broadcast]");
    if(active?.dataset.matchkey)return active.dataset.matchkey;
    const hero=root.querySelector(".match-detail-hero");if(!hero)return"";
    const names=[...hero.querySelectorAll(".big-match [data-team]")].map(x=>x.dataset.team).filter(Boolean);
    return names.length===2?`0:${names[0]}:${names[1]}`:"";
  }
  function patchDetail(){
    const root=document.getElementById("detail-content");if(!root)return;
    const matchKey=currentDetailMatchKey(root);if(!matchKey)return;
    preserveDetailPrediction(root,matchKey);
    const ops=operatorsFor(matchKey);if(!ops.length)return;
    const watch=root.querySelector(".watch-box");if(!watch)return;
    const signature=ops.join("|");if(watch.dataset.officialBroadcast===signature)return;
    const title=watch.querySelector("b");if(title)title.textContent=ops.join(" · ");
    const note=watch.querySelector("span");if(note)note.textContent="Operadores publicados por LALIGA para este partido. Verifica la guía oficial por si hubiera cambios de última hora.";
    watch.dataset.officialBroadcast=signature;
  }
  function markActive(e){
    const b=e.target.closest(".match-open[data-matchkey],.fixture-open[data-matchkey]");if(!b)return;
    document.querySelectorAll("[data-active-broadcast]").forEach(x=>delete x.dataset.activeBroadcast);
    b.dataset.activeBroadcast="1";
  }
  function patch(){document.querySelectorAll(".match-card").forEach(patchCard);patchDetail();}
  async function init(){
    try{const r=await fetch(`broadcast-data.json?v=${Date.now()}`,{cache:"no-store"});if(r.ok)data=await r.json();}catch(_){}
    patch();
  }
  document.addEventListener("click",markActive,true);
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
})();
