#!/usr/bin/env python3
"""Actualiza automáticamente LALIGA TOTAL para GitHub Pages.

Fuentes: endpoints públicos de SofaScore para datos deportivos y GitHub Issues para foros.
Conserva la última caché válida cuando una fuente temporalmente no responde.
"""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "live-data.json"
REPO = os.getenv("GITHUB_REPOSITORY", "daniferjim20082008-cloud/LALIGA-TOTAL")
TOKEN = os.getenv("GITHUB_TOKEN", "")
TOURNAMENT_ID = 8
SEASON_HINTS = ("26/27", "2026/27", "2026-27", "2026")
SOFA_BASES = ("https://www.sofascore.com/api/v1", "https://api.sofascore.com/api/v1")

TEAM_ALIASES = {
    "ALA": ["deportivo alaves", "alaves"], "ATH": ["athletic club", "athletic bilbao"],
    "ATM": ["atletico madrid", "atletico de madrid"], "BAR": ["barcelona", "fc barcelona"],
    "BET": ["real betis", "real betis balompie", "betis"], "CEL": ["celta vigo", "rc celta", "celta"],
    "DEP": ["deportivo la coruna", "deportivo de la coruna", "rc deportivo", "deportivo"],
    "ELC": ["elche", "elche cf"], "ESP": ["espanyol", "rcd espanyol"],
    "GET": ["getafe", "getafe cf"], "LEV": ["levante", "levante ud"],
    "MGA": ["malaga", "malaga cf"], "OSA": ["osasuna", "ca osasuna"],
    "RAC": ["racing santander", "racing de santander", "real racing club"],
    "RAY": ["rayo vallecano", "rayo"], "RMA": ["real madrid", "real madrid cf"],
    "RSO": ["real sociedad"], "SEV": ["sevilla", "sevilla fc"],
    "VAL": ["valencia", "valencia cf"], "VIL": ["villarreal", "villarreal cf"],
}
DISPLAY = {
    "ALA":"Deportivo Alavés","ATH":"Athletic Club","ATM":"Atlético de Madrid","BAR":"FC Barcelona",
    "BET":"Real Betis","CEL":"Celta","DEP":"RC Deportivo","ELC":"Elche","ESP":"RCD Espanyol",
    "GET":"Getafe","LEV":"Levante","MGA":"Málaga","OSA":"Osasuna","RAC":"Racing Santander",
    "RAY":"Rayo Vallecano","RMA":"Real Madrid","RSO":"Real Sociedad","SEV":"Sevilla",
    "VAL":"Valencia","VIL":"Villarreal",
}
PLAYER_FIELDS = [
    "goals","assists","yellowCards","redCards","minutesPlayed","appearances","started","rating",
    "expectedGoals","keyPasses","bigChancesCreated","totalShots","shotsOnTarget","tackles","interceptions",
    "clearances","accuratePassesPercentage","successfulDribbles","saves","cleanSheets",
]

def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()

ALIAS_TO_CODE = {norm(alias): code for code, aliases in TEAM_ALIASES.items() for alias in aliases}

def team_code(team) -> str | None:
    candidates = [team.get("name"), team.get("shortName"), team.get("slug"), team.get("nameCode")] if isinstance(team, dict) else [team]
    for candidate in candidates:
        n = norm(str(candidate or ""))
        if not n:
            continue
        if n in ALIAS_TO_CODE:
            return ALIAS_TO_CODE[n]
        matches = [(len(alias), code) for alias, code in ALIAS_TO_CODE.items() if len(alias) >= 4 and (alias in n or n in alias)]
        if matches:
            matches.sort(reverse=True)
            return matches[0][1]
    return None

def http_json(url: str, *, method="GET", payload=None, headers=None, timeout=25):
    body = None
    req_headers = {
        "User-Agent": f"Mozilla/5.0 (compatible; LaLigaTotalBot/2.0; +https://github.com/{REPO})",
        "Accept": "application/json",
    }
    if headers: req_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))

def sofa(path: str):
    last = None
    for base in SOFA_BASES:
        for attempt in range(2):
            try: return http_json(base + path)
            except Exception as exc:
                last = exc
                time.sleep(.7 * (attempt + 1))
    raise RuntimeError(f"SofaScore {path}: {last}")

