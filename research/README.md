# research/ — 이미지 논문 실험 코드

플러그인 패키지(`../package.json`, 번들, `src/`)와 분리된 실험 전용 폴더다. 이미지 처리는 sharp 0.35.4를 쓴다.
플러그인은 이 폴더를 import하지 않으며, 여기서 검증된 연산만 별도 Task로 플러그인에 옮긴다.

## 가장 얇은 수직 경로 파일럿 (thin slice)

목적: 전체 설계(selector, guard, OCR, 36 family held-out)를 다 만들기 전에, 프로토콜의 입력 조건과 출력 변환이
실제 모델 정확도와 청구 토큰에 차이를 만드는지 첫 숫자를 본다.

| 항목 | 값 |
| --- | --- |
| 데이터 | 코드로 생성한 합성 RGB PNG 6 family(문서·차트·UI 각 2), family당 질문 2개(작은 글자 1, 일반 1). 긴 변 2048 |
| 입력 조건 | clean, JPEG-only(q50), downscale-only(긴 변 ≤1024, PNG), combined(≤1024 → q50). 프로토콜 값 그대로 |
| arm | A 원본, B 긴 변 ≤1536 → JPEG q75, E oracle 근거 영역 crop(여백 48 clean px) → 같은 변환. C·D는 selector·OCR이 없어 제외 |
| 모델 | `gpt-4o-2024-11-20`, detail high, temperature 0, max_tokens 40. 호출 순서는 seed로 섞는다 |
| 채점 | 정규화 exact match(소문자, 공백·쉼표·$·따옴표·마침표 제거) |
| 호출 수 | 6 × 2 × 4 × 3 = 144 |

**오염 방지 규칙.** 이 세트는 개발용이다. calibration 12 family나 held-out 36 family로 쓰지 않는다. 본 데이터는 이 파일의
템플릿과 seed를 재사용하지 않고 새로 만든다. 이 결과를 보고 본 데이터의 템플릿이나 질문을 고르지 않는다.

**한계.** 셀당 12 slot이라 탐색용이며 유의성을 주장하지 않는다. 합성 이미지는 실제 문서를 대표하지 않는다. 근거 상자는
Arial 글자 폭 근사로 계산했다. crop·resize·JPEG는 sharp(libvips, mozjpeg 빌드의 baseline 모드)이며 플러그인의 jpeg-js와 다르다.

## 2차 파일럿 (dev2, pilot-002)

- 데이터: `src/families-dev2.mjs`. 12 family(템플릿 6개 × seed 2), family당 질문 3개, 작은 글자 13–14px와 밀집 레이아웃.
  GPT-4o high는 2048×1536을 1024×768로 줄여 처리하므로 13px 글자는 모델에 약 6.5px로 들어간다.
- arm: A, B, C, D, E. 호출 수 12 × 3 × 4 × 5 = 720.
  - C selector(`src/selector.mjs`): 배정된 variant를 tesseract.js 5.1.1로 OCR한다(긴 변 4096까지 확대). 질문의 키워드와 가장 잘
    맞는 행을 고르고, 그 행을 중심으로 전체 폭 띠(높이: 이미지 높이의 25%와 행 높이 6배 중 큰 값)를 잘라 arm 변환을 적용한다.
    맞는 행이 없으면 B와 같은 전체 프레임 변환이다. 정답이나 근거 상자는 쓰지 않는다.
  - D guard: 맞는 행이 없거나 그 행의 OCR confidence가 60 미만이면 배정 원본을 보낸다(fallback). 아니면 C와 같은 산출물이다.
- 집계에 selector가 근거 상자를 덮었는지(평가 전용, selector는 모름), 조건별 D fallback 수, D−C를 추가했다.

## 3차 파일럿 (dev3, pilot-003) — 실행 전에 정한 규칙

2026-10-14 사용자 결정: guard를 응답 기반 fallback으로 시험하고, selector 개선 2종을 함께 시험한다.

- 데이터: `src/families-dev3.mjs`. dev2 템플릿에 새 seed(3000번대). selector는 dev2를 보며 조정했으므로 dev2로 평가하지 않는다.
  템플릿은 같으므로 처음 보는 레이아웃에 대한 성능보다 낙관적일 수 있다.
- arm (B, C, D는 이번에 제외)
  - A: 원본.
  - C1 창 selector(`selectWindow`): OCR 행 매칭은 같고, 잘라 내는 영역을 2차원 창으로 바꿨다. 짧은 단어 8개 이상인 축 행이면
    세로 기둥, 아니면 행 오른쪽·아래로 넓힌 창이다(세부는 `SELECTOR_C1`). 맞는 행이 없으면 전체 프레임 변환.
  - C2 2단계 selector: 1단계에서 variant 전체를 detail low(이미지 85 토큰)로 보내 근거 영역 좌표(0–1000)를 JSON으로 받는다.
    여백(너비·높이의 6%, 최소 48px)을 더해 원래 해상도에서 자른 뒤 arm 변환을 적용하고, 2단계에서 detail high로 묻는다.
    좌표를 해석하지 못하면 전체 프레임 변환. 토큰과 비용은 두 호출의 합이다.
  - E: oracle crop.
  - C1R, C2R(파생): C1 또는 C2가 "UNREADABLE"로 답하면 같은 slot의 A 응답을 원본 재요청 결과로 쓴다.
    토큰은 두 호출의 합이다. A 호출은 원본 재요청과 같은 요청(temperature 0)이므로 다시 보내지 않고 재사용한다.
