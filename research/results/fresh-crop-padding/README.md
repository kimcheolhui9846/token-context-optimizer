# FCP: 새 합성 문서 자르기 여백 0 대 4 — 자료와 재현

프로토콜: [`research/plans/2026-11-24-fresh-crop-padding-protocol.md`](../../plans/2026-11-24-fresh-crop-padding-protocol.md). 결과: [`RESULTS.md`](RESULTS.md)

## 폴더

| 경로 | 내용 |
|---|---|
| `frozen/selector-input/` | 선택기·제품 입력: `questions.json`(id, file, question), `index.json`(쌍·언어·문서형·레이아웃·앵커·변형, 치수, 원본 SHA), `images/` PNG 48장(자체 합성, 8비트 회색조) |
| `frozen/oracle/` | 채점·검산 전용: `design.json`(설계), `gold.json`(근거 잉크 상자), `render.json`(모든 항목 잉크 상자), `render-check.json`, `token-manifest.json`, `dedup-check.json` |
| `frozen/freeze-manifest.json` | 동결 파일 56개 원바이트 SHA, 두 번 생성 일치 기록, R09 52장 페이지 SHA 대조, 코드 blob, 자산 해시 |
| `run-{a,b}/` | 결정적: `caller.jsonl`, `raw.jsonl`, `conditions.jsonl`, `input-check.json`, `guard-summary.json`, 그 해시 `evidence.json`·`caller-evidence.json`. 비결정: `caller-meta.json`, `run-meta.json` |
| `score-{a,b}/` | `score.json`(행별·집계), `summary.md` |
| `comparison.json` | A·B 비교 |
| `recount/` | Python 독립 검산 결과 |

## 재현

명령은 `research/` 폴더에서 POSIX 셸(Git Bash)로 실행한다. 출력은 새 빈 폴더에 쓴다. `.gitattributes`(`* text=auto eol=lf`)가 동결 JSON을 LF로 꺼내 원바이트 해시가 맞는다.

### 1. 준비 (네트워크, 측정 아님)

```sh
npm ci --ignore-scripts
pip install pillow==12.3.0 fonttools==4.63.0         # 2단계 재생성에만 필요
```

- 영어 OCR 자료 `.cache/eng.traineddata`(SHA-256 `5dc5d8d6…d747`)는 [R09 README](../r09-bilingual/README.md)의 1단계와 같은 절차로 준비한다. 실측에서는 같은 SHA의 파일을 로컬 R09 작업 트리 연구 캐시에서 복사했다
- 글꼴 `NotoSansKR-VF.ttf`(SHA-256 `018174e8…53d0`)는 설치된 시스템 글꼴을 쓴다. 저장소에 넣지 않는다

### 2. 입력 재생성 대조 (선택)

```sh
F=/c/Windows/Fonts/NotoSansKR-VF.ttf
for g in out/fcp-gen1 out/fcp-gen2; do node src/fcp-build.mjs --out $g && python tools/r09/render.py --design $g/design.json --font "$F" --out $g; done
node src/fcp-freeze-inputs.mjs --gen1 out/fcp-gen1 --gen2 out/fcp-gen2 --out out/fcp-frozen
diff -r out/fcp-frozen results/fresh-crop-padding/frozen && echo same   # 파일 56개 + manifest가 같아야 한다
```

### 3. 측정 (오프라인 가드)

동결 입력은 커밋된 그대로여야 한다(수집기·실행기가 HEAD와 대조한다). 가드 기록은 저장소 밖 새 파일에 쓴다.

```sh
G="$PWD/tools/d03/guard/node-netguard.cjs"; LOG=<저장소 밖 새 파일>; R=out/fcp-rerun-a
NODE_OPTIONS="--require=$G" D03_NET_LOG="$LOG" D03_STEP=fcp-a-collect node src/fcp-collect.mjs --frozen results/fresh-crop-padding/frozen --out $R
NODE_OPTIONS="--require=$G" D03_NET_LOG="$LOG" D03_STEP=fcp-a-run node src/fcp-run.mjs --frozen results/fresh-crop-padding/frozen --run $R
node src/fcp-freeze-run.mjs --run $R --guard-log "$LOG" --step fcp-a
node src/fcp-score.mjs --run $R --frozen results/fresh-crop-padding/frozen --out out/fcp-rerun-score-a
python tools/fcp-recount.py --run $R --frozen results/fresh-crop-padding/frozen --score out/fcp-rerun-score-a --out out/fcp-rerun-recount.json
```

- 같은 기계에서 `caller.jsonl`, `raw.jsonl`, `conditions.jsonl`, `input-check.json`, `guard-summary.json`(같은 단계 표지일 때)이 `run-a/`와 바이트 동일해야 한다
- 두 실행 비교: `node src/fcp-compare.mjs --a <run-a> --b <run-b> --score-a <score-a> --score-b <score-b> --out <comparison.json>`
- `--non-measurement`는 배선 확인 전용이다(커밋 검사·가드 요구를 끈다). 측정에는 쓰지 않는다
