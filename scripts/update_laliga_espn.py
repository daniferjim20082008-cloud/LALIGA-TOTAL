#!/usr/bin/env python3
"""Respaldo de datos para LALIGA TOTAL usando los endpoints públicos de ESPN.

Se ejecuta después del actualizador principal. Si SofaScore no devuelve calendario,
equipos o plantillas, completa live-data.json con ESPN para que la web nunca quede
vacía en puntos casa/fuera, escudos y fichas de jugadores.
"""
from __future__ import annotations

import json
import re
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "live-data.json"
BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1"
STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings?season=2026"

ALIASES = {
    "ALA": ["deportivo alaves", "alaves", "deportivo alavés"],
    "ATH": ["athletic club", "athletic bilbao"],
    "ATM": ["atletico madrid", "atletico de madrid", "atlético madrid"],
    "BAR": ["barcelona", "fc barcelona"],
    "BET": ["real betis", "real betis balompie", "betis"],
    "CEL": ["celta vigo", "rc celta", "celta", "celta de vigo"],
    "DEP": ["deportivo la coruna", "deportivo de la coruna", "deportivo la coruña", "rc deportivo", "deportivo"],
    "ELC": ["elche", "elche cf"],
    "ESP": ["espanyol", "rcd espanyol", "espanyol barcelona"],
    "GET": ["getafe", "getafe cf"],
    "LEV": ["levante", "levante ud"],
    "MGA": ["malaga", "malaga cf", "málaga", "málaga cf"],
    "OSA": ["osasuna", "ca osasuna"],
    "RAC": ["racing santander", "racing de santander", "real racing club", "racing club"],
    "RAY": ["rayo vallecano", "rayo"],
    "RMA": ["real madrid", "real madrid cf"],
    "RSO": ["real sociedad", "real sociedad san sebastian"],
    "SEV": ["sevilla", "sevilla fc"],
    "VAL": ["valencia", "valencia cf"],
    "VIL": ["villarreal", "villarreal cf"],
}
DISPLAY = {
    "ALA":"Deportivo Alavés","ATH":"Athletic Club","ATM":"Atlético de Madrid","BAR":"FC Barcelona",
    "BET":"Real Betis","CEL":"Celta","DEP":"RC Deportivo","ELC":"Elche","ESP":"RCD Espanyol",
    "GET":"Getafe","LEV":"Levante","MGA":"Málaga","OSA":"Osasuna","RAC":"Racing Santander",
    "RAY":"Rayo Vallecano","RMA":"Real Madrid","RSO":"Real Sociedad","SEV":"Sevilla",
    "VAL":"Valencia","VIL":"Villarreal",
}

def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()

ALIAS_TO_CODE = {norm(a): c for c, arr in ALIASES.items() for a in arr}

def code_for(team: dict | str | None):
    if isinstance(team, dict):
        vals = [team.get("displayName"), team.get("shortDisplayName"), team.get("name"), team.get("location"), team.get("slug"), team.get("abbreviation")]
    else:
        vals = [team]
    for val in vals:
        n = norm(str(val or ""))
        if not n:
            continue
        if n in ALIAS_TO_CODE:
            return ALIAS_TO_CODE[n]
        for alias, code in ALIAS_TO_CODE.items():
            if len(n) >= 4 and (n in alias or alias in n):
                return code
    return None

def get_json(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; LaLigaTotalBot/3.0)",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=35) as response:
        return json.loads(response.read().decode("utf-8"))

def load():
    try:
        return json.loads(OUT.read_text("utf-8"))
    except Exception:
        return {"standings":[],"leaders":{},"events":[],"forums":{},"squads":{},"teamExtras":{},"matchDetails":{},"warnings":[]}

def team_nodes(data):
    out = []
    for sport in data.get("sports", []) or []:
        for league in sport.get("leagues", []) or []:
            for item in league.get("teams", []) or []:
                team = item.get("team") or item
                if isinstance(team, dict):
                    out.append(team)
    return out

def logo_of(team):
    logos = team.get("logos") or []
    if logos and isinstance(logos[0], dict):
        return logos[0].get("href")
    return team.get("logo")

def get_teams():
    data = get_json(f"{BASE}/teams")
    ids, logos = {}, {}
    for team in team_nodes(data):
        code = code_for(team)
        if not code:
            continue
        if team.get("id") is not None:
            ids[code] = str(team.get("id"))
        logo = logo_of(team)
        if logo:
            logos[code] = logo
    return ids, logos

def parse_score(value):
    if isinstance(value, dict):
        value = value.get("value") or value.get("displayValue")
    try:
        return int(float(str(value)))
    except Exception:
        return None

