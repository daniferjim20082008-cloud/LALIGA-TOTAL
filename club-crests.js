(() => {
  'use strict';
  const D=window.LIGA_DATA||{}, teams=D.teams||{};
  let official={clubs:{}};
  function host(code){
    try{return new URL(teams[code]?.official||'').hostname.replace(/^www\./,'');}catch(_){return '';}
  }
  function fallback(code){const h=host(code);return h?`https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=256`:'';}
  function source(code){return official.clubs?.[code]?.crest||fallback(code);}
  function add(parent,code,cls){
    if(!parent||!code)return;
    const src=source(code); if(!src)return;
    let img=parent.querySelector(`img.${cls}`);
    if(!img){img=document.createElement('img');img.className=cls;img.alt=`Escudo de ${teams[code]?.name||code}`;img.loading='lazy';img.referrerPolicy='no-referrer';parent.prepend(img);}
    if(img.src!==src)img.src=src;
    img.onerror=()=>{const fb=fallback(code);if(fb&&img.src!==fb)img.src=fb;};
  }
  function patch(){
    document.querySelectorAll('.standing-row[data-team]').forEach(x=>add(x.querySelector('.club-cell'),x.dataset.team,'crest-guaranteed'));
    document.querySelectorAll('.team-card').forEach(card=>{const c=card.querySelector('[data-team]')?.dataset.team;const m=card.querySelector('.team-monogram');if(c&&m)add(m,c,'crest-guaranteed-card');});
    document.querySelectorAll('.match-teams [data-team],.big-match [data-team]').forEach(x=>add(x,x.dataset.team,'crest-guaranteed-match'));
    document.querySelectorAll('.stadium-card').forEach(card=>{const c=card.querySelector('[data-team]')?.dataset.team;add(card.querySelector('.stadium-badge'),c,'crest-guaranteed-card');});
    const hero=document.querySelector('#club-content .club-hero');if(hero){const name=hero.querySelector('h2')?.textContent?.trim();const code=Object.keys(teams).find(c=>[teams[c]?.name,teams[c]?.short].includes(name));if(code)add(hero.querySelector('.club-monogram'),code,'crest-guaranteed-hero');}
  }
  async function init(){
    try{const r=await fetch(`rosters-data.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok)official=await r.json();}catch(_){}
    patch();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
})();
