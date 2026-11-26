"""Run the frozen Korean header-window study with local OCR, in a new directory."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

from scoring import HERE, compare, digest, geometry, read_image, summarize
from assess import indexed, read
from run import phase
from variants import build_variants

RESEARCH = HERE.parents[1]
ROOT = RESEARCH.parent
NAME = "ko-header-window-safety"
PRIOR = RESEARCH / "results/ko-fallback-header-holdout"
BASE = "221db060ecbc44ae9ff61ab5df9c0dfe73d2baf2"
PROTOCOL = RESEARCH / "plans/2026-11-26-ko-header-window-safety.md"


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1)+"\n", encoding="utf-8", newline="\n")


def git(*args):
    return subprocess.check_output(["git", *map(str,args)], cwd=ROOT).decode().strip()


def verify_lock(lock):
    if len(lock) != 40 or git("rev-parse",lock+"^") != BASE:
        raise ValueError("Expected the registered freeze directly on #158")
    paths = [HERE.relative_to(ROOT).as_posix(), PROTOCOL.relative_to(ROOT).as_posix()]
    if git("diff","--name-only",lock,"--",*paths):
        raise ValueError("Scientific files differ from freeze")
    for f in [*HERE.glob("*.py"), PROTOCOL]:
        rel = f.relative_to(ROOT).as_posix()
        if git("hash-object",str(f)) != git("rev-parse",lock+":"+rel):
            raise ValueError("Unregistered study file: "+f.name)


def prepare(data, font_path):
    previous = PRIOR/"set"
    desc, questions, roster = build_variants(read(previous/"design.json"), read(previous/"selector/questions.json"))
    write(data/"design.json",desc)
    write(data/"selector/questions.json",questions)
    write(data/"roster.json",roster)
    spec = importlib.util.spec_from_file_location("r09_render", RESEARCH/"tools/r09/render.py")
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    font_bytes = font_path.read_bytes()
    pin = read(RESEARCH/"tools/ko-blind-reader/registered.json")["fixed"]["font"]
    if digest(font_bytes) != pin["sha256"]:
        raise ValueError("Font pin mismatch")
    font, _ = renderer.load_font(font_bytes,pin["bodySize"],pin["weight"])
    sources = {s["id"]:s for s in desc["images"]}
    donor_meta = read(previous/"render/render.json")["images"]
    pred,coords = indexed(PRIOR/"pred/predictions.jsonl"),indexed(PRIOR/"build/coords.jsonl")
    meta, placements = {}, {}
    image_dir, layers = data/"render/images", data/"layers"
    image_dir.mkdir(parents=True); layers.mkdir()
    for row in roster:
        sid, did = row["id"], row["donor"]
        sheet = sources[sid]
        original_path = previous/"render/images"/(did+".png")
        original = read_image(original_path)
        if digest(original_path.read_bytes()) != donor_meta[did]["sha256"]:
            raise ValueError("Unregistered donor pixels")
        ink = dict(donor_meta[did]["items"])
        layer = Image.new("L",original.size,255)
        image = original.copy()
        for it in sheet["items"]:
            if it["id"] not in ("side-name","side-value"):
                continue
            rect = it["cell"]
            mask = Image.new("L",original.size,0)
            ImageDraw.Draw(mask).text((rect[0]+renderer.PAD_X,(rect[1]+rect[3])/2),
                                      it["text"],font=font,fill=255,anchor="lm")
            if mask.getbbox() is None:
                raise ValueError("Missing planted glyph")
            ink[it["id"]] = {"role":it["role"],"ink":list(mask.getbbox())}
            layer.paste(0,mask=mask); image.paste(0,mask=mask)
        path = image_dir/(sid+".png")
        if row["condition"]=="control":
            shutil.copyfile(original_path,path)
        else:
            image.save(path,compress_level=9)
        layer.save(layers/(sid+".png"),compress_level=9)
        meta[sid] = {"sha256":digest(path.read_bytes()),"items":ink}
        placements[sid] = geometry(image,original,sheet,ink,layer,row["condition"]!="control",pred[did],coords[did])
    if len(meta)!=15 or len({m["sha256"] for m in meta.values()})!=15:
        raise ValueError("Missing or duplicate stimulus")
    write(data/"render/render.json",{"images":meta})
    write(data/"placement.json",placements)


def evaluate(out):
    data = out/"set"
    pages = {s["id"]:s for s in read(data/"design.json")["images"]}
    roster = read(data/"roster.json")
    controls = {r["donor"]:r["id"] for r in roster if r["condition"]=="control"}
    meta = read(data/"render/render.json")["images"]
    pre = read(data/"placement.json")
    pred, coords = indexed(out/"pred/predictions.jsonl"),indexed(out/"build/coords.jsonl")
    prior_rows = {r["id"]:r for r in read(PRIOR/"measures.json")["rows"]}
    ids = {r["id"] for r in roster}
    if len(roster)!=15 or any(set(a)!=ids for a in (pages,meta,pre,pred,coords)):
        raise ValueError("Incomplete 15-page join")
    observations = []
    for rec in roster:
        sid, did = rec["id"],rec["donor"]
        page = pages[sid]
        src_file = data/"render/images"/(sid+".png")
        src, donor = read_image(src_file), read_image(PRIOR/"set/render/images"/(did+".png"))
        layer = read_image(data/"layers"/(sid+".png"))
        if len({digest(src_file.read_bytes()),meta[sid]["sha256"],pred[sid]["pngSha256"],coords[sid]["pngSha256"]})!=1:
            raise ValueError("OCR provenance mismatch")
        row = dict(rec,placement=pre[sid])
        for mode, source_id in (("natural",sid),("fixed",controls[did])):
            baseline = out/"build/w5"/(sid+".png") if mode=="natural" else None
            row[mode] = compare(src,donor,layer,page,meta[sid]["items"],pred[source_id],coords[source_id],
                                out/"displays"/mode/sid,baseline)
        observations.append(row)
    matched = {}
    for row in observations:
        if row["condition"]!="control":
            continue
        ref = prior_rows[row["donor"]]
        a = row["natural"]
        if not a["displayed"]:
            matched[row["donor"]]=False
            continue
        facts = {v["role"]:v for v in a["items"].values() if v["role"] in ref["marks"]}
        old = read_image(out/"displays/natural"/row["id"]/"w5.png")
        full = read_image(out/"displays/natural"/row["id"]/"full.png")
        matched[row["donor"]] = (a["applied"] and a["bothTitlesGoneAndBodyIntact"] and a["band"]==ref["headerRect"]
            and digest(old.tobytes())==ref["w5PixelSha256"] and digest(full.tobytes())==ref["w6PixelSha256"]
            and all((facts[k]["total"],facts[k]["w5"],facts[k]["full"])==(v["total"],v["w5"],v["w6"]) for k,v in ref["marks"].items()))
    for row in observations:
        row["controlMatches"]=matched[row["donor"]]
    return {"rows":observations,"summary":{m:summarize(observations,m) for m in ("natural","fixed")}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock",required=True)
    parser.add_argument("--font",required=True,type=Path)
    parser.add_argument("--out",required=True,type=Path)
    args = parser.parse_args()
    verify_lock(args.lock)
    out = args.out.resolve(); out.mkdir(parents=True,exist_ok=False)
    (out/"log").mkdir()
    data = out/"set"
    prepare(data,args.font)
    inputs = out/"input"
    shutil.copytree(data/"selector",inputs/"selector")
    shutil.copytree(data/"render/images",inputs/"render/images")
    env = dict(os.environ,PYTHONUTF8="1",PYTHONDONTWRITEBYTECODE="1")
    pipe = [shutil.which("node"),str(RESEARCH/"src/ko-blind-reader-pipeline.mjs")]
    guard = (RESEARCH/"tools/d03/guard/node-netguard.cjs").as_posix()
    offline = dict(env,NODE_OPTIONS=f'--require="{guard}"',D03_NET_LOG=str(out/"log/network.jsonl"),D03_STEP="header-window")
    phase("ocr",[*pipe,"ocr","--set",inputs,"--out",out/"ocr"],out,offline)
    phase("predict",[*pipe,"predict","--set",inputs,"--ocr",out/"ocr","--out",out/"pred"],out,env)
    practice = out/"practice"; practice.mkdir()
    shutil.copyfile(RESEARCH/"results/ko-blind-reader/mock/practice/design.json",practice/"design.json")
    phase("practice-render",[*pipe,"render","--set",practice,"--font",args.font.resolve()],out,env)
    phase("build",[*pipe,"build","--set",inputs,"--pred",out/"pred","--practice",practice,"--out",out/"build"],out,env)
    measures=evaluate(out)
    write(out/"results.json",dict(lock=args.lock,**measures))
    print(json.dumps(measures["summary"]))


if __name__=="__main__":
    main()