- 주 비교: clean 조건에서 C1R·C2R의 내용 정확도와 평균 토큰을 A와 비교한다. 나머지 조건과 arm은 보조 지표다.
- 호출: A, C1, E 각 144회, C2 288회(2단계). 셀당 36 slot.

## 공급자

`--provider openai`(기본, `gpt-4o-2024-11-20`, detail high) 또는 `--provider anthropic`(`claude-haiku-4-5-20251001`).
Anthropic은 `research/.env.local`에 `ANTHROPIC_API_KEY`가 필요하다. Anthropic 요청은 이미지를 텍스트 앞에 두고, OpenAI
요청은 pilot-001과 같게 텍스트 뒤에 둔다. 예측 토큰은 저장소 회계 문서의 식(GPT-4o 타일, Haiku 28px patch와 1568 상한)이며
Haiku 쪽은 공식 참조 구현의 이진 탐색을 선형 탐색으로 근사했다. 예산 상한은 실행(run-id)마다 따로 적용된다.

## 실행

```bash
cd research
npm install
npm run generate     # out/clean/*.png, out/families.json
npm run variants     # out/variants, out/arms, out/slots.json
npm run estimate     # 호출 없이 비용 상한 추정
npm run run          # 실제 호출 (기본 run-id pilot-001, 중단 후 재실행하면 이어서 실행)
npm run summarize    # out/runs/<run-id>/summary.{json,md}

# 2차 파일럿
node src/generate.mjs --set dev2
node src/variants.mjs --set dev2          # OCR 포함
node src/run.mjs --set dev2 --run-id pilot-002 [--provider anthropic]
node src/summarize.mjs --set dev2 --run-id pilot-002
```

API 키와 예산 상한은 `research/.env.local`(`OPENAI_API_KEY`, `RESEARCH_BUDGET_USD`)에 둔다. git에 올리지 않는다.
worktree에서 실행하면 main checkout의 `research/.env.local`을 찾는다. 예산 상한에 닿기 전에 호출을 멈춘다.

**실행 보호(2026-10-15, PR #33 리뷰 반영).** `src/run-guards.mjs`
- 예산 가드는 slot마다 상한 비용을 추정한다. C2는 위치 찾기 호출(detail low)까지 더해 두 호출로 센다. 예전 추정은 pilot-003의 C2 71건에서 실제보다 작았다. 새 추정은 576건 모두를 덮는다.
- 같은 run-id로 이어 실행할 때는 공급자, 모델, 지시문, 가격, 입력 manifest의 SHA-256으로 만든 지문이 처음 실행과 같아야 한다. 다르거나 지문이 없는 예전 실행이면 API 호출 전에 거부한다. config는 처음 실행 때만 쓰고, 이어 실행은 `resumes.jsonl`에 기록한다. 실험 3 하네스(별도 PR 예정)도 같은 규칙을 쓰며, 조건 목록은 나눠 실행할 수 있게 지문에서 뺀다.
- offline 테스트: `npm test`(`node --test test/run-guards.test.mjs`). API 키 없이 돈다.

`out/`은 git에 올리지 않는다. 같은 sharp 버전과 글꼴 환경에서는 clean PNG 생성이 결정적이다(이 PC에서 재생성한 SHA-256 6개가 일치). 다른 OS나 글꼴에서는 달라질 수 있다. 보고에 쓰는 결과는 `results/`에 복사해 커밋한다.

## 실험 3: 다중 턴 에이전트 세션 (RQ3)

계획 `plans/2026-10-14-agent-session-experiment-plan.md`, 사전 등록 `plans/2026-10-15-experiment3-preregistration-draft.md`.

- `src/sessions.mjs --split dev|calibration|heldout`: 8턴 대본 세션을 만든다(이미지 2장 + 로그 1개). held-out은 템플릿마다 기존 레이아웃 4세션과 새 레이아웃(`src/families-v2.mjs`) 4세션이다.
- `src/session-harness.mjs --split <s> --run-id <id> [--provider openai|anthropic] [--conditions S0,...]`: 조건 S0–S4를 실행한다.
  - 텍스트 도구는 실제 플러그인 번들(`../bin/token-context-optimizer.mjs`)을 MCP stdio로 호출한다(`src/mcp-client.mjs`).
  - Anthropic 경로는 `src/session-anthropic.mjs`(공식 SDK)다.
  - 같은 run-id의 이어 실행은 설정 지문이 같을 때만 허용한다. 끊긴 시도의 호출은 시도 ID로 집계에서 뺀다.
- `src/session-summarize.mjs --run-id <id>`: 문항 유형별 정확도, 세션당 입력 토큰, 정가 기준·캐시 기준 비용, 임계값 초과 턴 수를 집계한다.
- 결과: `results/s3-dev-*`, `results/s3-cal-*`, `results/s3-dev-haiku/`
