(() => {
  'use strict';
  const D=window.LIGA_DATA||{}, teams=D.teams||{};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function host(code){
    try{return new URL(teams[code]?.official||'').hostname.replace(/^www\./,'');}catch(_){return '';}
  }
  function fallback(code){const h=host(code);return h?`https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=256`:'';}
  function add(parent,code,cls){
    if(!parent||!code||parent.querySelector(`img.${cls}`))return;
    const src=fallback(code); if(!src)return;
    const img=document.createElement('img');img.className=cls;img.src=src;img.alt=`Escudo de ${teams[code]?.name||code}`;img.loading='lazy';img.referrerPolicy='no-referrer';
    parent.prepend(img);
  }
  function patch(){
    document.querySelectorAll('.standing-row[data-team]').forEach(x=>add(x.querySelector('.club-cell'),x.dataset.team,'crest-guaranteed'));
    document.querySelectorAll('.team-card').forEach(card=>{const c=card.querySelector('[data-team]')?.dataset.team;const m=card.querySelector('.team-monogram');if(c&&m)add(m,c,'crest-guaranteed-card');});
    document.querySelectorAll('.match-teams [data-team],.big-match [data-team]').forEach(x=>add(x,x.dataset.team,'crest-guaranteed-match'));
    document.querySelectorAll('.stadium-card').forEach(card=>{const c=card.querySelector('[data-team]')?.dataset.team;add(card.querySelector('.stadium-badge'),c,'crest-guaranteed-card');});
    const hero=document.querySelector('#club-content .club-hero');if(hero){const name=hero.querySelector('h2')?.textContent?.trim();const code=Object.keys(teams).find(c=>[teams[c]?.name,teams[c]?.short].includes(name));if(code)add(hero.querySelector('.club-monogram'),code,'crest-guaranteed-hero');}
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',patch):patch();
  new MutationObserver(()=>requestAnimationFrame(patch)).observe(document.documentElement,{subtree:true,childList:true});
})();
