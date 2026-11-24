# 자료 작성자 보고

## 실제로 연 파일 (전부)

- `research/tools/ko-ocr-holdout/AUTHOR_BRIEF.md` (읽음)
- `research/tools/r09/render.py` (읽음, 실행)
- `C:/Windows/Fonts/NotoSansKR-VF.ttf` (열지 않고 렌더러에 경로로만 넘김)
- 내가 만든 `design.py`, 이 보고서, 저장소 밖 임시 폴더의 생성물(design.json, questions.json, 렌더 PNG, render-check.json, review 시트 PNG 2장)
- 그 밖의 저장소 파일, Git 이력, PR, 네트워크, OCR은 열거나 쓰지 않았다.

## 실행한 명령

임시 폴더: `C:/Users/00/AppData/Local/Temp/claude/e30c1d267f974377/230ea477-9891-400b-996b-060ab82e5608/scratchpad/author/{a,b,r}`

1. `python design.py --out <S>/a`, `python design.py --out <S>/b`: 둘 다 `{"images": 96, "questions": 96}`. `cmp`로 `design.json`, `questions.json` 바이트 동일.
2. `python research/tools/r09/render.py --design <S>/a/design.json --font C:/Windows/Fonts/NotoSansKR-VF.ttf --out <S>/r --review repair-slip-code-s101 greenhouse-intake-nl-s211`: 종료 0, `images 96, failedImages 0`.
3. `design.json`에 CR 문자 0개. 두 review 시트(slip, intake)를 눈으로 확인했다. 텍스트 겹침과 구분선 접촉 없음.
4. `design.py` 내장 `check()`가 매 실행마다 검증한다: 96쪽, 질문 96개의 NFC·공백 정규화 유일성, 슬롯 공식, 질문이 앵커 문자열 포함, answer = 값 항목 텍스트, 앵커 텍스트가 페이지 항목 중 정확히 1곳에만 등장, 레코드 4개, 값 4개 서로 다름, 항목 id 유일, 코드·이름·값이 다른 항목의 부분 문자열이 아님, 같은 조합의 시드 4개 내용이 서로 다름.

## 어휘 출처

전부 직접 지어냈다. 외부 자료를 보지 않았다. 이름은 (형용 / 대상 / 종류) 3개 목록(각 10개, en·ko 짝)을 조합한다. 담당자 이름 10개는 지어낸 이름이다. 상태어는 문서 종류별 6개다. 책 제목, 작물 구역, 대여 물품 모두 실존 기관·인물·상표가 없다. 코드는 `RP-`, `GH-`, `RT-` + 4자리 난수다.

## 도안 좌표 설계 (1280×960, 제목 셀 [40,20,1240,80] 공통)

- **slip**: 열 머리 4개를 y 90–130에 둔다(코드/이름, 값, 담당자, 상태). 띠 4개의 높이는 190이고 상단 y = 140+190s 이다. 가로 구분선은 5개(두께 2)다. 띠마다 세로 구분선 [520,T+8,522,T+182]가 있다.
  - 왼쪽 식별 영역: 코드 [40,T+14,500,T+84], 이름 [40,T+100,500,T+170].
  - 오른쪽 값 영역(T+60~T+130): 값 [540–800], 담당자 [820–1030], 상태 [1040–1240].
  - 읽는 순서는 슬롯 0→3, 위에서 아래다.
- **intake**: 세로선 [638,100,640,880]을 기준으로 왼쪽 영역 x 40–620, 오른쪽 영역 x 660–1240으로 나눈다. 각 영역에 블록 2개를 두며 블록 상단은 y=130과 520이다. 두 블록 사이에는 [영역,490] 가로선이 있다.
  - 블록 내부는 높이 60, 간격 80인 6개 셀이다. 코드 줄, 이름 줄, 값 필드명(폭 260)+값, 담당자 필드명+값 순서다.
  - 슬롯은 왼쪽 영역 위(0), 왼쪽 아래(1), 오른쪽 위(2), 오른쪽 아래(3)다.
- 영어와 한국어 좌표는 같다. 셀 폭은 가장 긴 문자열(ko 4어절 이름, "29,900 KRW")보다 넉넉하다. 렌더러 검사가 통과했다.

## 질문 문법

| 문서 종류 | en | ko |
|---|---|---|
| repair | `What is the due date for <ANCHOR>?` | `<ANCHOR>의 완료 예정일은 언제인가요?` |
| greenhouse | `How much water was given to <ANCHOR>?` | `<ANCHOR>에 준 관수량은 얼마인가요?` |
| rental | `What late fee is recorded for <ANCHOR>?` | `<ANCHOR>의 연체료는 얼마로 기록되어 있나요?` |

값 형식: repair `2026-12-06`(en·ko 동일), greenhouse `39.0 L` / `39.0리터`, rental `3,200 KRW` / `3,200원`.

## 한계

- 값 필드명, 상태어, 담당자 이름은 문서 종류 안에서 반복된다. 유일한 것은 코드·이름·값이다.
- 난수 검증은 `random.Random` 문자열 시드(CPython 3.12)에 의존한다. 다른 버전에서 같은 바이트가 나오는지는 확인 불가.
- `--seed-map`은 문법 오류와 격자 밖 키만 검사한다. 예비 시드 503–809로 실제 실행해 보지는 않았다(기본 시드만 실행). 임의 시드에서도 재추첨 루프가 있어 검증은 통과하게 되어 있지만 실행 확인은 안 했다.
- Windows 콘솔은 출력이 cp949라 한국어 질문이 터미널에서 깨져 보인다. 파일 자체는 UTF-8이다.
- 글꼴 SHA256은 지침이 준 값을 그대로 쓴다. 렌더러가 일치를 확인하고 통과했다.
