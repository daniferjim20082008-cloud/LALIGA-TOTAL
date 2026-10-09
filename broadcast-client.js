(() => {
  "use strict";
  const OFFICIAL="https://www.laliga.com/donde-ver-laliga-easports";
  let data={broadcasts:{}};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function keyFromMatchKey(value){const [,h,a]=String(value||"").split(":");return h&&a?`${h}:${a}`:"";}
  function operatorsFor(matchKey){return data.broadcasts?.[keyFromMatchKey(matchKey)]||[];}
  function patchCard(card){
    const b=card.querySelector(".match-open[data-matchkey]");if(!b)return;
    const ops=operatorsFor(b.dataset.matchkey);if(!ops.length)return;
    let box=card.querySelector(".match-watch-mini");
    if(!box){box=document.createElement("div");box.className="match-watch-mini";card.querySelector(".match-actions")?.before(box);}
    box.innerHTML=`📺 <span><b>${esc(ops.join(" · "))}</b> · <a href="${OFFICIAL}" target="_blank" rel="noopener">guía oficial ↗</a></span>`;
    box.dataset.officialBroadcast="1";
  }
  function patchDetail(){
    const root=document.getElementById("detail-content");if(!root)return;
    const back=root.querySelector(".detail-back");
    const pageMatch=document.querySelector(".match-open[data-matchkey][data-active-broadcast]");
    let matchKey=pageMatch?.dataset.matchkey||"";
    if(!matchKey){
      const hero=root.querySelector(".match-detail-hero");
      if(!hero)return;
      const names=[...hero.querySelectorAll(".big-match [data-team]")].map(x=>x.dataset.team);
      if(names.length===2){
        const candidate=Object.keys(data.broadcasts||{}).find(k=>k===`${names[0]}:${names[1]}`);
        matchKey=candidate?`0:${candidate.replace(":",":")}`:"";
      }
    }
    const ops=operatorsFor(matchKey);if(!ops.length)return;
    const watch=root.querySelector(".watch-box");if(!watch)return;
    const title=watch.querySelector("b");if(title)title.textContent=ops.join(" · ");
    const note=watch.querySelector("span");if(note)note.textContent="Operadores publicados por LALIGA para este partido. Verifica la guía oficial por si hubiera cambios de última hora.";
    watch.dataset.officialBroadcast="1";
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