def get_events():
    # ESPN acepta intervalos YYYYMMDD-YYYYMMDD y devuelve calendario/resultado.
    url = f"{BASE}/scoreboard?dates=20260801-20270630&limit=500"
    data = get_json(url)
    events = []
    for event in data.get("events", []) or []:
        comps = event.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        home = away = None
        hs = as_ = None
        for competitor in comp.get("competitors", []) or []:
            team = competitor.get("team") or {}
            code = code_for(team)
            if competitor.get("homeAway") == "home":
                home, hs = code, parse_score(competitor.get("score"))
            elif competitor.get("homeAway") == "away":
                away, as_ = code, parse_score(competitor.get("score"))
        if not home or not away:
            continue
        st = ((comp.get("status") or {}).get("type") or {})
        state = str(st.get("state") or "pre").lower()
        completed = bool(st.get("completed")) or state == "post"
        status = "finished" if completed else "inprogress" if state == "in" else "notstarted"
        if not completed and status != "inprogress":
            hs = as_ = None
        round_no = None
        week = event.get("week") or {}
        if isinstance(week, dict):
            round_no = week.get("number")
        if not round_no:
            round_no = comp.get("round") or event.get("round")
            if isinstance(round_no, dict):
                round_no = round_no.get("number")
        try:
            round_no = int(round_no)
        except Exception:
            round_no = None
        events.append({
            "id": event.get("id"), "round": round_no, "home": home, "away": away,
            "kickoff": event.get("date") or comp.get("date"), "status": status,
            "homeScore": hs, "awayScore": as_, "provider": "ESPN",
        })
    # If ESPN omits round numbers, infer them from chronological groups of ten games.
    if events and sum(1 for e in events if e.get("round")) < len(events) // 2:
        ordered = sorted(events, key=lambda e: e.get("kickoff") or "")
        seen_round = 1
        round_teams = set()
        for e in ordered:
            if e["home"] in round_teams or e["away"] in round_teams or len(round_teams) >= 20:
                seen_round += 1
                round_teams = set()
            e["round"] = min(38, seen_round)
            round_teams.update([e["home"], e["away"]])
    return [e for e in events if e.get("round") and 1 <= int(e["round"]) <= 38]

def stats_map(entry):
    out = {}
    for s in entry.get("stats", []) or []:
        name = s.get("name") or s.get("abbreviation")
        if name:
            out[str(name)] = s.get("value", s.get("displayValue"))
    return out

def as_int(value):
    try:
        return int(float(str(value)))
    except Exception:
        return 0

def parse_standings():
    data = get_json(STANDINGS)
    entries = []
    stack = list(data.get("children", []) or [])
    while stack:
        node = stack.pop(0)
        standing = node.get("standings") or {}
        entries.extend(standing.get("entries", []) or [])
        stack.extend(node.get("children", []) or [])
    if not entries and (data.get("standings") or {}).get("entries"):
        entries = data["standings"]["entries"]
    rows = []
    for entry in entries:
        team = entry.get("team") or {}
        code = code_for(team)
        if not code:
            continue
        s = stats_map(entry)
        pick = lambda *keys: next((s.get(k) for k in keys if s.get(k) is not None), 0)
        rows.append([
            code,
            as_int(pick("points", "PTS")),
            as_int(pick("gamesPlayed", "GP", "games")),
            as_int(pick("wins", "W")),
            as_int(pick("ties", "draws", "D")),
            as_int(pick("losses", "L")),
            as_int(pick("pointsFor", "goalsFor", "GF")),
            as_int(pick("pointsAgainst", "goalsAgainst", "GA")),
        ])
    dedup = {r[0]: r for r in rows}
    return sorted(dedup.values(), key=lambda r: (-r[1], -(r[6]-r[7]), -r[6], r[0]))

def pos_code(value):
    n = norm(str(value or ""))
    if any(x in n for x in ("goalkeeper", "portero", " gk", "keeper")) or n in ("gk", "g"):
        return "G"
    if any(x in n for x in ("defender", "defensa", "back", "centre back", "center back")) or n in ("d", "df", "cb", "lb", "rb"):
        return "D"
    if any(x in n for x in ("midfielder", "centrocampista", "midfield")) or n in ("m", "mf", "cm", "dm", "am"):
        return "M"
    if any(x in n for x in ("forward", "delantero", "striker", "winger")) or n in ("f", "fw", "st", "lw", "rw"):
        return "F"
    return str(value or "")[:1].upper() or "—"

