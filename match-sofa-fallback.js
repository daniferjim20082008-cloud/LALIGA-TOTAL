(() => {
  "use strict";
  const SEED=Array.isArray(window.LALIGA_MATCH_SEED)?window.LALIGA_MATCH_SEED:[];
  const BASES=["https://www.sofascore.com/api/v1","https://api.sofascore.com/api/v1"];
  let activeKey=null,timer=null,busy=false;
  const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const aliases={ALA:["deportivo alaves","alaves"],ATH:["athletic club","athletic bilbao"],ATM:["atletico madrid","atletico de madrid"],BAR:["barcelona","fc barcelona"],BET:["real betis","betis"],CEL:["celta vigo","rc celta","celta"],DEP:["deportivo la coruna","rc deportivo","deportivo"],ELC:["elche","elche cf"],ESP:["espanyol","rcd espanyol"],GET:["getafe","getafe cf"],LEV:["levante","levante ud"],MGA:["malaga","malaga cf"],OSA:["osasuna","ca osasuna"],RAC:["racing santander","racing de santander","real racing club"],RAY:["rayo vallecano","rayo"],RMA:["real madrid","real madrid cf"],RSO:["real sociedad"],SEV:["sevilla","sevilla fc"],VAL:["valencia","valencia cf"],VIL:["villarreal","villarreal cf"]};
  const aliasEntries=Object.entries(aliases).flatMap(([c,a])=>a.map(x=>[norm(x),c]));
  function codeFor(t={}){const vals=typeof t==="string"?[t]:[t.name,t.shortName,t.slug,t.nameCode];for(const v of vals){const n=norm(v);if(!n)continue;for(const [a,c] of aliasEntries)if(n===a||(n.length>=4&&(n.includes(a)||a.includes(n))))return c;}return null;}
  async function json(path){for(const base of BASES){try{const r=await fetch(base+path,{cache:"no-store",mode:"cors"});if(r.ok)return await r.json();}catch(_){}}return null;}
  function seedFor(key){const [,h,a]=String(key||"").split(":");return SEED.find(e=>e.home===h&&e.away===a)||null;}
  function madridDate(iso){const d=new Date(iso);if(Number.isNaN(d.getTime()))return null;const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const x={};parts.forEach(p=>x[p.type]=p.value);return `${x.year}-${x.month}-${x.day}`;}
  function statusText(type){type=String(type||"").toLowerCase();if(["finished","afterpenalties","afterextra"].includes(type))return"Finalizado";if(["inprogress","live"].includes(type))return"En directo";return"Información previa";}
  async function findEvent(key){
    const seed=seedFor(key);if(!seed?.kickoff)return null;const [,h,a]=key.split(":"),date=madridDate(seed.kickoff);if(!date)return null;
    const data=await json(`/sport/football/scheduled-events/${date}`);if(!data)return null;
    const events=data.events||[];
    return events.find(e=>codeFor(e.homeTeam)===h&&codeFor(e.awayTeam)===a)||null;
  }
  function scoreOf(v){return v?.current??v?.display??v?.normaltime??v??null;}
  function flattenStats(data){
    const out=[];for(const block of data?.statistics||[]){if(block.period&&block.period!=="ALL")continue;for(const group of block.groups||[])for(const s of group.statisticsItems||[])out.push({name:s.name||s.key||"Dato",key:norm(`${s.name||""} ${s.key||""}`),home:s.home??s.homeValue??"—",away:s.away??s.awayValue??"—"});if(out.length)break;}
    const priorities=["ball possession","possession","total shots","shots on target","corner kicks","corners","fouls","yellow cards","red cards","offsides","goalkeeper saves","saves","big chances"];
    const chosen=[],seen=new Set();for(const needle of priorities){const s=out.find(x=>x.key.includes(needle));if(s&&!seen.has(s.name)){seen.add(s.name);chosen.push(s);}}
    return (chosen.length?chosen:out).slice(0,16);
  }
  function flattenIncidents(data){
    const out=[];for(const i of data?.incidents||[]){const type=String(i.incidentType||"").toLowerCase();if(!["goal","card"].includes(type))continue;const cls=String(i.incidentClass||"").toLowerCase();const player=i.player?.shortName||i.player?.name||i.text||"Jugador";const assist=i.assist1?.shortName||i.assist1?.name||"";let icon="⚽",label="Gol";if(type==="card"){icon=cls.includes("red")?"🟥":"🟨";label=cls.includes("red")?"Tarjeta roja":"Tarjeta amarilla";}const minute=`${i.time??"—"}'${i.addedTime?`+${i.addedTime}`:""}`;out.push({minute,icon,text:`${label}: ${player}${assist?` · asistencia ${assist}`:""}`});}return out.slice(0,60);
  }
  function findBlock(root,title){return [...root.querySelectorAll(".real-block")].find(x=>x.querySelector("h3")?.textContent.includes(title));}
  function patchCards(key,event){
    const [,h,a]=key.split(":"),hs=scoreOf(event.homeScore),as=scoreOf(event.awayScore),type=event.status?.type;
    document.querySelectorAll(`.match-open[data-matchkey="${CSS.escape(key)}"]`).forEach(btn=>{const card=btn.closest(".match-card");if(!card)return;const score=card.querySelector(".match-teams strong");if(score&&hs!=null&&as!=null)score.textContent=`${hs} – ${as}`;if(String(type).toLowerCase()==="finished")card.classList.add("is-finished");});
  }
  function patchPanel(key,event,stats,inc){
    const root=document.getElementById("detail-content"),panel=root?.querySelector(".real-match-center");if(!panel)return;
    const hs=scoreOf(event.homeScore),as=scoreOf(event.awayScore),type=event.status?.type;
    const score=panel.querySelector(".real-score b");if(score&&hs!=null&&as!=null)score.textContent=`${hs} – ${as}`;
    const badge=panel.querySelector(".real-title b");if(badge)badge.textContent=statusText(type);
    const goals=findBlock(panel,"Goles y tarjetas");if(goals&&inc.length)goals.innerHTML=`<h3>⚽ Goles y tarjetas</h3><div class="real-timeline">${inc.map(x=>`<div><time>${esc(x.minute)}</time><span>${x.icon} ${esc(x.text)}</span></div>`).join("")}</div>`;
    const stat=findBlock(panel,"Estadísticas reales");if(stat&&stats.length)stat.innerHTML=`<h3>📊 Estadísticas reales</h3><div class="real-stats">${stats.map(s=>`<div><b>${esc(String(s.home))}</b><span>${esc(s.name)}</span><b>${esc(String(s.away))}</b></div>`).join("")}</div>`;
    let source=panel.querySelector(".real-source");if(source&&!source.textContent.includes("SofaScore"))source.textContent+=" · Respaldo de detalle: SofaScore cuando está disponible.";
    patchCards(key,event);
  }
  async function refresh(){
    if(!activeKey||busy)return;busy=true;
    try{
      const event=await findEvent(activeKey);if(!event?.id)return;
      const [statsData,incData]=await Promise.all([json(`/event/${event.id}/statistics`),json(`/event/${event.id}/incidents`)]);
      patchPanel(activeKey,event,flattenStats(statsData||{}),flattenIncidents(incData||{}));
    }finally{busy=false;}
  }
  document.addEventListener("click",e=>{const b=e.target.closest(".match-open[data-matchkey],.fixture-open[data-matchkey]");if(!b)return;activeKey=b.dataset.matchkey;clearInterval(timer);setTimeout(refresh,500);timer=setInterval(refresh,60000);},true);
})();