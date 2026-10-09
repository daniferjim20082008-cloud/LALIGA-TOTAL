(() => {
  "use strict";
  const SOFA = "https://www.sofascore.com";
  const state={live:null,active:null,cache:new Map()};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const slug=s=>String(s||"jugador").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"jugador";
  const sofaUrl=(name,id)=>id?`${SOFA}/es/football/player/${slug(name)}/${id}`:`${SOFA}/es`;
  const photo=id=>id?`https://img.sofascore.com/api/v1/player/${id}/image`:"";
  function loadFallbacks(){
    const files=[
      {src:"sofa-rosters.js",attr:"data-sofa-rosters"},
      {src:"match-sofa-fallback.js",attr:"data-match-sofa"}
    ];
    for(const f of files){
      if(document.querySelector(`script[${f.attr}]`))continue;
      const s=document.createElement("script");s.src=f.src;s.defer=true;s.setAttribute(f.attr,"1");document.body.appendChild(s);
    }
  }
  async function load(){
    try{const r=await fetch(`live-data.json?v=${Date.now()}`,{cache:"no-store"});if(r.ok)state.live=await r.json();}catch(_){}
  }
  function livePlayer(code,id){
    return (state.live?.squads?.[code]||[]).find(p=>String(p.id)===String(id))||null;
  }
  async function resolveByName(name){
    const k=String(name||"").trim().toLowerCase();if(!k)return null;if(state.cache.has(k))return state.cache.get(k);
    const bases=["https://www.sofascore.com/api/v1","https://api.sofascore.com/api/v1"];
    for(const base of bases){
      try{
        const r=await fetch(`${base}/search/all?q=${encodeURIComponent(name)}`,{cache:"no-store",mode:"cors"});if(!r.ok)continue;
        const data=await r.json();
        const candidates=[];
        const walk=x=>{if(!x)return;if(Array.isArray(x)){x.forEach(walk);return;}if(typeof x!=="object")return;
          if(x.id&&(x.name||x.shortName||x.slug))candidates.push(x);
          Object.values(x).forEach(v=>{if(v&&typeof v==="object")walk(v);});
        };
        walk(data);
        const n=k.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        const best=candidates.find(x=>String(x.name||x.shortName||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()===n)
          ||candidates.find(x=>String(x.name||x.shortName||"").toLowerCase().includes(k.split(" ")[0]));
        if(best?.id){const out={id:best.id,name:best.name||best.shortName||name};state.cache.set(k,out);return out;}
      }catch(_){}
    }
    state.cache.set(k,null);return null;
  }
  async function openResolvedSofa(name, knownId, anchor){
    if(knownId){anchor.href=sofaUrl(name,knownId);return true;}
    const popup=window.open("about:blank","_blank");
    if(popup){
      try{popup.document.title="Abriendo SofaScore…";popup.document.body.innerHTML="<p style='font-family:system-ui;padding:24px'>Buscando la ficha del jugador en SofaScore…</p>";}catch(_){}
    }
    const found=await resolveByName(name);
    const target=sofaUrl(name,found?.id||null);
    if(found?.id){
      anchor.href=target;
      anchor.dataset.sofaId=String(found.id);
      anchor.textContent="SofaScore ↗";
    }else{
      anchor.textContent="Buscar en SofaScore ↗";
    }
    if(popup) popup.location.href=target;
    else window.open(target,"_blank","noopener");
    return false;
  }
  function attachDeferredLink(anchor,name,knownId){
    if(knownId){anchor.href=sofaUrl(name,knownId);anchor.dataset.sofaId=String(knownId);return;}
    anchor.href=`${SOFA}/es`;
    anchor.textContent="Buscar en SofaScore ↗";
    anchor.addEventListener("click",async e=>{
      if(anchor.dataset.sofaId)return;
      e.preventDefault();e.stopPropagation();
      await openResolvedSofa(name,null,anchor);
    });
  }
  function placeLink(btn,a){
    let wrap=btn.parentElement;
    if(!wrap?.classList.contains("player-sofa-wrap")){
      wrap=document.createElement("div");wrap.className="player-sofa-wrap";
      btn.before(wrap);wrap.appendChild(btn);
    }
    wrap.appendChild(a);
  }
  function addCardLinks(){
    document.querySelectorAll(".player-card[data-player][data-team]").forEach(btn=>{
      if(btn.dataset.sofaLinked)return;btn.dataset.sofaLinked="1";
      const p=livePlayer(btn.dataset.team,btn.dataset.player);
      const name=p?.name||p?.shortName||btn.querySelector("strong")?.textContent||"Jugador";
      const sid=p?.provider==="ESPN"?null:btn.dataset.player;
      if(sid&&!btn.querySelector(".sofa-card-photo")){
        const img=document.createElement("img");img.className="sofa-card-photo";img.src=photo(sid);img.alt=name;img.loading="lazy";img.onerror=()=>img.remove();btn.prepend(img);
      }
      const a=document.createElement("a");a.className="player-sofa-card-link";a.target="_blank";a.rel="noopener";a.textContent="SofaScore ↗";
      attachDeferredLink(a,name,sid);placeLink(btn,a);
    });
  }
  function addFallbackLinks(){
    document.querySelectorAll(".fallback-player-card[data-fallback-player][data-fallback-team]").forEach(btn=>{
      if(btn.dataset.sofaLinked)return;btn.dataset.sofaLinked="1";
      const name=btn.querySelector(".pericos-player-copy strong")?.textContent?.trim()||btn.querySelector("strong")?.textContent?.trim()||"Jugador";
      const a=document.createElement("a");a.className="player-sofa-card-link fallback-sofa-link";a.target="_blank";a.rel="noopener";a.textContent="Buscar en SofaScore ↗";
      attachDeferredLink(a,name,null);placeLink(btn,a);
    });
  }
  async function decorateDetail(){
    if(!state.active)return;
    const root=document.getElementById("detail-content");if(!root)return;
    const hero=root.querySelector(".detail-hero,.pericos-player-detail");if(!hero||hero.dataset.sofaEnhanced)return;
    let {code,id,name,fallback}=state.active,p=!fallback?livePlayer(code,id):null;
    name=p?.name||p?.shortName||name||hero.querySelector("h2")?.textContent||"Jugador";
    let sid=!fallback&&p?.provider!=="ESPN"?id:null;
    if(!sid){const found=await resolveByName(name);sid=found?.id||null;}
    hero.dataset.sofaEnhanced="1";
    const target=hero.querySelector("div:last-child")||hero;
    if(sid&&!hero.querySelector(".sofa-player-photo")){
      const img=document.createElement("img");img.className="sofa-player-photo";img.src=photo(sid);img.alt=`${name} en SofaScore`;img.loading="lazy";img.onerror=()=>img.remove();hero.prepend(img);
    }
    const actions=document.createElement("div");actions.className="player-sofa-actions";
    actions.innerHTML=`<a class="sofa-primary" href="${esc(sofaUrl(name,sid))}" target="_blank" rel="noopener">${sid?"Ver ficha en SofaScore ↗":"Buscar en SofaScore ↗"}</a><a class="sofa-secondary" href="${esc(window.LIGA_DATA?.teams?.[code]?.official||"#")}" target="_blank" rel="noopener">Web oficial del club ↗</a>`;
    target.appendChild(actions);
  }
  document.addEventListener("click",e=>{
    const native=e.target.closest("[data-player][data-team]");if(native)state.active={code:native.dataset.team,id:native.dataset.player,name:native.querySelector("strong,b")?.textContent||"",fallback:false};
    const fb=e.target.closest("[data-fallback-player][data-fallback-team]");if(fb)state.active={code:fb.dataset.fallbackTeam,id:fb.dataset.fallbackPlayer,name:fb.querySelector("strong")?.textContent||"",fallback:true};
  },true);
  function patch(){addCardLinks();addFallbackLinks();decorateDetail();}
  async function init(){loadFallbacks();await load();patch();}
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
})();