def load_previous():
    if OUT.exists():
        try: return json.loads(OUT.read_text("utf-8"))
        except Exception: pass
    return {"standings":[],"leaders":{},"events":[],"forums":{},"squads":{},"teamExtras":{},"matchDetails":{},"warnings":[]}

def discover_season():
    seasons = sofa(f"/unique-tournament/{TOURNAMENT_ID}/seasons").get("seasons", [])
    for hint in SEASON_HINTS:
        for season in seasons:
            if hint.lower() in f"{season.get('name','')} {season.get('year','')}".lower(): return season
    if seasons: return seasons[0]
    raise RuntimeError("No se encontró temporada")

def get_standings(season_id):
    data = sofa(f"/unique-tournament/{TOURNAMENT_ID}/season/{season_id}/standings/total")
    rows, ids = [], {}
    for group in data.get("standings", []):
        for r in group.get("rows", []):
            code = team_code(r.get("team")); team = r.get("team") or {}
            if not code: continue
            if team.get("id"): ids[code] = int(team["id"])
            rows.append([code,int(r.get("points") or 0),int(r.get("matches") or 0),int(r.get("wins") or 0),int(r.get("draws") or 0),int(r.get("losses") or 0),int(r.get("scoresFor") or 0),int(r.get("scoresAgainst") or 0)])
    dedup = {r[0]:r for r in rows}
    result = list(dedup.values())
    result.sort(key=lambda r:(-r[1],-(r[6]-r[7]),-r[6],r[0]))
    return result, ids

def _leader_rows(items, stat_names):
    out=[]
    for item in items or []:
        code=team_code(item.get("team")); stats=item.get("statistics") or {}; player=item.get("player") or {}
        if not code: continue
        value=next((stats.get(s) for s in stat_names if stats.get(s) is not None),None)
        try: value=int(value)
        except Exception: continue
        out.append({"n":player.get("shortName") or player.get("name") or "Jugador","t":code,"v":value})
    return sorted(out,key=lambda x:(-x["v"],x["n"]))[:10]

def get_leaders(season_id):
    tp=sofa(f"/unique-tournament/{TOURNAMENT_ID}/season/{season_id}/top-players/overall").get("topPlayers",{})
    return {"goals":_leader_rows(tp.get("goals"),("goals",)),"assists":_leader_rows(tp.get("assists"),("goalAssist","assists")),"yellow":_leader_rows(tp.get("yellowCards"),("yellowCards",)),"red":_leader_rows(tp.get("redCards"),("redCards",))}

def get_events(season_id):
    events=[]; ids={}
    for round_no in range(1,39):
        try: data=sofa(f"/unique-tournament/{TOURNAMENT_ID}/season/{season_id}/events/round/{round_no}")
        except Exception: continue
        for event in data.get("events",[]):
            home=team_code(event.get("homeTeam")); away=team_code(event.get("awayTeam"))
            if not home or not away: continue
            ht=event.get("homeTeam") or {}; at=event.get("awayTeam") or {}
            if ht.get("id"): ids[home]=int(ht["id"])
            if at.get("id"): ids[away]=int(at["id"])
            ts=event.get("startTimestamp")
            kickoff=datetime.fromtimestamp(int(ts),timezone.utc).isoformat().replace("+00:00","Z") if ts else None
            hs=event.get("homeScore") or {}; aw=event.get("awayScore") or {}
            events.append({"id":event.get("id"),"round":round_no,"home":home,"away":away,"kickoff":kickoff,"status":(event.get("status") or {}).get("type") or "notstarted","homeScore":hs.get("current"),"awayScore":aw.get("current"),"winnerCode":event.get("winnerCode")})
    return events, ids

def get_player_stats(season_id, team_ids):
    fields=urllib.parse.quote(",".join(PLAYER_FIELDS),safe=",")
    by_team={code:{} for code in team_ids}
    id_to_code={tid:code for code,tid in team_ids.items()}
    offset=0
    for _ in range(8):
        path=(f"/unique-tournament/{TOURNAMENT_ID}/season/{season_id}/statistics?limit=100&order=-rating&offset={offset}"
              f"&accumulation=total&fields={fields}&filters=position.in.G~D~M~F")
        data=sofa(path); results=data.get("results",[])
        for row in results:
            team=row.get("team") or {}; code=id_to_code.get(team.get("id")) or team_code(team)
            player=row.get("player") or {}; pid=player.get("id")
            if not code or not pid: continue
            stats={k:row.get(k) for k in PLAYER_FIELDS if row.get(k) is not None}
            by_team.setdefault(code,{})[str(pid)]={"stats":stats,"player":player}
        if data.get("page") == data.get("pages") or len(results)<100: break
        offset+=100
    return by_team

