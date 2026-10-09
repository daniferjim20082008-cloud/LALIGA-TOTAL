#!/usr/bin/env python3
"""Cachea detalles de partidos desde las páginas oficiales de LALIGA.

Guarda marcador, goleadores, goles/tarjetas del minuto a minuto y estadísticas
principales. Los partidos finalizados con datos completos se conservan sin volver
a descargarse en cada ejecución; los pendientes se revisan de nuevo.
"""
from __future__ import annotations

import json
import re
import subprocess
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "official-match-data.json"
BASE = "https://www.laliga.com/es-ES/partido/temporada-2026-2027-laliga-ea-sports"

TEAM = {
    "ALA": {"name":"Deportivo Alavés","slugs":["deportivo-alaves"]},
    "ATH": {"name":"Athletic Club","slugs":["athletic-club"]},
    "ATM": {"name":"Atlético de Madrid","slugs":["atletico-de-madrid"]},
    "BET": {"name":"Real Betis","slugs":["real-betis"]},
    "CEL": {"name":"Celta","slugs":["rc-celta","celta"]},
    "DEP": {"name":"RC Deportivo","slugs":["rc-deportivo"]},
    "ELC": {"name":"Elche CF","slugs":["elche-cf"]},
    "ESP": {"name":"RCD Espanyol de Barcelona","slugs":["rcd-espanyol-de-barcelona"]},
    "BAR": {"name":"FC Barcelona","slugs":["fc-barcelona"]},
    "GET": {"name":"Getafe CF","slugs":["getafe-cf"]},
    "LEV": {"name":"Levante UD","slugs":["levante-ud"]},
    "MGA": {"name":"Málaga CF","slugs":["malaga-cf"]},
    "OSA": {"name":"CA Osasuna","slugs":["ca-osasuna"]},
    "RAC": {"name":"R. Racing Club","slugs":["r-racing-club","racing-club","real-racing-club","racing-santander"]},
    "RAY": {"name":"Rayo Vallecano","slugs":["rayo-vallecano"]},
    "RMA": {"name":"Real Madrid","slugs":["real-madrid"]},
    "RSO": {"name":"Real Sociedad","slugs":["real-sociedad"]},
    "SEV": {"name":"Sevilla FC","slugs":["sevilla-fc"]},
    "VAL": {"name":"Valencia CF","slugs":["valencia-cf"]},
    "VIL": {"name":"Villarreal CF","slugs":["villarreal-cf"]},
}

