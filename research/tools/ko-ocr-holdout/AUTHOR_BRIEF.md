# 자료 작성자 지침 — 새 합성 업무 문서 96쪽 생성기

이 지침은 자료 작성자에게 주는 **전부**다. 이 문서, 고정 렌더러 `research/tools/r09/render.py`, 설치 글꼴 경로 말고는 아무것도 읽지 않는다. 특히 `research/results/`, `research/plans/`, `research/src/`, `research/test/`, `codex_review/`, `docs/`, Git 이력·PR은 열지 않는다. OCR을 실행하지 않는다. 커밋·push 하지 않는다.

## 만들 것

1. `research/tools/ko-ocr-holdout/design.py` — Python 3.12 표준 라이브러리만 쓴다. 같은 인자면 항상 같은 바이트를 쓴다.
   - `python design.py --out <dir> [--seed-map <json file>]`
   - `<dir>/design.json`, `<dir>/questions.json`을 쓴다(UTF-8, LF, `json.dumps(..., ensure_ascii=False, indent=1)` + 마지막 줄 바꿈). 폴더는 이미 있어도 되지만 다른 파일은 쓰지 않는다.
   - `--seed-map`: `{"<doctype>|<layout>|<anchor>|<seedPosition>": <seed>}` 형식의 선택적 대체표. 없으면 기본 시드.
2. `research/tools/ko-ocr-holdout/AUTHOR_REPORT.md` — 한국어. 실제로 연 파일 목록(전부), 실행한 명령, 어휘 출처(직접 지어냄), 도안 좌표 설계, 스스로 한 확인과 결과, 한계.

## 격자 (고정)

- 문서 종류(순서): `repair` 도서 수선 의뢰서, `greenhouse` 온실 작업 일지, `rental` 대여 물품 반납 기록.
- 레이아웃(순서): `slip`, `intake` (아래 도안 지침).
- 앵커(순서): `code`, `nl`.
- 시드 위치 0–3의 기본 시드: 101, 211, 307, 401. 예비 시드(대체표로만 들어옴): 503, 601, 701, 809.
- 언어: `en`, `ko`.
- 조합 일련번호 c = 0…11 (문서 종류 → 레이아웃 → 앵커 순서). 목표 슬롯 `slot = (seedPosition + c) % 4`. 대체 시드를 써도 슬롯은 원래 시드 위치로 계산한다.
- 페이지 ID `<doctype>-<layout>-<anchor>-s<seed>-<lang>`, 파일 `<ID>.png`, 짝 ID `<doctype>-<layout>-<anchor>-s<seed>`.
- `design.json["images"]`와 `questions.json["questions"]`의 순서: 조합 순서 → 시드 위치 → `en`, `ko`. 합계 96쪽.
- 난수: 짝마다 `random.Random(f"{doctype}|{layout}|{anchor}|{seed}")` 하나를 만들어 en·ko 공통 내용(레코드 선택, 수치, 코드)을 뽑는다. 두 언어는 같은 레코드를 번역한 것이다. 시드가 다르면 텍스트·값이 실제로 달라져야 한다.

## 내용 지침

- 각 페이지: 제목 1개(문서 종류 이름, 언어별), 필요하면 열·필드 이름 항목, 그리고 **레코드 정확히 4개**(슬롯 0–3, 읽는 순서: slip은 위→아래, intake는 왼쪽 영역 위→아래 다음 오른쪽 영역 위→아래).
- 레코드마다 별도 텍스트 항목으로:
  - 코드: 문서 종류별 접두어 `RP-`(repair), `GH-`(greenhouse), `RT-`(rental) + 숫자 4자리. 페이지 안 유일.
  - 자연어 이름: 그 레코드의 대상(책 제목·작물 구역·물품명 등)을 2–4단어(en)/2–4어절(ko) 자연어로. ko는 한글 위주. 페이지 안 유일하고, 다른 어떤 항목의 부분 문자열도 아니다.
  - 질문 대상 값: 문서 종류별 한 필드(예: repair 완료 예정일, greenhouse 관수량, rental 반납 수량·연체료 등). 값은 수치+단위·날짜·시각 형식이 가능하며, 페이지 안의 4개 레코드에서 서로 달라야 한다. en/ko 짝은 같은 값(단위 표기만 언어별로 바뀔 수 있음).
  - 그 밖의 필드 1개 이상(담당자·상태 등).
