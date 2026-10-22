#!/usr/bin/python3
# HOSINO-GROUPFIX v1：before_dispatch 群判断改为 isGroup||群 sessionKey；fun-context onDispatch 只看 gkOf。用法 --apply | --revert
import sys, os, json, hashlib, shutil
H="/home/ubuntu/.openclaw"; PD=H+"/plugins/qq-group-followup-gate"; MF=H+"/patches/canonical-manifest.json"
BK="/root/hosino-backup-20261021-groupfix"; HERE=os.path.dirname(os.path.abspath(__file__)); MARK="HOSINO-GROUPFIX v1"
F={"index.js":("1a40f182","a7a483fe"),"fun-context.mjs":("4e947237","c3a280c6")}
sha=lambda f: hashlib.sha256(open(f,"rb").read()).hexdigest()
def put(src,dst):
    st=os.stat(dst); t=dst+".gf-tmp"; shutil.copy2(src,t); os.chown(t,st.st_uid,st.st_gid); os.chmod(t,st.st_mode&0o7777); os.replace(t,dst)
def apply():
    for n,(o,_) in F.items():
        if not sha(PD+"/"+n).startswith(o): raise SystemExit(f"{n} 线上 sha 不是 {o}，停止")
        if not sha(HERE+"/"+n).startswith(F[n][1]): raise SystemExit(f"staging {n} sha 不符")
    os.makedirs(BK,exist_ok=True)
    for n in F: shutil.copy2(PD+"/"+n,BK+"/"+n)
    shutil.copy2(MF,BK+"/canonical-manifest.json")
    for n in F: put(HERE+"/"+n,PD+"/"+n)
    m=json.load(open(MF)); ms=os.stat(MF); d=os.path.dirname(MF)+"/resources/hosino-20261021-groupfix"; os.makedirs(d,exist_ok=True); os.chown(d,ms.st_uid,ms.st_gid)
    for i,n in enumerate(F):
        tg=PD+"/"+n; es=[e for e in m["files"] if e.get("target")==tg]
        if len(es)!=1: raise SystemExit(f"manifest {n} 条目数 {len(es)}")
        e=es[0]; sp=d+f"/snapshot-{i}"; shutil.copy2(tg,sp); os.chown(sp,ms.st_uid,ms.st_gid); os.chmod(sp,0o600)
        rb=e.setdefault("recognizedBefore",[])
        if e["sha256"] not in rb: rb.append(e["sha256"])
        e["sha256"]=sha(tg); e["snapshot"]="resources/hosino-20261021-groupfix"+f"/snapshot-{i}"
    if not any(r.get("label")==MARK for r in m["markerRegistry"]): m["markerRegistry"].append({"label":MARK,"targets":[PD+"/index.js",PD+"/fun-context.mjs"],"marker":MARK})
    t=MF+".gf-tmp"; json.dump(m,open(t,"w"),ensure_ascii=False,indent=1); os.chown(t,ms.st_uid,ms.st_gid); os.chmod(t,ms.st_mode&0o7777); os.replace(t,MF)
    print("applied; manifest updated")
def revert():
    for n in F: put(BK+"/"+n,PD+"/"+n)
    put(BK+"/canonical-manifest.json",MF); print("reverted files+manifest; 需重启网关")
{"--apply":apply,"--revert":revert}[sys.argv[1]]()