def dob_timestamp(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return int(dt.timestamp())
    except Exception:
        return None

def roster_items(data):
    result = []
    athletes = data.get("athletes", []) or []
    for group in athletes:
        if isinstance(group, dict) and isinstance(group.get("items"), list):
            group_pos = group.get("position") or group.get("name")
            for item in group["items"]:
                if isinstance(item, dict):
                    result.append((item, group_pos))
        elif isinstance(group, dict):
            result.append((group, None))
    return result

def get_roster(team_id):
    data = get_json(f"{BASE}/teams/{urllib.parse.quote(str(team_id))}/roster?limit=100")
    out = []
    for p, group_pos in roster_items(data):
        pos = p.get("position") or {}
        pos_text = pos.get("displayName") or pos.get("name") or pos.get("abbreviation") if isinstance(pos, dict) else pos
        headshot = p.get("headshot") or {}
        if isinstance(headshot, dict):
            photo = headshot.get("href")
        else:
            photo = str(headshot or "") or None
        nationality = p.get("citizenship") or p.get("nationality") or p.get("country") or ""
        if isinstance(nationality, dict):
            nationality = nationality.get("name") or nationality.get("displayName") or nationality.get("abbreviation") or ""
        out.append({
            "id": p.get("id"),
            "name": p.get("fullName") or p.get("displayName") or p.get("shortName") or "Jugador",
            "shortName": p.get("shortName") or p.get("displayName") or p.get("fullName") or "Jugador",
            "position": pos_code(pos_text or group_pos),
            "positionName": pos_text or group_pos,
            "jerseyNumber": p.get("jersey") or p.get("jerseyNumber"),
            "height": p.get("displayHeight") or p.get("height"),
            "dateOfBirthTimestamp": dob_timestamp(p.get("dateOfBirth")),
            "preferredFoot": p.get("preferredFoot"),
            "country": nationality,
            "photo": photo,
            "stats": {},
            "provider": "ESPN",
        })
    return [p for p in out if p.get("id")]

def build_extras(events, squads):
    extras = {}
    done = [e for e in events if e.get("homeScore") is not None and e.get("awayScore") is not None]
    for code in DISPLAY:
        club = [e for e in done if code in (e["home"], e["away"])]
        club.sort(key=lambda e: e.get("kickoff") or "")
        form = []
        for e in club[-5:]:
            gf, ga = (e["homeScore"], e["awayScore"]) if e["home"] == code else (e["awayScore"], e["homeScore"])
            form.append("W" if gf > ga else "D" if gf == ga else "L")
        split = {"home":{"p":0,"w":0,"d":0,"l":0,"gf":0,"ga":0,"pts":0}, "away":{"p":0,"w":0,"d":0,"l":0,"gf":0,"ga":0,"pts":0}}
        for e in club:
            side = "home" if e["home"] == code else "away"
            s = split[side]
            gf, ga = (e["homeScore"], e["awayScore"]) if side == "home" else (e["awayScore"], e["homeScore"])
            s["p"] += 1; s["gf"] += gf; s["ga"] += ga
            if gf > ga: s["w"] += 1; s["pts"] += 3
            elif gf == ga: s["d"] += 1; s["pts"] += 1
            else: s["l"] += 1
        roster = squads.get(code, [])
        probable = []
        for pos, count in (("G",1),("D",4),("M",3),("F",3)):
            probable.extend([p for p in roster if p.get("position") == pos][:count])
        extras[code] = {
            "form": form, "split": split,
            "probableXI": [{"id":p["id"],"name":p["shortName"],"position":p.get("position"),"number":p.get("jerseyNumber")} for p in probable],
            "missing": [],
        }
    return extras

def main():
    result = load()
    warnings = list(result.get("warnings") or [])
    used = []
    try:
        team_ids, logos = get_teams()
        if team_ids:
            result["espnTeamIds"] = team_ids
            result["teamLogos"] = {**(result.get("teamLogos") or {}), **logos}
            used.append(f"{len(team_ids)} equipos")
    except Exception as exc:
        warnings.append(f"ESPN equipos: {exc}")
        team_ids = result.get("espnTeamIds") or {}

    try:
        events = get_events()
        if len(events) >= 60:
            result["events"] = events
            used.append(f"{len(events)} partidos")
        else:
            warnings.append(f"ESPN calendario incompleto: {len(events)} partidos")
    except Exception as exc:
        warnings.append(f"ESPN calendario: {exc}")

    try:
        standings = parse_standings()
        if len(standings) >= 18:
            result["standings"] = standings
            used.append("clasificación")
    except Exception as exc:
        warnings.append(f"ESPN clasificación: {exc}")

    squads = dict(result.get("squads") or {})
    if team_ids and len(squads) < 18:
        for code, tid in team_ids.items():
            try:
                roster = get_roster(tid)
                if roster:
                    squads[code] = roster
            except Exception as exc:
                warnings.append(f"ESPN plantilla {code}: {exc}")
        result["squads"] = squads
        if len(squads) >= 18:
            used.append(f"{len(squads)} plantillas")

    if result.get("events"):
        result["teamExtras"] = build_extras(result["events"], squads)

    result["warnings"] = warnings[-30:]
    result["fallback_provider"] = "ESPN" if used else result.get("fallback_provider")
    result["source"] = "ESPN (respaldo) + SofaScore (cuando disponible) + GitHub Issues (foros)"
    result["updated"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print("ESPN fallback:", ", ".join(used) if used else "sin datos nuevos")

if __name__ == "__main__":
    main()