def get_squads(team_ids, player_stats):
    squads={}
    for code,tid in team_ids.items():
        try: players=sofa(f"/team/{tid}/players").get("players",[])
        except Exception: continue
        out=[]
        for item in players:
            p=item.get("player") or item
            pid=p.get("id")
            if not pid: continue
            country=p.get("country") or {}
            extra=(player_stats.get(code,{}) or {}).get(str(pid),{})
            out.append({
                "id":pid,"name":p.get("name") or p.get("shortName") or "Jugador","shortName":p.get("shortName") or p.get("name"),
                "position":p.get("position") or item.get("position"),"jerseyNumber":p.get("jerseyNumber") or item.get("jerseyNumber") or item.get("shirtNumber"),
                "height":p.get("height"),"dateOfBirthTimestamp":p.get("dateOfBirthTimestamp"),"preferredFoot":p.get("preferredFoot"),
                "country":country.get("name") or country.get("alpha2") or "","stats":extra.get("stats",{}),
            })
        out.sort(key=lambda x:({"G":0,"D":1,"M":2,"F":3}.get(x.get("position"),9),-(x.get("stats",{}).get("minutesPlayed") or 0),x["name"]))
        squads[code]=out
    return squads

def event_key(e): return f'{e["round"]}:{e["home"]}:{e["away"]}'

def result_for_team(event, code):
    if event.get("homeScore") is None or event.get("awayScore") is None: return None
    hs,as_=event["homeScore"],event["awayScore"]
    gf,ga=(hs,as_) if event["home"]==code else (as_,hs)
    return "W" if gf>ga else "D" if gf==ga else "L"

def build_team_extras(events, squads):
    extras={}
    done=[e for e in events if e.get("homeScore") is not None and e.get("awayScore") is not None]
    for code in DISPLAY:
        club=[e for e in done if code in (e["home"],e["away"])]
        club.sort(key=lambda e:e.get("kickoff") or "")
        form=[result_for_team(e,code) for e in club[-5:]]
        split={"home":{"p":0,"w":0,"d":0,"l":0,"gf":0,"ga":0,"pts":0},"away":{"p":0,"w":0,"d":0,"l":0,"gf":0,"ga":0,"pts":0}}
        for e in club:
            side="home" if e["home"]==code else "away"; s=split[side]; s["p"]+=1
            gf,ga=(e["homeScore"],e["awayScore"]) if side=="home" else (e["awayScore"],e["homeScore"])
            s["gf"]+=gf; s["ga"]+=ga
            if gf>ga: s["w"]+=1; s["pts"]+=3
            elif gf==ga: s["d"]+=1; s["pts"]+=1
            else: s["l"]+=1
        roster=squads.get(code,[])
        probable=[]
        for pos,count in (("G",1),("D",4),("M",3),("F",3)):
            candidates=[p for p in roster if p.get("position")==pos]
            candidates.sort(key=lambda p:(-(p.get("stats",{}).get("started") or 0),-(p.get("stats",{}).get("minutesPlayed") or 0)))
            probable.extend(candidates[:count])
        extras[code]={"form":form,"split":split,"probableXI":[{"id":p["id"],"name":p["shortName"],"position":p.get("position"),"number":p.get("jerseyNumber")} for p in probable],"missing":[]}
    return extras

def flatten_lineup(side):
    players=[]
    for item in side.get("players",[]) or []:
        p=item.get("player") or {}
        players.append({"id":p.get("id"),"name":p.get("shortName") or p.get("name"),"position":item.get("position") or p.get("position"),"number":item.get("shirtNumber") or item.get("jerseyNumber") or p.get("jerseyNumber"),"substitute":bool(item.get("substitute")),"captain":bool(item.get("captain")),"rating":(item.get("statistics") or {}).get("rating")})
    missing=[]
    for item in side.get("missingPlayers",[]) or []:
        p=item.get("player") or item
        reason=item.get("reason") or item.get("type") or item.get("description") or "Baja / duda"
        if isinstance(reason,dict): reason=reason.get("name") or reason.get("description") or "Baja / duda"
        missing.append({"id":p.get("id"),"name":p.get("shortName") or p.get("name") or "Jugador","reason":str(reason)})
    return {"formation":side.get("formation"),"players":players,"missing":missing}

