import json, os, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "catalog.json"
DIR = ROOT / "catalog"
TARGET = int(os.getenv("TARGET_CANDIDATES", "1000"))
CHECKS = int(os.getenv("MAX_METADATA_CHECKS", "160"))
CATS = [
 ("filmes","Filmes",'mediatype:movies AND (subject:film OR subject:cinema)'),
 ("desenhos","Desenhos",'mediatype:movies AND (subject:animation OR subject:cartoons)'),
 ("series","Séries",'mediatype:movies AND (subject:television OR subject:tv series OR subject:serials)'),
 ("documentarios","Documentários",'mediatype:movies AND (subject:documentary OR subject:documentaries)'),
 ("comedia","Comédia",'mediatype:movies AND (subject:comedy OR subject:humor)'),
 ("historia","História",'mediatype:movies AND (subject:history OR subject:historical)'),
 ("ciencia","Ciência e espaço",'mediatype:movies AND (subject:science OR subject:space OR subject:astronomy OR subject:nasa)'),
 ("musica","Música e shows",'mediatype:movies AND (subject:music OR subject:concerts OR subject:performance)')
]
VIDEO_EXT = (".mp4",".m4v",".webm",".ogv",".mov",".mpeg",".mpg",".avi")

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent":"PLAYERS-catalog/1.0","Accept":"application/json"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            print("Request error:", e)
            time.sleep(2)
    return None

def text(v):
    return ", ".join(map(str,v)) if isinstance(v,list) else str(v or "").strip()

def search(query, page, rows):
    params = [("q",query),("fl[]","identifier"),("fl[]","title"),("fl[]","description"),("fl[]","year"),("fl[]","creator"),("fl[]","licenseurl"),("rows",str(rows)),("page",str(page)),("output","json"),("sort[]","downloads desc")]
    return get_json("https://archive.org/advancedsearch.php?"+urllib.parse.urlencode(params))

def validate(item):
    meta = get_json("https://archive.org/metadata/"+urllib.parse.quote(item["identifier"],safe=""))
    if not meta or not isinstance(meta.get("files"),list): return None
    files=[]
    for f in meta["files"]:
        name=text(f.get("name"))
        if name.lower().endswith(VIDEO_EXT) and not f.get("private"):
            files.append({"name":name,"format":text(f.get("format")),"size":int(f.get("size") or 0),"url":"https://archive.org/download/"+urllib.parse.quote(item["identifier"],safe="")+"/"+urllib.parse.quote(name,safe="/")})
    if not files: return None
    files.sort(key=lambda x:(not x["name"].lower().endswith((".mp4",".webm",".m4v")),-x["size"]))
    item["files"]=files[:8]
    item["playbackUrl"]=files[0]["url"]
    item["validatedAt"]=datetime.now(timezone.utc).isoformat()
    return item

def main():
    DIR.mkdir(exist_ok=True)
    old={}
    try:
        previous=json.loads(OUT.read_text(encoding="utf-8"))
        for x in previous.get("items",[]):
            if x.get("identifier") and x.get("playbackUrl"): old[x["identifier"]]=x
    except Exception: pass
    for key,_,_ in CATS:
        try:
            previous=json.loads((DIR/(key+".json")).read_text(encoding="utf-8"))
            for x in previous.get("items",[]):
                if x.get("identifier") and x.get("playbackUrl"): old.setdefault(x["identifier"],x)
        except Exception: pass
    per=max(1,(TARGET+len(CATS)-1)//len(CATS))
    candidates=[]; seen=set()
    for key,title,query in CATS:
        page=1; added=0
        while added<per:
            payload=search(query,page,min(200,per-added))
            docs=(payload or {}).get("response",{}).get("docs",[])
            if not docs: break
            for d in docs:
                ident=text(d.get("identifier")); name=text(d.get("title"))
                if not ident or not name or ident in seen: continue
                seen.add(ident); added+=1
                candidates.append({"identifier":ident,"title":name,"description":text(d.get("description"))[:1200],"year":text(d.get("year")),"creator":text(d.get("creator")),"license":text(d.get("licenseurl")),"detailsUrl":"https://archive.org/details/"+ident,"thumbnail":"https://archive.org/services/img/"+ident,"category":key,"files":[],"playbackUrl":None})
                if added>=per: break
            page+=1; time.sleep(.15)
        print(key, "candidates:",added)
    print("Unique candidates:",len(candidates),"target:",TARGET)
    checked=0
    for item in candidates:
        if item["identifier"] in old or checked>=CHECKS: continue
        checked+=1
        valid=validate(item)
        if valid: old[valid["identifier"]]=valid
        time.sleep(.2)
    groups={key:[] for key,_,_ in CATS}
    candidate_ids={x["identifier"]:x["category"] for x in candidates}
    for ident,item in old.items():
        item["category"]=candidate_ids.get(ident,item.get("category","filmes"))
        if item["category"] not in groups: item["category"]="filmes"
        groups[item["category"]].append(item)
    now=datetime.now(timezone.utc).isoformat()
    for key,title,_ in CATS:
        items=sorted(groups[key],key=lambda x:x.get("title","").casefold())
        (DIR/(key+".json")).write_text(json.dumps({"category":key,"title":title,"updatedAt":now,"count":len(items),"items":items},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    items=sorted([x for group in groups.values() for x in group],key=lambda x:(x.get("category",""),x.get("title","").casefold()))
    catalog={"schemaVersion":1,"source":"Internet Archive","updatedAt":now,"candidateTarget":TARGET,"candidatesCollectedThisRun":len(candidates),"metadataChecksThisRun":checked,"count":len(items),"items":items,"categories":[{"key":k,"title":t,"count":len(groups[k]),"path":"catalog/"+k+".json"} for k,t,_ in CATS],"notes":["Items are included only when a video file is found.","Check rights and licenses per item; an Archive listing is not automatically public domain.","Playback support depends on the file format and browser."]}
    tmp=OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    tmp.replace(OUT)
    print("Saved",len(items),"validated items; metadata checks:",checked)

if __name__=="__main__": main()
