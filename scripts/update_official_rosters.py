#!/usr/bin/env python3
"""Cachea las plantillas oficiales 2026/27 desde las páginas públicas de LALIGA."""
from __future__ import annotations
import json, re, unicodedata, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'rosters-data.json'
BASE='https://www.laliga.com/clubes/{slug}/plantilla'
CLUBS={
 'ALA':('deportivo-alaves','Deportivo Alavés'),'ATH':('athletic-club','Athletic Club'),'ATM':('atletico-de-madrid','Atlético de Madrid'),
 'BET':('real-betis','Real Betis'),'CEL':('rc-celta','Celta'),'DEP':('rc-deportivo','RC Deportivo'),'ELC':('elche-cf','Elche CF'),
 'ESP':('rcd-espanyol','RCD Espanyol de Barcelona'),'BAR':('fc-barcelona','FC Barcelona'),'GET':('getafe-cf','Getafe CF'),
 'LEV':('levante-ud','Levante UD'),'MGA':('malaga-cf','Málaga CF'),'OSA':('ca-osasuna','CA Osasuna'),'RAC':('r-racing-club','R. Racing Club'),
 'RAY':('rayo-vallecano','Rayo Vallecano'),'RMA':('real-madrid','Real Madrid'),'RSO':('real-sociedad','Real Sociedad'),
 'SEV':('sevilla-fc','Sevilla FC'),'VAL':('valencia-cf','Valencia CF'),'VIL':('villarreal-cf','Villarreal CF')
}
SECTIONS={'Porteros':'POR','Defensas':'DEF','Centrocampistas':'MED','Delanteros':'DEL'}

class Parser(HTMLParser):
    def __init__(self): super().__init__(); self.skip=0; self.texts=[]; self.images=[]
    def handle_starttag(self,tag,attrs):
        if tag.lower() in ('script','style','noscript'): self.skip+=1
        if tag.lower()=='img':
            d=dict(attrs); src=d.get('src') or d.get('data-src') or d.get('srcset','').split(' ')[0]; alt=d.get('alt','')
            if src: self.images.append((alt,src))
    def handle_endtag(self,tag):
        if tag.lower() in ('script','style','noscript') and self.skip: self.skip-=1
    def handle_data(self,data):
        if self.skip:return
        t=re.sub(r'\s+',' ',data).strip()
        if t:self.texts.append(t)

def norm(s):
    s=unicodedata.normalize('NFKD',s or '');s=''.join(c for c in s if not unicodedata.combining(c));return re.sub(r'[^a-z0-9]+',' ',s.lower()).strip()

def abs_url(src):
    if not src:return ''
    if src.startswith('//'):return 'https:'+src
    if src.startswith('/'):return 'https://www.laliga.com'+src
    return src

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; LALIGATOTAL/6.0)','Accept-Language':'es-ES,es;q=0.9'})
    with urllib.request.urlopen(req,timeout=12) as r:return r.read().decode('utf-8','replace')

def image_for(name,images):
    n=norm(name)
    for alt,src in images:
        a=norm(alt)
        if n and (n in a or a in n) and len(a)>2:return abs_url(src)
    return ''

def crest_for(images):
    for alt,src in images:
        if 'escudo' in norm(alt):return abs_url(src)
    return ''

def field(block,label):
    try:i=block.index(label);return block[i+1] if i+1<len(block) else ''
    except ValueError:return ''

def parse(html,url):
    p=Parser();p.feed(html);texts=p.texts;players=[];seen=set()
    markers=[i for i,t in enumerate(texts) if t in SECTIONS]
    for idx,start in enumerate(markers):
        title=texts[start];pos=SECTIONS[title];end=markers[idx+1] if idx+1<len(markers) else min(len(texts),start+500)
        block=texts[start+1:end]
        i=0
        while i<len(block)-4:
            if re.fullmatch(r'\d{1,2}',block[i] or ''):
                num=block[i];name=block[i+1]
                nearby=block[i:i+16]
                if name not in ('Cuerpo técnico','Entrenador','Segundo entrenador') and len(name)>1 and norm(name) not in seen:
                    position=next((x for x in nearby[2:7] if x in ('Portero','Defensa','Centrocampista','Delantero')),None)
                    if position:
                        country=''
                        try:pi=nearby.index(position);country=nearby[pi+1] if pi+1<len(nearby) and nearby[pi+1] not in ('Nacimiento','Altura','Peso') else ''
                        except ValueError:pass
                        player={'id':f"laliga-{norm(name).replace(' ','-')}-{num}",'name':name,'shortName':name,'jerseyNumber':num,'position':pos,'country':country,
                                'birth':field(nearby,'Nacimiento'),'height':field(nearby,'Altura'),'weight':field(nearby,'Peso'),'photo':image_for(name,p.images),'official':url,
                                'sofaSearch':f"https://www.sofascore.com/es/search?q={urllib.parse.quote(name)}"}
                        players.append(player);seen.add(norm(name));i+=4;continue
            i+=1
    return players,crest_for(p.images)

def load_old():
    try:return json.loads(OUT.read_text('utf-8'))
    except Exception:return {'clubs':{}}

def fresh(old):
    try:
        dt=datetime.fromisoformat((old.get('updated') or '').replace('Z','+00:00'));return datetime.now(timezone.utc)-dt<timedelta(hours=12) and len(old.get('clubs',{}))>=18
    except Exception:return False

def main():
    old=load_old()
    if fresh(old):print('Plantillas oficiales: caché reciente, sin cambios');return
    clubs=dict(old.get('clubs') or {});warnings=[]
    for code,(slug,name) in CLUBS.items():
        url=BASE.format(slug=slug)
        try:
            players,crest=parse(fetch(url),url)
            if players:clubs[code]={'name':name,'url':url,'crest':crest,'players':players}
            else:warnings.append(f'{code}: sin jugadores parseados')
        except Exception as e:warnings.append(f'{code}: {e}')
    result={'updated':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'source':'LALIGA oficial','clubs':clubs,'warnings':warnings[-20:]}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf-8')
    print('Plantillas oficiales:',len(clubs),'clubes,',sum(len(x.get('players',[])) for x in clubs.values()),'jugadores')
    for w in warnings[-10:]:print('AVISO:',w)
if __name__=='__main__':main()
