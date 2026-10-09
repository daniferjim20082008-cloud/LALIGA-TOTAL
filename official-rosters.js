(() => {
  'use strict';
  const D=window.LIGA_DATA||{}, teams=D.teams||{};
  let data={clubs:{}}, activeCode=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function codeFromHero(){
    const h=document.querySelector('#club-content .club-hero h2');if(!h)return null;
    const n=norm(h.textContent);
    return Object.keys(teams).find(c=>[teams[c]?.name,teams[c]?.short].filter(Boolean).some(v=>norm(v)===n))||null;
  }
  function pos(v){return ({POR:'POR',DEF:'DEF',MED:'MED',DEL:'DEL'}[String(v||'').toUpperCase()]||String(v||'—').slice(0,3).toUpperCase());}
  function card(code,p){
    const photo=p.photo?`<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'">`:`<span class="official-player-initial">${esc((p.name||'?').slice(0,1))}</span>`;
    return `<article class="official-roster-card" data-official-player="${esc(p.id)}" data-official-team="${code}"><div class="pericos-player-number">${esc(p.jerseyNumber||'—')}</div><button class="official-player-open" type="button"><span class="pericos-player-photo">${photo}</span><span class="pericos-player-copy"><small>${esc(pos(p.position))}</small><strong>${esc(p.shortName||p.name)}</strong><em>Ver ficha →</em></span></button><a class="player-sofa-card-link" href="${esc(p.sofaSearch||'https://www.sofascore.com/es/') }" target="_blank" rel="noopener">SofaScore ↗</a></article>`;
  }
  function updateTeamCounts(){
    document.querySelectorAll('.team-card').forEach(card=>{
      const code=card.querySelector('[data-team]')?.dataset.team, count=data.clubs?.[code]?.players?.length;if(!count)return;
      const slots=card.querySelectorAll('.team-numbers span');if(slots[2]){const b=slots[2].querySelector('b');if(b)b.textContent=String(count);}
    });
  }
  function patchClub(){
    const code=codeFromHero();if(!code)return;activeCode=code;
    const club=data.clubs?.[code], players=club?.players||[];if(!players.length)return;
    const panel=[...document.querySelectorAll('#club-content .club-panel')].find(p=>p.querySelector('h3')?.textContent.includes('Plantilla'));
    if(!panel||panel.querySelector('.player-card,.fallback-player-card,.sofa-roster-card,.official-roster-card'))return;
    panel.innerHTML=`<div class="panel-head"><h3>👥 Plantilla oficial 2026/27</h3><span>${players.length} jugadores · LALIGA oficial</span></div><div class="pericos-player-grid official-roster-grid">${players.map(p=>card(code,p)).join('')}</div><p class="detail-note">Plantilla cacheada desde la página oficial de LALIGA. Cada jugador tiene ficha interna y acceso a SofaScore.</p>`;
  }
  function showPlayer(code,id){
    const club=data.clubs?.[code], p=(club?.players||[]).find(x=>String(x.id)===String(id));if(!p)return;
    const root=document.getElementById('detail-content'), page=document.getElementById('detail-page');if(!root||!page)return;
    const photo=p.photo?`<img src="${esc(p.photo)}" alt="${esc(p.name)}" onerror="this.style.display='none'">`:`<span class="official-player-detail-initial">${esc((p.name||'?').slice(0,1))}</span>`;
    root.innerHTML=`<button class="back-btn official-roster-back">← Volver al equipo</button><div class="pericos-player-detail official-roster-detail"><div class="pericos-player-portrait">${photo}<b>${esc(p.jerseyNumber||'—')}</b></div><div><span class="eyebrow">${esc(teams[code]?.name||code)} · plantilla oficial</span><h2>${esc(p.name)}</h2><p>${esc(pos(p.position))}${p.country?` · ${esc(p.country)}`:''}</p><div class="player-profile-facts"><span><small>Dorsal</small><b>${esc(p.jerseyNumber||'—')}</b></span><span><small>Posición</small><b>${esc(pos(p.position))}</b></span><span><small>Nacimiento</small><b>${esc(p.birth||'—')}</b></span><span><small>Altura</small><b>${esc(p.height||'—')}</b></span><span><small>Peso</small><b>${esc(p.weight||'—')}</b></span></div><div class="player-sofa-actions"><a class="sofa-primary" href="${esc(p.sofaSearch||'https://www.sofascore.com/es/') }" target="_blank" rel="noopener">Buscar en SofaScore ↗</a><a class="sofa-secondary" href="${esc(club.url||p.official||'#')}" target="_blank" rel="noopener">Plantilla oficial LALIGA ↗</a></div></div></div><p class="detail-note">Los datos personales proceden de la plantilla oficial de LALIGA. Las estadísticas avanzadas se intentan completar con SofaScore cuando el proveedor está disponible.</p>`;
    document.querySelectorAll('main > section').forEach(s=>s.hidden=s!==page);page.hidden=false;scrollTo({top:0,behavior:'smooth'});
    root.querySelector('.official-roster-back')?.addEventListener('click',()=>document.querySelector(`#teams [data-team="${code}"]`)?.click());
  }
  async function load(){try{const r=await fetch(`rosters-data.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok)data=await r.json();}catch(_){}updateTeamCounts();patchClub();}
  document.addEventListener('click',e=>{const p=e.target.closest('[data-official-player]');if(p){e.preventDefault();showPlayer(p.dataset.officialTeam,p.dataset.officialPlayer);}},true);
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',load):load();
  new MutationObserver(()=>requestAnimationFrame(()=>{updateTeamCounts();patchClub();})).observe(document.documentElement,{subtree:true,childList:true});
})();
