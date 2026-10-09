(() => {
  "use strict";
  const D = window.LIGA_DATA || {};
  const teams = D.teams || {};
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1";
  const cache = {ids:{}, logos:{}, rosters:{}, ready:false, failed:false};
  let activeTeam = null;

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const aliases={
    ALA:["deportivo alaves","alaves"],ATH:["athletic club","athletic bilbao"],ATM:["atletico madrid","atletico de madrid"],BAR:["barcelona","fc barcelona"],BET:["real betis","real betis balompie","betis"],CEL:["celta vigo","rc celta","celta","celta de vigo"],DEP:["deportivo la coruna","deportivo de la coruna","rc deportivo","deportivo"],ELC:["elche","elche cf"],ESP:["espanyol","rcd espanyol","espanyol barcelona"],GET:["getafe","getafe cf"],LEV:["levante","levante ud"],MGA:["malaga","malaga cf"],OSA:["osasuna","ca osasuna"],RAC:["racing santander","racing de santander","real racing club","racing club"],RAY:["rayo vallecano","rayo"],RMA:["real madrid","real madrid cf"],RSO:["real sociedad","real sociedad san sebastian"],SEV:["sevilla","sevilla fc"],VAL:["valencia","valencia cf"],VIL:["villarreal","villarreal cf"]
  };
  const aliasEntries=Object.entries(aliases).flatMap(([code,list])=>list.map(x=>[norm(x),code]));
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
  function logoOf(t){return t?.logos?.[0]?.href||t?.logo||"";}
  function photoOf(p){return p?.headshot?.href||p?.headshot||p?.photo||`https://a.espncdn.com/i/headshots/soccer/players/full/${p?.id}.png`;}
  function position(p,group){const x=p?.position;return (typeof x==="object"?(x.abbreviation||x.displayName||x.name):x)||group||"—";}
  function positionShort(v){const n=norm(v);if(n.includes("goal")||n==="gk")return"POR";if(n.includes("def")||/^(cb|lb|rb|df)$/.test(n))return"DEF";if(n.includes("mid")||/^(cm|dm|am|mf)$/.test(n))return"MED";if(n.includes("for")||n.includes("striker")||n.includes("wing")||/^(fw|st|lw|rw)$/.test(n))return"DEL";return String(v||"—").slice(0,3).toUpperCase();}
  function flattenRoster(data){const out=[];for(const g of data?.athletes||[]){if(Array.isArray(g?.items)){for(const p of g.items)out.push(normalizePlayer(p,g.position||g.name));}else if(g&&typeof g==="object")out.push(normalizePlayer(g,null));}return out.filter(p=>p.id);}
  function normalizePlayer(p,group){let country=p.citizenship||p.nationality||p.country||"";if(country&&typeof country==="object")country=country.name||country.displayName||country.abbreviation||"";return{id:String(p.id||""),name:p.fullName||p.displayName||p.shortName||"Jugador",shortName:p.shortName||p.displayName||p.fullName||"Jugador",number:p.jersey||p.jerseyNumber||"",position:position(p,group),country,height:p.displayHeight||p.height||"",dob:p.dateOfBirth||"",photo:photoOf(p)};}

  async function fetchJSON(url){const r=await fetch(url,{cache:"no-store",mode:"cors"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
  async function loadTeams(){if(cache.ready||cache.failed)return;try{const data=await fetchJSON(`${ESPN}/teams`);for(const sport of data.sports||[])for(const league of sport.leagues||[])for(const item of league.teams||[]){const t=item.team||item,c=codeFor(t);if(!c)continue;cache.ids[c]=t.id;cache.logos[c]=logoOf(t);}cache.ready=Object.keys(cache.ids).length>=18;decorateCrests();}catch(e){cache.failed=true;console.warn("LALIGA TOTAL: no se pudo cargar ESPN en cliente",e);}}
  async function roster(code){if(cache.rosters[code])return cache.rosters[code];await loadTeams();const id=cache.ids[code];if(!id)return[];try{const data=await fetchJSON(`${ESPN}/teams/${encodeURIComponent(id)}/roster?limit=100`);return cache.rosters[code]=flattenRoster(data);}catch(e){console.warn("Plantilla no disponible",code,e);return[];}}

  function crest(code){return cache.logos[code]||"";}
  function addImg(parent,code,cls){if(!parent||parent.querySelector(`img.${cls}`)||!crest(code))return;const img=document.createElement("img");img.className=cls;img.src=crest(code);img.alt=`Escudo de ${teams[code]?.short||teams[code]?.name||code}`;img.loading="lazy";img.onerror=()=>img.remove();parent.prepend(img);}
  function decorateCrests(){document.querySelectorAll(".standing-row[data-team]").forEach(x=>addImg(x.querySelector(".club-cell"),x.dataset.team,"crest-mini"));document.querySelectorAll(".team-card").forEach(card=>{const c=card.querySelector("[data-team]")?.dataset.team,m=card.querySelector(".team-monogram");if(c&&m&&crest(c)&&!m.querySelector("img"))m.innerHTML=`<img src="${crest(c)}" alt="Escudo" loading="lazy"><span>${c}</span>`;});document.querySelectorAll(".stadium-card").forEach(card=>{const c=card.querySelector("[data-team]")?.dataset.team,b=card.querySelector(".stadium-badge");if(c&&b&&crest(c)&&!b.querySelector("img"))b.innerHTML=`<img src="${crest(c)}" alt="Escudo" loading="lazy"><span>${c}</span>`;});document.querySelectorAll(".match-teams [data-team],.big-match [data-team]").forEach(x=>addImg(x,x.dataset.team,"crest-match"));const hero=document.querySelector("#club-content .club-hero");if(hero&&activeTeam){const m=hero.querySelector(".club-monogram");if(m&&crest(activeTeam)&&!m.querySelector("img"))m.innerHTML=`<img src="${crest(activeTeam)}" alt="Escudo de ${esc(teams[activeTeam]?.name||activeTeam)}"><span>${activeTeam}</span>`;}}
  }

  function playerCard(code,p){return `<button class="fallback-player-card" data-fallback-player="${esc(p.id)}" data-fallback-team="${code}"><span class="pericos-player-number">${esc(p.number||"—")}</span><span class="pericos-player-photo"><img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'"></span><span class="pericos-player-copy"><small>${esc(positionShort(p.position))}</small><strong>${esc(p.shortName)}</strong><em>Ver ficha →</em></span></button>`;}
  async function patchClubRoster(){const h=document.querySelector("#club-content .club-hero h2");if(!h)return;const n=norm(h.textContent),code=Object.keys(teams).find(c=>[teams[c]?.name,teams[c]?.short].some(v=>norm(v)===n))||activeTeam;if(!code)return;activeTeam=code;decorateCrests();const panel=[...document.querySelectorAll("#club-content .club-panel")].find(p=>p.querySelector("h3")?.textContent.includes("Plantilla y estadísticas"));if(!panel||panel.dataset.clientRoster==="loading"||panel.dataset.clientRoster==="done")return;const existing=panel.querySelectorAll(".player-card").length;if(existing){panel.dataset.clientRoster="done";return;}panel.dataset.clientRoster="loading";const players=await roster(code);if(!players.length){panel.dataset.clientRoster="";return;}panel.dataset.clientRoster="done";panel.innerHTML=`<div class="panel-head"><h3>👥 Plantilla</h3><span>${players.length} jugadores · ficha estilo Pericos 1900</span></div><div class="pericos-player-grid">${players.map(p=>playerCard(code,p)).join("")}</div>`;decorateCrests();}

  function age(dob){if(!dob)return null;const d=new Date(dob);if(Number.isNaN(d.getTime()))return null;return Math.floor((Date.now()-d.getTime())/31557600000);}
  function showPlayer(code,id){const p=(cache.rosters[code]||[]).find(x=>String(x.id)===String(id));if(!p)return;const detail=document.getElementById("detail-content"),page=document.getElementById("detail-page");if(!detail||!page)return;const a=age(p.dob),logo=crest(code);detail.innerHTML=`<button class="back-btn client-player-back">← Volver al equipo</button><div class="pericos-player-detail"><div class="pericos-player-portrait"><img src="${esc(p.photo)}" alt="${esc(p.name)}" onerror="this.style.display='none'"><b>${esc(p.number||"—")}</b></div><div>${logo?`<img class="player-team-crest" src="${esc(logo)}" alt="Escudo">`:""}<span class="eyebrow">${esc(teams[code]?.name||code)}</span><h2>${esc(p.name)}</h2><p>${esc(positionShort(p.position))}${p.country?` · ${esc(p.country)}`:""}${a!=null?` · ${a} años`:""}${p.height?` · ${esc(p.height)}`:""}</p><div class="player-profile-facts"><span><small>Dorsal</small><b>${esc(p.number||"—")}</b></span><span><small>Posición</small><b>${esc(positionShort(p.position))}</b></span><span><small>Equipo</small><b>${esc(teams[code]?.short||teams[code]?.name||code)}</b></span></div></div></div><p class="detail-note">Ficha de plantilla cargada automáticamente. La disponibilidad de foto, altura o nacionalidad depende de los datos publicados por el proveedor.</p>`;document.querySelectorAll("main > section").forEach(s=>s.hidden=s!==page);page.hidden=false;window.scrollTo({top:0,behavior:"smooth"});detail.querySelector(".client-player-back")?.addEventListener("click",()=>{document.querySelector(`#teams [data-team="${code}"]`)?.click();});}

  document.addEventListener("click",e=>{const team=e.target.closest("[data-team]");if(team?.dataset.team)activeTeam=team.dataset.team;const player=e.target.closest("[data-fallback-player]");if(player){e.preventDefault();showPlayer(player.dataset.fallbackTeam,player.dataset.fallbackPlayer);}},true);
  async function refresh(){await loadTeams();decorateCrests();patchClubRoster();}
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",refresh):refresh();
  new MutationObserver(()=>requestAnimationFrame(()=>{decorateCrests();patchClubRoster();})).observe(document.documentElement,{subtree:true,childList:true});
})();
