(() => {
  "use strict";

  const D = window.LIGA_DATA || {};
  const teams = D.teams || {};
  let live = { events: [], teamIds: {}, teamLogos: {}, squads: {}, teamExtras: {} };
  let lastPlayer = null;
  let lastTeam = null;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const teamName = code => teams[code]?.short || teams[code]?.name || code;
  const finished = e => e && e.homeScore != null && e.awayScore != null;
  const crestUrl = code => live.teamLogos?.[code] || (live.teamIds?.[code] ? `https://api.sofascore.app/api/v1/team/${live.teamIds[code]}/image` : "");
  const playerById = (code,id) => (live.squads?.[code] || []).find(p => String(p.id) === String(id));
  const playerPhoto = (id,code) => playerById(code,id)?.photo || (id ? `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png` : "");

  function calcSplit(code) {
    const split = {
      home: {p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0},
      away: {p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}
    };
    (live.events || []).filter(finished).forEach(e => {
      if (e.home !== code && e.away !== code) return;
      const side = e.home === code ? "home" : "away";
      const s = split[side];
      const gf = side === "home" ? Number(e.homeScore) : Number(e.awayScore);
      const ga = side === "home" ? Number(e.awayScore) : Number(e.homeScore);
      s.p += 1; s.gf += gf; s.ga += ga;
      if (gf > ga) { s.w += 1; s.pts += 3; }
      else if (gf === ga) { s.d += 1; s.pts += 1; }
      else s.l += 1;
    });
    return split;
  }

  function splitFor(code) {
    const cached = live.teamExtras?.[code]?.split;
    const computed = calcSplit(code);
    if (!cached) return computed;
    const useful = (cached.home?.p || 0) + (cached.away?.p || 0) > 0;
    return useful ? cached : computed;
  }

  function renderHomeAway() {
    const root = document.getElementById("home-away-table");
    if (!root) return;
    const position = {};
    const standings = Array.isArray(live.standings) && live.standings.length ? live.standings : (D.standings || []);
    standings.forEach((r,i) => position[r[0]] = i + 1);
    const rows = Object.keys(teams).map(code => ({ code, split: splitFor(code), pos: position[code] || 99 }))
      .sort((a,b) => a.pos - b.pos);
    const anyGames = rows.some(r => (r.split.home.p + r.split.away.p) > 0);
    if (!anyGames) {
      root.innerHTML = `<div class="ha-empty">Los puntos de casa y fuera se cargarán en la próxima actualización automática.</div>`;
      return;
    }
    root.innerHTML = `<div class="ha-row ha-head"><span>#</span><span>Equipo</span><span>PJ casa</span><span>Pts casa</span><span>PJ fuera</span><span>Pts fuera</span><span>Total</span></div>` + rows.map(r => {
      const h = r.split.home, a = r.split.away;
      const crest = crestUrl(r.code);
      return `<button class="ha-row" data-open-team="${r.code}"><span>${r.pos === 99 ? "—" : r.pos}</span><span class="ha-team">${crest ? `<img src="${crest}" alt="Escudo de ${esc(teamName(r.code))}" loading="lazy">` : `<i>${r.code}</i>`}<b>${esc(teamName(r.code))}</b></span><span>${h.p}</span><strong>${h.pts}</strong><span>${a.p}</span><strong>${a.pts}</strong><b>${h.pts + a.pts}</b></button>`;
    }).join("");
    root.querySelectorAll("[data-open-team]").forEach(btn => btn.addEventListener("click", () => {
      const target = document.querySelector(`#teams [data-team="${btn.dataset.openTeam}"]`);
      target?.click();
    }));
  }

  function addCrest(imgParent, code, className = "club-crest") {
    if (!imgParent || imgParent.querySelector(`img.${className}`)) return;
    const url = crestUrl(code); if (!url) return;
    const img = document.createElement("img");
    img.className = className; img.src = url; img.alt = `Escudo de ${teamName(code)}`; img.loading = "lazy";
    img.addEventListener("error", () => img.remove(), {once:true});
    imgParent.prepend(img);
  }

  function codeFromClubHero() {
    const h = document.querySelector("#club-content .club-hero h2");
    if (!h) return lastTeam;
    const name = h.textContent.trim().toLowerCase();
    return Object.keys(teams).find(c => [teams[c]?.name, teams[c]?.short].filter(Boolean).some(n => n.toLowerCase() === name)) || lastTeam;
  }

  function decorateTeams() {
    document.querySelectorAll(".standing-row[data-team]").forEach(row => addCrest(row.querySelector(".club-cell"), row.dataset.team, "crest-mini"));
    document.querySelectorAll(".team-card").forEach(card => {
      const code = card.querySelector("[data-team]")?.dataset.team; if (!code) return;
      const mono = card.querySelector(".team-monogram");
      if (mono && !mono.querySelector("img")) {
        const url = crestUrl(code);
        if (url) mono.innerHTML = `<img src="${url}" alt="Escudo de ${esc(teamName(code))}" loading="lazy" onerror="this.remove()"><span>${code}</span>`;
      }
    });
    document.querySelectorAll(".stadium-card").forEach(card => {
      const code = card.querySelector("[data-team]")?.dataset.team; if (!code) return;
      const badge = card.querySelector(".stadium-badge");
      if (badge && !badge.querySelector("img")) {
        const url = crestUrl(code); if (url) badge.innerHTML = `<img src="${url}" alt="Escudo de ${esc(teamName(code))}" loading="lazy" onerror="this.remove()"><span>${code}</span>`;
      }
    });
    document.querySelectorAll(".match-teams button[data-team], .big-match button[data-team]").forEach(btn => addCrest(btn, btn.dataset.team, "crest-match"));
    document.querySelectorAll(".leader-card button[data-team]").forEach(btn => addCrest(btn, btn.dataset.team, "crest-leader"));

    const clubCode = codeFromClubHero();
    if (clubCode) {
      const mono = document.querySelector("#club-content .club-monogram");
      if (mono && !mono.querySelector("img")) {
        const url = crestUrl(clubCode); if (url) mono.innerHTML = `<img src="${url}" alt="Escudo de ${esc(teamName(clubCode))}" onerror="this.remove()"><span>${clubCode}</span>`;
      }
    }
  }

  function decoratePlayers() {
    document.querySelectorAll(".player-card[data-player]").forEach(card => {
      if (card.querySelector(".player-photo-enhanced")) return;
      const id = card.dataset.player, code = card.dataset.team;
      const player = playerById(code,id);
      const photo = playerPhoto(id,code); if (!photo) return;
      const frame = document.createElement("span");
      frame.className = "player-photo-frame";
      frame.innerHTML = `<img class="player-photo-enhanced" src="${photo}" alt="${esc(player?.name || "Jugador")}" loading="lazy"><em>${player?.jerseyNumber ?? ""}</em>`;
      frame.querySelector("img")?.addEventListener("error", () => frame.remove(), {once:true});
      const pos = card.querySelector(".player-pos");
      if (pos) pos.replaceWith(frame); else card.prepend(frame);
    });

    const detailHero = document.querySelector("#detail-content .detail-hero");
    if (detailHero && lastPlayer && !detailHero.querySelector(".player-detail-photo")) {
      const img = document.createElement("img");
      img.className = "player-detail-photo"; img.src = playerPhoto(lastPlayer.id,lastPlayer.team); img.alt = "Foto del jugador";
      img.addEventListener("error", () => img.remove(), {once:true});
      const pos = detailHero.querySelector(".player-big-pos");
      if (pos) pos.replaceWith(img); else detailHero.prepend(img);
      const crest = crestUrl(lastPlayer.team);
      const copy = detailHero.querySelector("div");
      if (copy && crest && !copy.querySelector(".player-team-crest")) copy.insertAdjacentHTML("afterbegin", `<img class="player-team-crest" src="${crest}" alt="Escudo del club">`);
    }
  }

  function patchClubSplit() {
    const club = codeFromClubHero(); if (!club) return;
    const panel = [...document.querySelectorAll("#club-content .club-panel")].find(p => p.querySelector("h3")?.textContent.includes("Rendimiento local"));
    if (!panel) return;
    const split = splitFor(club), h = split.home, a = split.away;
    panel.innerHTML = `<h3>🏠 Rendimiento local / visitante</h3><p class="split-intro">Puntos reales conseguidos esta temporada según los partidos finalizados.</p><div class="split-grid"><div class="split-card home"><strong>Como local</strong><b>${h.pts} pts</b><small>${h.p} PJ · ${h.w}V ${h.d}E ${h.l}D · ${h.gf}-${h.ga}</small></div><div class="split-card away"><strong>Como visitante</strong><b>${a.pts} pts</b><small>${a.p} PJ · ${a.w}V ${a.d}E ${a.l}D · ${a.gf}-${a.ga}</small></div></div>`;
  }

  function updateGeneralForum() {
    const link = document.getElementById("general-forum-link");
    if (link && D.repo) link.href = `https://github.com/${D.repo}/issues`;
  }

  function refreshDecorations() {
    decorateTeams(); decoratePlayers(); patchClubSplit(); updateGeneralForum();
  }

  document.addEventListener("click", e => {
    const teamTarget = e.target.closest("[data-team]");
    if (teamTarget?.dataset.team) lastTeam = teamTarget.dataset.team;
    const playerTarget = e.target.closest("[data-player][data-team]");
    if (playerTarget) lastPlayer = {id: playerTarget.dataset.player, team: playerTarget.dataset.team};
  }, true);

  async function init() {
    try {
      const r = await fetch(`live-data.json?v=${Date.now()}`, {cache:"no-store"});
      if (r.ok) live = await r.json();
    } catch (_) {}
    renderHomeAway();
    refreshDecorations();
    const observer = new MutationObserver(() => requestAnimationFrame(refreshDecorations));
    observer.observe(document.body, {subtree:true, childList:true});
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
