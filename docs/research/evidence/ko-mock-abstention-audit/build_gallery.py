#!/usr/bin/env python3
"""공개 모의 표 자료의 회고 진단 갤러리(정적 HTML + PNG 사본)를 만든다."""
import argparse
import html
import json
import re
import sys
from pathlib import Path

UNKNOWN_POSITIONS = {1, 2, 7, 8, 10, 14, 17}
ASSIGNED = {"W1", "W4", "W5"}
VIEWS = (("source", "원본"), ("w1", "W1"), ("w4", "W4"), ("w5", "W5"))
ANCHORS = {"full": "전체 보임", "partial": "일부 보임", "absent": "안 보임",
           "no_source_ink": "원본에 글자 없음"}
SAFE_ID = re.compile(r"q[0-9a-f]{8}")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
NOTICE = "공개 모의 자료 · 비눈가림 AI 시연 · 사람 판독 성능 미측정"
STYLE = """
body{margin:0;padding:20px;font-family:"Malgun Gothic",sans-serif;background:#f5f6f8;color:#1b1f24;line-height:1.5}
.notice{padding:10px 14px;background:#fff3cd;border:1px solid #d9b84a;font-weight:700}
section{margin:24px 0;padding:14px;background:#fff;border:1px solid #d0d7de}
h2{margin:0 0 4px;font-size:18px;overflow-wrap:anywhere}
.scroll{overflow-x:auto}
.row{display:grid;grid-template-columns:repeat(4,minmax(260px,1fr));gap:10px;min-width:1070px}
figure{margin:0;padding:8px;border:2px solid #d0d7de;min-width:0}
figure.assigned{border-color:#0969da;background:#eef6ff}
figcaption{margin-bottom:6px;font-size:14px}
img{display:block;max-width:100%;height:auto;margin:auto;border:1px solid #eaeef2}
"""


def require(condition, message):
    if not condition:
        raise ValueError(message)


def header_status(value):
    require(isinstance(value, str) and value in ANCHORS, "알 수 없는 머리글 상태값")
    return ANCHORS[value]


def load_cases(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    cases = data.get("cases") if isinstance(data, dict) else None
    require(isinstance(cases, list) and len(cases) == 18, "cases 목록이 없음")
    seen = set()
    for case in cases:
        require(isinstance(case, dict), "case 형식 오류")
        require(type(case.get("pos")) is int, "pos는 정수여야 함")
        cid = case.get("id")
        require(isinstance(cid, str) and SAFE_ID.fullmatch(cid), "안전하지 않은 ID")
        require(cid.casefold() not in seen, "중복 ID")
        seen.add(cid.casefold())
        require(case.get("assigned") in ASSIGNED, "assigned 값 오류")
        require(type(case.get("unknown")) is bool, "unknown은 bool이어야 함")
        require(isinstance(case.get("question"), str), "question 형식 오류")
        views = case.get("views")
        require(isinstance(views, dict), "views 형식 오류")
        for key, _ in VIEWS:
            view = views.get(key)
            require(isinstance(view, dict), "view 누락")
            require(all(view.get(k) in ANCHORS for k in ("anchor", "value", "compValue")), "anchor 값 오류")
            header_status(view.get("targetHeader"))
            header_status(view.get("compHeader"))
    cases = sorted(cases, key=lambda c: c["pos"])
    require([c["pos"] for c in cases] == list(range(1, len(cases) + 1)),
            "pos가 1부터 연속되지 않거나 중복됨")
    unknown = {c["pos"] for c in cases if c["unknown"]}
    require(unknown == UNKNOWN_POSITIONS, "unknown 위치가 예상한 7건과 다름")
    return [c for c in cases if c["unknown"]]


def read_images(mock_work, cases):
    """쓰기 전에 모든 원본을 확인하고 읽는다. {출력 이름: 바이트}를 돌려준다."""
    root = mock_work.resolve(strict=True)
    images = {}
    for case in cases:
        for key, _ in VIEWS:
            folder = Path("gen", "render", "images") if key == "source" else Path("build", key)
            source = (root / folder / f"{case['id']}.png").resolve(strict=True)
            require(source.is_relative_to(root) and source.is_file(), "mock-work 밖의 원본 경로")
            data = source.read_bytes()
            require(data.startswith(PNG_MAGIC), "PNG가 아닌 원본")
            images[f"{case['pos']:02d}-{key}.png"] = data
    return images


def render(cases):
    parts = [
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        f"<title>모의 표 회고 진단</title>\n<style>{STYLE}</style>\n</head>\n<body>",
        f'<h1>한국어 표 판독에서 판단을 보류한 {len(cases)}문항</h1>\n<p class="notice">{NOTICE}</p>',
        "<p>이미지를 누르면 원래 크기 PNG가 열립니다. 좁은 화면에서는 옆으로 밀어 비교하세요.</p>",
    ]
    for case in cases:
        pos, assigned = case["pos"], case["assigned"]
        parts.append(f'<section>\n<h2>{pos:02d}번 · {html.escape(case["id"])}</h2>')
        parts.append(f"<p><strong>배정 방식: {assigned}</strong><br>"
                     f"질문: {html.escape(case['question'])}</p>")
        parts.append('<div class="scroll"><div class="row">')
        for key, label in VIEWS:
            view = case["views"][key]
            chosen = label == assigned
            name = f"images/{pos:02d}-{key}.png"
            parts.append(
                f'<figure{" class=\"assigned\"" if chosen else ""}>\n'
                f"<figcaption><strong>{label}{' (배정)' if chosen else ''}</strong><br>"
                f"질문한 열 제목 · {header_status(view['targetHeader'])}<br>"
                f"다른 열 제목 · {header_status(view['compHeader'])}<br>"
                f"두 값 · {ANCHORS[view['value']]} / {ANCHORS[view['compValue']]}<br>"
                f"행 이름 · {ANCHORS[view['anchor']]}</figcaption>\n"
                f'<a href="{name}" target="_blank" rel="noopener">'
                f'<img src="{name}" alt="{pos:02d}번 {label} 이미지"></a>\n</figure>'
            )
        parts.append("</div></div>\n</section>")
    parts.append("</body>\n</html>\n")
    return "\n".join(parts)


def write_gallery(out, images, page):
    out.mkdir(parents=True, exist_ok=True)
    root = out.resolve()
    folder = root / "images"
    folder.mkdir(exist_ok=True)
    require(folder.resolve() == folder, "images 폴더가 링크임")
    targets = [folder / name for name in images] + [root / "index.html"]
    # 기존 링크를 따라가 출력 폴더 밖을 덮어쓰지 않는다.
    require(all(t.resolve() == t for t in targets), "출력 파일이 링크임")
    for name, data in images.items():
        (folder / name).write_bytes(data)
    (root / "index.html").write_bytes(page.encode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("--mock-work", "--audit", "--out"):
        parser.add_argument(option, required=True, type=Path)
    args = parser.parse_args()
    try:
        cases = load_cases(args.audit)
        images = read_images(args.mock_work, cases)
        write_gallery(args.out, images, render(cases))
    except (OSError, ValueError) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    print(f"완료: {len(cases)}건, PNG {len(images)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