def flatten_statistics(data):
    for block in data.get("statistics",[]) or []:
        if block.get("period")=="ALL":
            out=[]
            for group in block.get("groups",[]) or []:
                for item in group.get("statisticsItems",[]) or []:
                    out.append({"name":item.get("name"),"key":item.get("key"),"home":item.get("home"),"away":item.get("away"),"homeValue":item.get("homeValue"),"awayValue":item.get("awayValue")})
            return out
    return []

def flatten_incidents(data):
    out=[]
    for i in data.get("incidents",[]) or []:
        player=i.get("player") or {}; assist=i.get("assist1") or {}
        out.append({"type":i.get("incidentType"),"class":i.get("incidentClass"),"time":i.get("time"),"addedTime":i.get("addedTime"),"isHome":i.get("isHome"),"player":player.get("shortName") or player.get("name"),"assist":assist.get("shortName") or assist.get("name"),"text":i.get("reason") or i.get("incidentClass")})
    return out[:80]

def flatten_h2h(data):
    out=[]
    for e in data.get("events",[])[:8]:
        h=team_code(e.get("homeTeam")); a=team_code(e.get("awayTeam")); hs=e.get("homeScore") or {}; aw=e.get("awayScore") or {}; ts=e.get("startTimestamp")
        if not h or not a: continue
        out.append({"home":h,"away":a,"homeScore":hs.get("current"),"awayScore":aw.get("current"),"kickoff":datetime.fromtimestamp(int(ts),timezone.utc).isoformat().replace("+00:00","Z") if ts else None})
    return out

def enrich_matches(events, previous_details, team_extras):
    details=dict(previous_details or {})
    now=datetime.now(timezone.utc)
    def event_dt(e):
        try: return datetime.fromisoformat((e.get("kickoff") or "").replace("Z","+00:00"))
        except Exception: return None
    dated=[e for e in events if event_dt(e)]
    upcoming=sorted([e for e in dated if event_dt(e)>=now-timedelta(hours=3)],key=event_dt)[:12]
    recent=sorted([e for e in dated if event_dt(e)<now],key=event_dt,reverse=True)[:12]
    for e in upcoming+recent:
        eid=e.get("id"); key=event_key(e)
        if not eid: continue
        current=details.get(key,{"eventId":eid})
        try:
            lineups=sofa(f"/event/{eid}/lineups")
            current["lineups"]={"confirmed":bool(lineups.get("confirmed")),"home":flatten_lineup(lineups.get("home") or {}),"away":flatten_lineup(lineups.get("away") or {})}
            for side,code in (("home",e["home"]),("away",e["away"])):
                miss=current["lineups"][side].get("missing",[])
                if miss: team_extras.setdefault(code,{}).update({"missing":miss})
        except Exception: pass
        try: current["h2h"]=flatten_h2h(sofa(f"/event/{eid}/h2h/events"))
        except Exception: pass
        if e.get("status") in ("inprogress","finished","afterpenalties","afterextra") or e in recent:
            try: current["statistics"]=flatten_statistics(sofa(f"/event/{eid}/statistics"))
            except Exception: pass
            try: current["incidents"]=flatten_incidents(sofa(f"/event/{eid}/incidents"))
            except Exception: pass
        current["updated"]=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
        details[key]=current
    return details

