#!/usr/bin/env python3
"""Actualiza los operadores de TV de LALIGA TOTAL desde la guía oficial de LALIGA.

Conserva broadcast-data.json si la web oficial no responde o el formato cambia.
"""
from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "broadcast-data.json"
URLS = (
    "https://www.laliga.com/iframes/external-consumer-broadcast",
    "https://www.laliga.com/donde-ver-laliga-easports",
)

ALIASES = {
    "ALA": ["deportivo alaves", "alaves"], "ATH": ["athletic club", "athletic bilbao"],
    "ATM": ["atletico madrid", "atletico de madrid", "atleti"], "BAR": ["fc barcelona", "barcelona", "barca"],
    "BET": ["real betis", "betis"], "CEL": ["celta", "rc celta", "celta de vigo"],
    "DEP": ["rc deportivo", "deportivo", "deportivo de a coruna", "deportivo la coruna"],
    "ELC": ["elche", "elche cf"], "ESP": ["rcd espanyol de barcelona", "rcd espanyol", "espanyol"],
    "GET": ["getafe", "getafe cf"], "LEV": ["levante", "levante ud"],
    "MGA": ["malaga", "malaga cf"], "OSA": ["ca osasuna", "osasuna"],
    "RAC": ["r racing club", "racing club", "racing santander", "real racing club"],
    "RAY": ["rayo vallecano", "rayo"], "RMA": ["real madrid", "real madrid cf"],
    "RSO": ["real sociedad"], "SEV": ["sevilla", "sevilla fc"],
    "VAL": ["valencia", "valencia cf"], "VIL": ["villarreal", "villarreal cf"],
}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


ALIAS_ROWS = [
    (norm(alias), code)
    for code, aliases in ALIASES.items()
    for alias in aliases
]


def code_for(name: str):
    """Devuelve el club priorizando coincidencias exactas y nombres más específicos."""
    n = norm(name)
    if not n:
        return None
    exact = [code for alias, code in ALIAS_ROWS if n == alias]
    if exact:
        return exact[0]
    candidates = []
    for alias, code in ALIAS_ROWS:
        if len(alias) < 4:
            continue
        if alias in n or n in alias:
            candidates.append((len(alias), code))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_row = False
        self.in_cell = False
        self.cell = []
        self.row = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "tr":
            self.in_row = True
            self.row = []
        elif self.in_row and tag in ("td", "th"):
            self.in_cell = True
            self.cell = []

    def handle_data(self, data):
        if self.in_cell:
            text = re.sub(r"\s+", " ", data).strip()
            if text:
                self.cell.append(text)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.in_row and tag in ("td", "th") and self.in_cell:
            self.row.append(" ".join(self.cell).strip())
            self.in_cell = False
        elif tag == "tr" and self.in_row:
            if self.row:
                self.rows.append(self.row)
            self.in_row = False


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; LaLigaTotalBot/4.1)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=35) as response:
        return response.read().decode("utf-8", "replace")


def split_match(text: str):
    parts = re.split(r"\s+VS\s+|\s+vs\.?\s+", text, maxsplit=1, flags=re.I)
    if len(parts) != 2:
        return None
    home, away = code_for(parts[0]), code_for(parts[1])
    return (home, away) if home and away else None


def clean_operator(text: str):
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text or text in ("-", "OPERADOR"):
        return []
    known = [
        ("DAZN EN ABIERTO", "DAZN EN ABIERTO"),
        ("Movistar LALIGA", "Movistar LALIGA"),
        ("Movistar Plus+", "Movistar Plus+"),
        ("Orange Fútbol 1", "Orange Fútbol 1"),
        ("Orange Futbol 1", "Orange Fútbol 1"),
        ("LALIGA TV por M+", "LALIGA TV por M+"),
        ("DAZN", "DAZN"),
    ]
    found = []
    low = norm(text)
    for needle, canonical in known:
        if norm(needle) in low and canonical not in found:
            found.append(canonical)
    if found:
        # DAZN está contenido en “DAZN EN ABIERTO”; conserva ambos solo si la fuente
        # contiene además una mención independiente a DAZN.
        if "DAZN EN ABIERTO" in found:
            remainder = text.replace("DAZN EN ABIERTO", "")
            if "DAZN" not in remainder:
                found = [x for x in found if x != "DAZN"]
        return found
    return [text]


def parse_rows(html: str):
    parser = TableParser()
    parser.feed(html)
    broadcasts = {}
    for row in parser.rows:
        match_cell = next((c for c in row if re.search(r"\bVS\b", c, re.I)), None)
        if not match_cell:
            continue
        pair = split_match(match_cell)
        if not pair:
            continue
        idx = row.index(match_cell)
        candidates = row[idx + 1:]
        operator_text = candidates[-1] if candidates else ""
        operators = clean_operator(operator_text)
        if operators:
            broadcasts[f"{pair[0]}:{pair[1]}"] = operators
    return broadcasts


def main():
    parsed = {}
    used_url = None
    errors = []
    for url in URLS:
        try:
            parsed = parse_rows(fetch(url))
            if parsed:
                used_url = url
                break
            errors.append(f"{url}: sin filas reconocibles")
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    if not parsed:
        print("AVISO: no se pudo actualizar operadores; se conserva la caché")
        for err in errors:
            print("AVISO:", err)
        return
    result = {
        "updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "LALIGA · guía oficial de operadores",
        "url": used_url,
        "broadcasts": parsed,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Operadores LALIGA: {len(parsed)} partidos actualizados")


if __name__ == "__main__":
    main()
