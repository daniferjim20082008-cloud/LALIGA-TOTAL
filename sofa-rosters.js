(() => {
  "use strict";
  const D=window.LIGA_DATA||{};
  const teams=D.teams||{};
  const BASES=["https://www.sofascore.com/api/v1","https://api.sofascore.com/api/v1"];
  const SOFA="https://www.sofascore.com";
  const cache={teamIds:{},rosters:{},searching:new Set()};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const slug=s=>norm(s).replace(/\s+/g,"-")||"jugador";
  const playerUrl=p=>`${SOFA}/es/football/player/${slug(p.name||p.shortName)}/${p.id}`;
  const playerPhoto=id=>`https://img.sofascore.com/api/v1/player/${id}/image`;
  const pos=v=>({G:"POR",D:"DEF",M:"MED",F:"DEL"}[String(v||"").toUpperCase()]||String(v||"—").slice(0,3).toUpperCase());
  function codeFromHero(){
    const h=document.querySelector("#club-content .club-hero h2");if(!h)return null;
    const n=norm(h.textContent);
    return Object.keys(teams).find(c=>[teams[c]?.name,teams[c]?.short].filter(Boolean).some(x=>norm(x)===n))||null;
  }
  async function json(path){
    for(const base of BASES){
      try{const r=await fetch(base+path,{cache:"no-store",mode:"cors"});if(r.ok)return await r.json();}catch(_){}
    }
    return null;
  }
  function collectNamed(root){
    const out=[],seen=new Set();
    const walk=x=>{
      if(!x)return;
      if(Array.isArray(x)){x.forEach(walk);return;}
      if(typeof x!=="object")return;
      if(x.id&&(x.name||x.shortName||x.slug)){
        const k=String(x.id);if(!seen.has(k)){seen.add(k);out.push(x);}
      }
      Object.values(x).forEach(v=>{if(v&&typeof v==="object")walk(v);});
    };
    walk(root);return out;
  }
  async function teamId(code){
    if(cache.teamIds[code])return cache.teamIds[code];
    const t=teams[code]||{},queries=[t.name,t.short].filter(Boolean);
    for(const q of queries){
      const data=await json(`/search/all?q=${encodeURIComponent(q)}`);if(!data)continue;
      const target=norm(t.name||t.short),short=norm(t.short||t.name);
      const candidates=collectNamed(data);
      const best=candidates.find(x=>{const n=norm(x.name||x.shortName);return n===target||n===short;})
        ||candidates.find(x=>{const n=norm(x.name||x.shortName);return target.includes(n)||n.includes(target);});
      if(best?.id){cache.teamIds[code]=String(best.id);return cache.teamIds[code];}
    }
    return null;
  }
  function normalizePlayers(data){
    const raw=[];
    const source=data?.players||data?.squad||data?.team?.players||[];
    for(const item of source){
      const p=item?.player||item;if(!p?.id)continue;
      const country=p.country||{};
      raw.push({
        id:String(p.id),name:p.name||p.shortName||"Jugador",shortName:p.shortName||p.name||"Jugador",
        number:p.jerseyNumber||item.jerseyNumber||item.shirtNumber||"",position:p.position||item.position||"—",
        country:country.name||country.alpha2||"",height:p.height||"",dob:p.dateOfBirthTimestamp||null,
        photo:playerPhoto(p.id),sofa:playerUrl(p)
      });
    }
    return raw;
  }
  async function roster(code){
    if(cache.rosters[code])return cache.rosters[code];
    const id=await teamId(code);if(!id)return[];
    const data=await json(`/team/${encodeURIComponent(id)}/players`);if(!data)return[];
    const players=normalizePlayers(data);if(players.length)cache.rosters[code]=players;return players;
  }
  function card(code,p){
    return `<article class="sofa-roster-card" data-sofa-player="${esc(p.id)}" data-sofa-team="${code}"><div class="pericos-player-number">${esc(p.number||"—")}</div><button class="sofa-player-open" type="button"><span class="pericos-player-photo"><img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'"></span><span class="pericos-player-copy"><small>${esc(pos(p.position))}</small><strong>${esc(p.shortName)}</strong><em>Ver ficha →</em></span></button><a class="player-sofa-card-link" href="${esc(p.sofa)}" target="_blank" rel="noopener">SofaScore ↗</a></article>`;
  }
  function age(ts){if(!ts)return null;const d=new Date(Number(ts)*1000);return Number.isNaN(d.getTime())?null:Math.floor((Date.now()-d.getTime())/31557600000);}
  function showPlayer(code,id){
    const p=(cache.rosters[code]||[]).find(x=>String(x.id)===String(id));if(!p)return;
    const root=document.getElementById("detail-content"),page=document.getElementById("detail-page");if(!root||!page)return;
    const a=age(p.dob),t=teams[code]||{};
    root.innerHTML=`<button class="back-btn sofa-roster-back">← Volver al equipo</button><div class="pericos-player-detail sofa-roster-detail"><div class="pericos-player-portrait"><img src="${esc(p.photo)}" alt="${esc(p.name)}" onerror="this.style.display='none'"><b>${esc(p.number||"—")}</b></div><div><span class="eyebrow">${esc(t.name||code)}</span><h2>${esc(p.name)}</h2><p>${esc(pos(p.position))}${p.country?` · ${esc(p.country)}`:""}${a!=null?` · ${a} años`:""}${p.height?` · ${esc(String(p.height))} cm`:""}</p><div class="player-profile-facts"><span><small>Dorsal</small><b>${esc(p.number||"—")}</b></span><span><small>Posición</small><b>${esc(pos(p.position))}</b></span><span><small>Equipo</small><b>${esc(t.short||t.name||code)}</b></span></div><div class="player-sofa-actions"><a class="sofa-primary" href="${esc(p.sofa)}" target="_blank" rel="noopener">Ver ficha en SofaScore ↗</a><a class="sofa-secondary" href="${esc(t.official||"#")}" target="_blank" rel="noopener">Web oficial del club ↗</a></div></div></div><p class="detail-note">Ficha cargada desde el respaldo de SofaScore cuando está disponible. Las estadísticas oficiales pueden variar hasta la siguiente actualización.</p>`;
    document.querySelectorAll("main > section").forEach(s=>s.hidden=s!==page);page.hidden=false;scrollTo({top:0,behavior:"smooth"});
    root.querySelector(".sofa-roster-back")?.addEventListener("click",()=>document.querySelector(`#teams [data-team="${code}"]`)?.click());
  }
  async function patch(){
    const code=codeFromHero();if(!code||cache.searching.has(code))return;
    const panel=[...document.querySelectorAll("#club-content .club-panel")].find(p=>p.querySelector("h3")?.textContent.includes("Plantilla"));if(!panel)return;
    if(panel.querySelector(".player-card,.fallback-player-card,.sofa-roster-card"))return;
    cache.searching.add(code);
    const players=await roster(code);cache.searching.delete(code);
    if(!players.length||panel.querySelector(".player-card,.fallback-player-card,.sofa-roster-card"))return;
    panel.innerHTML=`<div class="panel-head"><h3>👥 Plantilla y fichas individuales</h3><span>${players.length} jugadores · respaldo SofaScore</span></div><div class="pericos-player-grid sofa-roster-grid">${players.map(p=>card(code,p)).join("")}</div>`;
  }
  document.addEventListener("click",e=>{const b=e.target.closest(".sofa-player-open");if(!b)return;const card=b.closest("[data-sofa-player]");if(card)showPlayer(card.dataset.sofaTeam,card.dataset.sofaPlayer);});
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",patch):patch();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
})();