def gh_headers():
    h={"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
    if TOKEN: h["Authorization"]=f"Bearer {TOKEN}"
    return h

def github_json(url,*,method="GET",payload=None): return http_json(url,method=method,payload=payload,headers=gh_headers())

def find_or_create_forum(event):
    if not TOKEN: return None
    r=event["round"]; home=DISPLAY[event["home"]]; away=DISPLAY[event["away"]]
    q=f'repo:{REPO} is:issue in:title "[FORO J{r}]" "{home.split()[0]}" "{away.split()[0]}"'
    try:
        found=github_json("https://api.github.com/search/issues?q="+urllib.parse.quote(q)).get("items",[])
        if found: return found[0].get("html_url")
    except Exception: pass
    kickoff=event.get("kickoff") or "horario por confirmar"
    title=f"[FORO J{r}] {home} vs {away}"
    body=(f"## Foro del partido · Jornada {r} · LALIGA EA SPORTS 2026/27\n\n**{home} vs {away}** · {kickoff}.\n\n"
          "Comenta la previa, alineaciones, partido y postpartido con respeto.\n\n### Normas\n- Debate con respeto.\n- Nada de spam ni datos personales.\n"
          "- Las predicciones de LALIGA TOTAL son estimaciones recreativas, no recomendaciones de apuestas.\n\n"
          f"[Abrir LALIGA TOTAL](https://daniferjim20082008-cloud.github.io/LALIGA-TOTAL/?round={r})\n")
    try: return github_json(f"https://api.github.com/repos/{REPO}/issues",method="POST",payload={"title":title,"body":body}).get("html_url")
    except Exception: return None

def update_forums(events, previous):
    forums=dict(previous or {}); now=datetime.now(timezone.utc); horizon=now+timedelta(days=14)
    for e in events:
        try: kickoff=datetime.fromisoformat((e.get("kickoff") or "").replace("Z","+00:00"))
        except Exception: continue
        if now-timedelta(days=2)<=kickoff<=horizon and not forums.get(event_key(e)):
            url=find_or_create_forum(e)
            if url: forums[event_key(e)]=url
    return forums

def main():
    previous=load_previous(); result=dict(previous); warnings=[]; season=None; team_ids=dict(previous.get("teamIds") or {})
    try:
        season=discover_season(); result["season_id"]=season.get("id"); result["season_name"]=season.get("name")
    except Exception as exc: warnings.append(f"Temporada: {exc}")
    if season:
        sid=int(season["id"])
        try:
            standings, ids=get_standings(sid); team_ids.update(ids)
            if len(standings)>=18: result["standings"]=standings
            else: warnings.append("Clasificación incompleta; se conserva caché")
        except Exception as exc: warnings.append(f"Clasificación: {exc}")
        try:
            leaders=get_leaders(sid)
            if any(leaders.values()): result["leaders"]={**(result.get("leaders") or {}),**{k:v for k,v in leaders.items() if v}}
        except Exception as exc: warnings.append(f"Líderes: {exc}")
        try:
            events, ids=get_events(sid); team_ids.update(ids)
            if len(events)>=300: result["events"]=events
            elif events:
                old={event_key(e):e for e in result.get("events",[]) if e.get("round")}
                for e in events: old[event_key(e)]=e
                result["events"]=list(old.values()); warnings.append(f"Calendario parcial ({len(events)}); combinado con caché")
        except Exception as exc: warnings.append(f"Calendario: {exc}")
        result["teamIds"]=team_ids
        if len(team_ids)>=18:
            try:
                pstats=get_player_stats(sid,team_ids)
                squads=get_squads(team_ids,pstats)
                if squads: result["squads"]={**(result.get("squads") or {}),**squads}
            except Exception as exc: warnings.append(f"Plantillas/estadísticas: {exc}")
    result["teamExtras"]=build_team_extras(result.get("events",[]),result.get("squads",{}))
    try: result["matchDetails"]=enrich_matches(result.get("events",[]),result.get("matchDetails",{}),result["teamExtras"])
    except Exception as exc: warnings.append(f"Detalles de partido: {exc}")
    try: result["forums"]=update_forums(result.get("events",[]),result.get("forums",{}))
    except Exception as exc: warnings.append(f"Foros: {exc}")
    result["updated"]=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
    result["source"]="SofaScore (datos deportivos) + GitHub Issues (foros)"
    result["brand"]="LALIGA TOTAL"; result["warnings"]=warnings
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n","utf-8")
    print(f"LALIGA TOTAL: {len(result.get('events',[]))} partidos, {len(result.get('squads',{}))} plantillas, {len(result.get('matchDetails',{}))} fichas de partido cacheadas")
    for w in warnings: print("AVISO:",w)

if __name__=="__main__": main()
