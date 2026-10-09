(() => {
  "use strict";
  // Respaldo calculado con los 69 partidos finalizados de LaLiga 2026/27
  // disponibles disponibles en la fuente consultada hasta el 20 de septiembre de 2026. La capa en vivo tiene prioridad.
  const FALLBACK = {
    ALA:{home:{p:4,w:3,d:0,l:1,gf:9,ga:3,pts:9},away:{p:3,w:0,d:2,l:1,gf:2,ga:3,pts:2}},
    ATH:{home:{p:4,w:1,d:2,l:1,gf:5,ga:4,pts:5},away:{p:2,w:1,d:0,l:1,gf:2,ga:2,pts:3}},
    ATM:{home:{p:4,w:3,d:1,l:0,gf:10,ga:3,pts:10},away:{p:3,w:2,d:0,l:1,gf:6,ga:4,pts:6}},
    BET:{home:{p:3,w:3,d:0,l:0,gf:3,ga:0,pts:9},away:{p:4,w:2,d:1,l:1,gf:6,ga:7,pts:7}},
    CEL:{home:{p:4,w:1,d:1,l:2,gf:7,ga:5,pts:4},away:{p:3,w:0,d:3,l:0,gf:1,ga:1,pts:3}},
    DEP:{home:{p:4,w:1,d:2,l:1,gf:5,ga:4,pts:5},away:{p:3,w:1,d:2,l:0,gf:5,ga:4,pts:5}},
    ELC:{home:{p:3,w:0,d:0,l:3,gf:4,ga:11,pts:0},away:{p:4,w:1,d:2,l:1,gf:7,ga:6,pts:5}},
    ESP:{home:{p:4,w:1,d:1,l:2,gf:6,ga:6,pts:4},away:{p:3,w:1,d:0,l:2,gf:4,ga:4,pts:3}},
    BAR:{home:{p:3,w:3,d:0,l:0,gf:14,ga:4,pts:9},away:{p:4,w:4,d:0,l:0,gf:17,ga:3,pts:12}},
    GET:{home:{p:4,w:2,d:2,l:0,gf:4,ga:2,pts:8},away:{p:3,w:0,d:0,l:3,gf:0,ga:5,pts:0}},
    LEV:{home:{p:2,w:1,d:0,l:1,gf:7,ga:6,pts:3},away:{p:4,w:0,d:2,l:2,gf:1,ga:6,pts:2}},
    MGA:{home:{p:3,w:0,d:2,l:1,gf:2,ga:4,pts:2},away:{p:4,w:0,d:1,l:3,gf:1,ga:8,pts:1}},
    OSA:{home:{p:4,w:1,d:2,l:1,gf:2,ga:3,pts:5},away:{p:3,w:1,d:0,l:2,gf:4,ga:10,pts:3}},
    RAC:{home:{p:3,w:2,d:1,l:0,gf:7,ga:5,pts:7},away:{p:4,w:0,d:0,l:4,gf:4,ga:16,pts:0}},
    RAY:{home:{p:3,w:2,d:1,l:0,gf:6,ga:4,pts:7},away:{p:4,w:0,d:1,l:3,gf:5,ga:12,pts:1}},
    RMA:{home:{p:3,w:3,d:0,l:0,gf:12,ga:2,pts:9},away:{p:4,w:2,d:0,l:2,gf:6,ga:6,pts:6}},
    RSO:{home:{p:3,w:1,d:1,l:1,gf:2,ga:4,pts:4},away:{p:4,w:2,d:0,l:2,gf:7,ga:9,pts:6}},
    SEV:{home:{p:4,w:2,d:0,l:2,gf:5,ga:7,pts:6},away:{p:3,w:2,d:1,l:0,gf:5,ga:2,pts:7}},
    VAL:{home:{p:4,w:0,d:1,l:3,gf:2,ga:9,pts:1},away:{p:3,w:1,d:0,l:2,gf:2,ga:4,pts:3}},
    VIL:{home:{p:3,w:1,d:0,l:2,gf:6,ga:6,pts:3},away:{p:4,w:1,d:2,l:1,gf:7,ga:6,pts:5}}
  };
  window.LALIGA_HOME_AWAY_FALLBACK = FALLBACK;

  const names = () => window.LIGA_DATA?.teams || {};
  const splitHTML = (title,s,cls) => `<div class="split-card ${cls}"><strong>${title}</strong><b>${s.pts} pts</b><small>${s.p} PJ · ${s.w}V ${s.d}E ${s.l}D · ${s.gf}-${s.ga}</small></div>`;
  function patchTable(){
    const root=document.getElementById("home-away-table"); if(!root) return;
    const text=root.textContent||"";
    if(!text.includes("próxima actualización") && root.querySelector(".ha-row:not(.ha-head)")) return;
    const teams=names();
    const standings=window.LIGA_DATA?.standings||[]; const pos={}; standings.forEach((r,i)=>pos[r[0]]=i+1);
    const rows=Object.keys(FALLBACK).sort((a,b)=>(pos[a]||99)-(pos[b]||99));
    root.innerHTML=`<div class="ha-row ha-head"><span>#</span><span>Equipo</span><span>PJ casa</span><span>Pts casa</span><span>PJ fuera</span><span>Pts fuera</span><span>Total</span></div>`+rows.map(code=>{const h=FALLBACK[code].home,a=FALLBACK[code].away,t=teams[code]||{};return `<button class="ha-row" data-fallback-team="${code}"><span>${pos[code]||'—'}</span><span class="ha-team"><i>${code}</i><b>${t.short||t.name||code}</b></span><span>${h.p}</span><strong>${h.pts}</strong><span>${a.p}</span><strong>${a.pts}</strong><b>${h.pts+a.pts}</b></button>`}).join("");
    root.querySelectorAll("[data-fallback-team]").forEach(b=>b.addEventListener("click",()=>document.querySelector(`#teams [data-team="${b.dataset.fallbackTeam}"]`)?.click()));
  }
  function patchClub(){
    const h=document.querySelector("#club-content .club-hero h2"); if(!h)return;
    const teams=names(); const n=h.textContent.trim().toLowerCase(); const code=Object.keys(teams).find(c=>[teams[c]?.name,teams[c]?.short].filter(Boolean).some(x=>x.toLowerCase()===n)); if(!code||!FALLBACK[code])return;
    const panel=[...document.querySelectorAll("#club-content .club-panel")].find(p=>p.querySelector("h3")?.textContent.includes("Rendimiento local")); if(!panel)return;
    const current=[...panel.querySelectorAll(".split-card b")].map(x=>x.textContent.trim());
    if(current.length && current.some(x=>!x.startsWith("0 pts"))) return;
    panel.innerHTML=`<h3>🏠 Rendimiento local / visitante</h3><p class="split-intro">Puntos reales conseguidos esta temporada según los partidos finalizados.</p><div class="split-grid">${splitHTML('Como local',FALLBACK[code].home,'home')}${splitHTML('Como visitante',FALLBACK[code].away,'away')}</div>`;
  }
  function patch(){patchTable();patchClub();}
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",patch):patch();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
})();