STAT_LABELS = {
    "posesion": "Posesión",
    "remates": "Remates",
    "efectividad": "Efectividad",
    "faltas": "Faltas",
    "tarjetas amarillas": "Tarjetas amarillas",
    "tarjetas rojas": "Tarjetas rojas",
    "fueras de juego": "Fueras de juego",
    "corners lanzados": "Córners lanzados",
    "penaltis": "Penaltis",
}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", value.lower()).strip()


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.texts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in ("script", "style", "noscript"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag.lower() in ("script", "style", "noscript") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if self.skip:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if text:
            self.texts.append(text)


def load_schedule():
    js = (
        "global.window={};require('./data.js');"
        "console.log(JSON.stringify({fixtures:window.LIGA_DATA.fixtures,roundDates:window.LIGA_DATA.roundDates}))"
    )
    raw = subprocess.check_output(["node", "-e", js], cwd=ROOT, text=True)
    return json.loads(raw)


def load_previous():
    try:
        data = json.loads(OUT.read_text("utf-8"))
        if isinstance(data, dict) and isinstance(data.get("matches"), dict):
            return data
    except Exception:
        pass
    return {"matches": {}}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; LaLigaTotalBot/5.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def page_url(round_no: int, home: str, away: str):
    for hs in TEAM[home]["slugs"]:
        for aws in TEAM[away]["slugs"]:
            yield f"{BASE}-{hs}-{aws}-{round_no}"


def page_matches_teams(texts: list[str], home: str, away: str) -> bool:
    hay = " | ".join(norm(x) for x in texts[:500])
    home_tokens = [norm(TEAM[home]["name"])] + [norm(x.replace("-", " ")) for x in TEAM[home]["slugs"]]
    away_tokens = [norm(TEAM[away]["name"])] + [norm(x.replace("-", " ")) for x in TEAM[away]["slugs"]]
    return any(x and x in hay for x in home_tokens) and any(x and x in hay for x in away_tokens)


def first_page(round_no: int, home: str, away: str):
    errors = []
    for url in page_url(round_no, home, away):
        try:
            html = fetch(url)
            parser = TextParser(); parser.feed(html)
            if page_matches_teams(parser.texts, home, away):
                return url, parser.texts
            errors.append(f"{url}: equipos no encontrados")
        except urllib.error.HTTPError as exc:
            errors.append(f"{url}: HTTP {exc.code}")
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    return None, errors


def find_score(texts: list[str]):
    # El encabezado oficial usa: local, N, -, N, visitante, Finalizado.
    for i in range(min(len(texts) - 4, 500)):
        if re.fullmatch(r"\d{1,2}", texts[i] or "") and texts[i+1] == "-" and re.fullmatch(r"\d{1,2}", texts[i+2] or ""):
            nearby = " ".join(texts[max(0, i-4):i+8])
            if "Finalizado" in nearby or "En directo" in nearby or "Descanso" in nearby:
                return int(texts[i]), int(texts[i+2])
    return None, None


def find_status(texts: list[str]):
    top = texts[:500]
    for value in ("Finalizado", "En directo", "Descanso", "Programado"):
        if value in top:
            return {"Finalizado":"finished","En directo":"inprogress","Descanso":"inprogress","Programado":"notstarted"}[value]
    return "unknown"


def find_scorers(texts: list[str], status_idx: int | None):
    if status_idx is None:
        return []
    out = []
    for text in texts[status_idx+1:status_idx+25]:
        if re.search(r"\b(?:LUN|MAR|MIE|MIÉ|JUE|VIE|SAB|SÁB|DOM)\b", text, re.I):
            break
        if re.search(r"\d{1,3}(?:\+\d+)?'", text) and not re.fullmatch(r"\d{1,3}(?:\+\d+)?'", text):
            if text not in out:
                out.append(text)
    return out[:12]


def find_incidents(texts: list[str]):
    try:
        start = next(i for i,t in enumerate(texts) if norm(t) == "comentarios")
    except StopIteration:
        start = 0
    out = []
    i = start
    while i < len(texts)-1:
        minute = texts[i]
        if re.fullmatch(r"\d{1,3}(?:\+\d+)?'", minute):
            # El comentario suele ser el siguiente nodo de texto útil.
            text = texts[i+1]
            low = norm(text)
            kind = None
            if "tarjeta amarilla" in low:
                kind = "yellow"
            elif "tarjeta roja" in low or "segunda tarjeta amarilla" in low:
                kind = "red"
            elif "goooo" in low or low.startswith("gol ") or " gol," in low:
                kind = "goal"
            if kind:
                item = {"minute": minute, "type": kind, "text": text}
                sig = (minute, kind, text)
                if not any((x["minute"],x["type"],x["text"]) == sig for x in out):
                    out.append(item)
        i += 1
    return out[:60]


def find_stats(texts: list[str]):
    norms = [norm(x) for x in texts]
    out = []
    for needle, label in STAT_LABELS.items():
        indexes = [i for i,n in enumerate(norms) if n == needle]
        if not indexes:
            continue
        i = indexes[-1]
        if i <= 0 or i >= len(texts)-1:
            continue
        home, away = texts[i-1], texts[i+1]
        if len(home) > 30 or len(away) > 30:
            continue
        out.append({"name": label, "home": home, "away": away})
    return out


def parse_match(round_no: int, home: str, away: str):
    url, payload = first_page(round_no, home, away)
    if not url:
        return None, payload
    texts = payload
    status = find_status(texts)
    hs, aws = find_score(texts)
    try:
        status_idx = next(i for i,t in enumerate(texts[:500]) if t in ("Finalizado","En directo","Descanso","Programado"))
    except StopIteration:
        status_idx = None
    result = {
        "round": round_no,
        "home": home,
        "away": away,
        "status": status,
        "homeScore": hs,
        "awayScore": aws,
        "scorers": find_scorers(texts, status_idx),
        "incidents": find_incidents(texts),
        "statistics": find_stats(texts),
        "url": url,
        "source": "LALIGA oficial",
        "updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    return result, []


def complete(item: dict) -> bool:
    return (
        item.get("status") == "finished"
        and item.get("homeScore") is not None
        and item.get("awayScore") is not None
        and bool(item.get("statistics"))
    )


def current_round_limit(round_dates: list[str]):
    today = date.today()
    # Incluye la ronda que empieza en los próximos dos días para obtener previa/estado.
    limit = 1
    for i, raw in enumerate(round_dates or [], start=1):
        try:
            d = date.fromisoformat(raw)
        except Exception:
            continue
        if d <= today + timedelta(days=2):
            limit = i
    return min(38, max(1, limit))


def main():
    schedule = load_schedule()
    fixtures = schedule.get("fixtures") or []
    round_dates = schedule.get("roundDates") or []
    previous = load_previous()
    matches = dict(previous.get("matches") or {})
    limit = current_round_limit(round_dates)
    warnings = []
    checked = updated = 0

    for round_no in range(1, min(limit, len(fixtures)) + 1):
        for pair in fixtures[round_no-1]:
            home, away = pair[0], pair[1]
            k = f"{round_no}:{home}:{away}"
            old = matches.get(k) or {}
            if complete(old):
                continue
            checked += 1
            item, errors = parse_match(round_no, home, away)
            if item:
                # No reemplaza una caché final válida por una página temporalmente incompleta.
                if old.get("status") == "finished" and item.get("status") != "finished":
                    continue
                matches[k] = {**old, **item}
                updated += 1
            elif errors:
                warnings.append(f"{k}: {errors[-1]}")

    result = {
        "updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "LALIGA oficial",
        "matches": matches,
        "warnings": warnings[-30:],
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Detalles oficiales LALIGA: ronda <= {limit}, revisados {checked}, actualizados {updated}, cacheados {len(matches)}")
    for warning in warnings[-10:]:
        print("AVISO:", warning)


if __name__ == "__main__":
    main()