- 질문: 언어별 자연스러운 한 문장 문법을 문서 종류마다 정한다. code 앵커는 목표 레코드 코드 문자열을, nl 앵커는 목표 레코드 자연어 이름 문자열을 **페이지의 텍스트 그대로** 넣고, 목표 값 필드를 묻는다. 예시 형태(그대로 쓰지 않아도 된다): en `What is the due date for <ANCHOR>?`, ko `<ANCHOR>의 완료 예정일은 언제인가요?`. 질문 96개는 NFC·공백 정규화 뒤 서로 달라야 한다.
- 정답(`answer`)은 목표 레코드 값 항목의 텍스트와 정확히 같다.
- 어휘는 직접 지어낸다. 실존 기관·인물·상표를 쓰지 않는다. 글꼴에 없는 문자(이모지 등)를 쓰지 않는다.

## 도안 지침 (페이지 1280 × 960)

- `slip` 작업 전표: 제목 아래 레코드 4개를 가로 띠로 위에서 아래로 쌓는다. 띠마다 **왼쪽 식별 띠**(코드와 자연어 이름을 위아래로 담는 좁은 영역)와 **오른쪽 값 영역**(값과 다른 필드를 가로로 나란히)이 같은 높이로 나란하다. 띠 사이 가로 구분선.
- `intake` 접수 양식: 제목 아래 페이지를 좌우 두 영역으로 나누고 각 영역에 레코드 블록 2개를 위아래로 둔다. 블록마다 여러 줄(코드 줄, 이름 줄, "필드명 값" 형태 줄 등)이다. 필드명과 값은 별도 항목이다.
- 기존 표(table)·카드(cards)형 도안을 흉내 내지 말고 위 두 형태를 직접 좌표로 설계한다.
- 렌더러가 항목 텍스트를 셀 `[x0, y0, x1, y1]` 왼쪽에서 12px 들여 세로 가운데에 그린다. 모든 항목의 잉크가 자기 셀 안에 있고, 셀끼리 겹치지 않고, 잉크가 구분선(`rules`, `[x0, y0, x1, y1]` 반개방 사각형, 회색 190)에 닿지 않아야 한다. ko 텍스트는 en보다 폭이 다를 수 있으니 셀 폭을 넉넉히 잡는다.

## `design.json` 형식 (렌더러 입력)

```json
{
 "version": "ko-ocr-holdout-design-1",
 "set": "holdout",
 "font": {"file": "NotoSansKR-VF.ttf", "sha256": "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0", "weight": 400, "bodySize": 24, "titleSize": 32},
 "images": [
  {
   "id": "...", "pairId": "...", "lang": "en|ko", "doctype": "...", "layout": "slip|intake", "anchor": "code|nl",
   "seed": 101, "seedPosition": 0, "combo": 0, "slot": 0, "file": "<id>.png",
   "page": {"width": 1280, "height": 960},
   "question": "...", "answer": "...", "code": "<target code>", "label": "<target natural-language name>",
   "anchorItem": "<item id of the anchor>", "valueItem": "<item id of the value>", "goldItems": ["<anchorItem>", "<valueItem>"],
   "records": [{"slot": 0, "codeItem": "...", "labelItem": "...", "valueItem": "..."}, ...],
   "items": [{"id": "...", "role": "title|header|code|label|value|other", "record": 0, "text": "...", "cell": [x0, y0, x1, y1], "size": "body|title"}],
   "rules": [[x0, y0, x1, y1], ...]
  }
 ]
}
```

- `record`는 레코드 항목에만 붙인다. `goldItems`는 정확히 `[anchorItem, valueItem]`.
- `questions.json`: `{"version": "ko-ocr-holdout-questions-1", "questions": [{"id", "file", "question"}]}` — 이 세 필드만.

## 스스로 확인할 것

- 렌더: `python research/tools/r09/render.py --design <dir>/design.json --font C:/Windows/Fonts/NotoSansKR-VF.ttf --out <dir>` 가 종료 0, `render-check.json`의 `failedImages` 0. 저장소 밖 임시 폴더에서만 실행한다. 필요하면 몇 장을 눈으로 본다.
- `design.py`를 두 번 실행해 두 출력이 바이트로 같다.
- 위 유일성·질문 포함·정답 일치 조건.
