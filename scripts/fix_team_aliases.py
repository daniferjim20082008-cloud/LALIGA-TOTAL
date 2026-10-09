#!/usr/bin/env python3
from pathlib import Path
import re

JS_CODE = '''function codeFor(t={}) {
    const vals = typeof t === "string" ? [t] : [t.displayName,t.shortDisplayName,t.name,t.location,t.slug,t.abbreviation];
    for (const v of vals) {
      const n=norm(v); if(!n) continue;
      const exact=aliasEntries.find(([a])=>n===a);
      if(exact) return exact[1];
      const matches=aliasEntries
        .filter(([a])=>a.length>=4 && (n.includes(a)||a.includes(n)))
        .sort((x,y)=>y[0].length-x[0].length);
      if(matches.length) return matches[0][1];
    }
    return null;
  }'''

for name in ['match-center.js','client-rosters.js','match-sofa-fallback.js']:
    p=Path(name)
    s=p.read_text(encoding='utf-8')
    s2,n=re.subn(r'function codeFor\(t=\{\}\)\s*\{.*?return null;\s*\}',JS_CODE,s,count=1,flags=re.S)
    if n!=1:
        raise SystemExit(f'No se pudo parchear codeFor en {name}: {n}')
    p.write_text(s2,encoding='utf-8')

p=Path('scripts/update_laliga_espn.py')
s=p.read_text(encoding='utf-8')
PY_ESPN='''def code_for(team: dict | str | None):
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
        matches = [(len(alias), code) for alias, code in ALIAS_TO_CODE.items() if len(alias) >= 4 and (n in alias or alias in n)]
        if matches:
            matches.sort(reverse=True)
            return matches[0][1]
    return None

'''
s2,n=re.subn(r'def code_for\(team: dict \| str \| None\):.*?(?=def get_json\()',PY_ESPN,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'No se pudo parchear update_laliga_espn.py: {n}')
p.write_text(s2,encoding='utf-8')

p=Path('scripts/update_laliga_total.py')
s=p.read_text(encoding='utf-8')
PY_SOFA='''def team_code(team) -> str | None:
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

'''
s2,n=re.subn(r'def team_code\(team\) -> str \| None:.*?(?=def http_json\()',PY_SOFA,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'No se pudo parchear update_laliga_total.py: {n}')
p.write_text(s2,encoding='utf-8')

print('Aliases de clubes corregidos en 5 archivos.')
