(() => {
  'use strict';
  const D=window.LIGA_DATA||{}, teams=D.teams||{};
  const $=id=>document.getElementById(id);
  const choices=['izq','centro','der'];
  let game={shots:0,goals:0,team:Object.keys(teams)[0]||'ESP',over:false};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function todayKey(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());}
  function loadBest(){try{return JSON.parse(localStorage.getItem('laliga-total-penalty-best')||'{}');}catch(_){return{};}}
  function saveBest(){const best=loadBest(),k=todayKey();best[k]=Math.max(Number(best[k]||0),game.goals);localStorage.setItem('laliga-total-penalty-best',JSON.stringify(best));}
  function teamName(c){return teams[c]?.short||teams[c]?.name||c;}
  function renderScore(){
    if($('game-score'))$('game-score').textContent=`${game.goals} goles · ${game.shots}/5 tiros`;
    const best=loadBest()[todayKey()]||0;if($('game-best'))$('game-best').textContent=`Récord de hoy: ${best}/5`;
  }
  function confetti(){const field=$('penalty-game');if(!field)return;for(let i=0;i<14;i++){const x=document.createElement('i');x.className='mini-confetti';x.style.setProperty('--x',`${Math.random()*100}%`);x.style.setProperty('--r',`${Math.random()*360}deg`);field.appendChild(x);setTimeout(()=>x.remove(),900);}}
  function shoot(side){
    if(game.over)return;
    const keeper=choices[Math.floor(Math.random()*choices.length)];
    const goal=side!==keeper;game.shots++;if(goal)game.goals++;
    const ball=$('game-ball'),gk=$('game-keeper'),msg=$('game-message');
    if(ball){ball.className=`game-ball shot-${side}`;setTimeout(()=>ball.className='game-ball',650);}
    if(gk){gk.className=`game-keeper dive-${keeper}`;setTimeout(()=>gk.className='game-keeper',650);}
    if(msg){msg.textContent=goal?`⚽ ¡GOOOL de ${teamName(game.team)}!`:`🧤 Parada del portero`;msg.className=`game-message ${goal?'goal':'saved'}`;}
    if(goal)confetti();
    if(game.shots>=5){game.over=true;saveBest();setTimeout(()=>{if(msg)msg.textContent=`Final: ${game.goals}/5 · ${game.goals>=4?'🔥 ¡Partidazo!':game.goals>=2?'👏 Buen intento':'💪 Toca remontar'}`;},700);}
    renderScore();
  }
  function reset(){game.shots=0;game.goals=0;game.over=false;if($('game-message')){$('game-message').textContent='Elige dónde chutar';$('game-message').className='game-message';}renderScore();}
  function init(){
    const sel=$('game-team');if(!sel)return;
    sel.innerHTML=Object.keys(teams).map(c=>`<option value="${c}">${esc(teamName(c))}</option>`).join('');
    if(teams.ESP)sel.value='ESP';game.team=sel.value;
    sel.addEventListener('change',()=>{game.team=sel.value;reset();});
    document.querySelectorAll('[data-shot]').forEach(b=>b.addEventListener('click',()=>shoot(b.dataset.shot)));
    $('game-reset')?.addEventListener('click',reset);
    $('game-share')?.addEventListener('click',async()=>{const text=`He marcado ${game.goals}/5 en el Reto de Penaltis de LALIGA TOTAL ⚽`;try{if(navigator.share)await navigator.share({title:'LALIGA TOTAL',text,url:location.href});else{await navigator.clipboard.writeText(`${text} ${location.href}`);$('game-message').textContent='Resultado copiado para compartir';}}catch(_){} });
    renderScore();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
