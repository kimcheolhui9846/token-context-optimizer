# 인계: ko-row-height-holdout (오른쪽으로 넓힌 창 W1의 세로 범위를 선택 줄 근처로 제한하는 W2, 새 한국어 12원본 × 4배치)

- 날짜: 2026-11-24 · Task: Orca task_cb0c6ae4c956 · Tier E · #150 후속(사용자 승인)
- 작업자: Claude Code(Opus 5.5, 연구 작성자) · 마일스톤·최종 판정과 별도 클론 검증: Codex Astra(PM), 독립 Opus 검토(PM 배정)
- 브랜치 `claude/ko-row-height-holdout`, Draft PR #151. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. #147 `c0c2f5dd…`, #148 `2ab9ed14…`, #149 `fd7ba06e…`, #150 `b108e2f0…`는 Git 객체로만 읽는다.
- 프로토콜: `research/plans/2026-11-24-ko-row-height-protocol.md`. 검산 명세: `research/tools/ko-row-height/RECOUNT_SPEC.md`. 결과: `research/results/ko-row-height/RESULTS.md`. 재현: 같은 폴더 `README.md`.

## 상태

측정과 채점을 마쳤다. 남은 일은 PM의 독립 Opus 검토, 별도 클론 검증, 최종 판정이다. Ready·merge·제품 적용은 하지 않았다.

## 결과 요약 (분모 48, 오류 0, 미매치 0)

- 엄격 성공: W0 20, W1 48, W2 42.
- **L = 6/48 → 판정 `loss`.**
  - 6쪽 모두 `vert below` 배치에서 정답 값만 잘렸다(표지는 남음). 원본은 `venue-table-c1`, `proof-cards-c1`, `workshop-table-c0` 3개이고, 각 원본의 narrow·wide 두 쪽이다.
  - W2 아래 끝이 값 잉크 아래 끝보다 6쪽 모두 17px 위에 있다. 등록 때 적어 둔 위험이 실제로 일어났다.
  - `vert same`에서는 L이 0/24다.
- **J = 21/27, 원본 11개.** 21쪽 모두 `vert same`이다. `vert below`는 0/5이고, 기회 5쪽은 모두 손실 쪽이다. 제거 판정은 `observed_repeated_sources`이지만 L > 0이므로 "안전한 제거"로 읽지 않는다.
- 다른 기록 값: W1에서 완전히 보이던 64개(38쪽)가 W2에서 완전 15, 일부 9, 전혀 40으로 바뀌었다.
  - 완전 15개는 모두 W2가 W1을 물려받은 쪽이다.
  - 새로 완전히 보이게 된 값과 새 골드 증거는 0이다(불변식).
- 면적: 세로 제한을 받은 28쪽에서 평균 31.39%p(중앙 29.71, 최대 55.65)를 줄였다.
- 쪽 전체 창은 0이다. 엄격 성공의 전체 쪽 예외는 손계산 예제·시험으로만 확인했다.

## 커밋 순서 (동결 순서)

| 커밋 | 내용 |
|---|---|
| `de31b83` | 사전등록(프로토콜, 생성기, 명세, 손계산 예제, 시험) |
| `b4fea04` | 구현 전 RED 기록 |
| `5f43b9b` | RED 로그의 절대 경로를 `<worktree>`로 교체 |
| `d0cf271` | 구현(GREEN) |
| `13a26d8` | 자료 동결(manifest SHA-256 `6e3e4bd2…0b07`) |
| `375bf2e` | `DATA_COMMIT`·`MANIFEST_SHA256` 고정 |
| `826fbb1` | OCR 1회·K1 동결 |
| `c3a2463` | 예측(W0/W1/W2) 동결, 채점 측 미개봉 |
| `8b30ff7` | 채점 A, 재생·채점 B, A/B 비교, 검산, 변조, RESULTS |

공개 이력 주의사항:
- `b4fea04`에는 작업 트리 절대 경로가 한 줄 들어 있다. 이력을 다시 쓰지 않고 `5f43b9b`에서 바꿨다.
- `d0cf271`에서 `RECOUNT_SPEC.md`의 `newEvidenceW2` 정의를 증거 등급 차이로 구체화했다. 자료·OCR·채점이 생기기 전이다.

## 해시와 고정 객체

| 대상 | 값 |
|---|---|
| `ocr.jsonl` | `33013c81ffd37626ebe2a32257b9198af6f0e80e2752050586a24204789510a8` |
| `k1.jsonl` | `53fdb303f5b4726924ad46b1a1a06974af7bff9859f5fc1534cfb83ba57361fb` |
| `predictions.jsonl` | `3495db468e29bdfbc3a3785ad37dc34314e0de7a9ff6c78b4cf2718d3b9661a8` |
| 선택기 측 `questions.json` | `c00c66aa…7203` |
| K0 선택기 blob | `b3b4965b` |
| #147 K1 lib blob | `d882b664` |
| #147 run blob | `3ddf60ab` |
| #150 W1 blob | `6c23fc16` |
| 렌더러 blob | `b61cd9b3` |
| 글꼴 | `018174e8…` |
| tesseract.js / core | 5.1.1 / 5.1.1 |
| 언어 파일 eng | `5dc5d8d6…` |
| 언어 파일 kor | `ec174937…` |

- OCR 설정: eng+kor, OEM 1, 작업자 1개, 쪽당 시간 제한 180000ms, 오프라인 가드 차단 0.
- `guard-summary.json`에는 core 파일 16개의 SHA-256, 실제로 넘긴 스레드 옵션(없음), 승인 입력 49개가 들어 있다.

## 검증

- 시험: 구현 전 RED(`results/ko-row-height/logs/red-before-impl.txt`)에서 GREEN으로 바뀌었다. `ko-row-height` JS 16/16, Python 9/9이고, 연구 전체 `node --test test/*.test.mjs`는 149/149, `tools/d03/test_d03.py`는 25/25다.
- 제품 검증 명령 7개: `npm ci --ignore-scripts`, `build`, `test`(4639 통과, 5 건너뜀), `typecheck`, `smoke:mcp`, `validate:plugin`, `benchmark` 모두 종료 0이다.
  - 빌드 전 트리는 깨끗했다.
  - 빌드 뒤 `bin/token-context-optimizer.mjs`가 수정됨으로 보였지만 blob이 HEAD와 같아(줄바꿈 차이) 그 파일만 되돌렸다.
- 재생 A/B: `predictions.jsonl`, `inputs.json`, `score.jsonl`, `summary.json` 모두 바이트가 같다. 같은 동결 OCR을 다시 읽은 결정성 확인이다.
- 독립 검산 `recount.py`: A와 B 모두 검사 1, 1b, 2, 2b, 3, 4, 6이 통과했고 공개 표 6개는 칸 단위로 일치한다.
- 변조 10종은 모두 거부됐다: t12 교환, cutPixels 교환, 일부↔전혀 교환, 노출 분류 변경, 예측 W2 1px, ID 중복, ID 누락, 정답 1px, K1 적중 변조, 표 칸 변조.
- 새 클론에서 재현했다(원격 브랜치 head `8b30ff7`, 저장소 밖 보존 폴더).
  - 필요한 옛 Git 객체가 모두 있었다(`41fc769…` 포함).
  - research `npm ci --ignore-scripts` 뒤 재생·채점 결과가 커밋본과 바이트까지 같다.
  - 검산과 표 대조는 통과했다.
  - 자료를 다시 생성·렌더·배치했더니 커밋된 `data/`와 53개 파일과 manifest가 같다. 연구 시험은 149/149다.
- 독립성 한계: 검산기는 같은 저자가 같은 작업 중에 썼다.
  - PNG 해독, K0/K1, W1 부분은 #150 검산기를 옮긴 것이다.
  - W2, 노출, 채점, 집계, 짝, 표 부분은 새로 썼다.
  - 다른 언어·다른 코드 경로이지만 명세 해석의 공통 오류까지 막지는 못한다.

## 범위

- 수정한 곳은 `research/` 안의 이번 작업 전용 경로와 이 인계서뿐이다.
- 제품 코드, WBS, 원고, 다른 Task, 전역 설정은 바꾸지 않았다.
- 실험 API 비용은 0원이고 GPU·호스팅·Argon 전송은 없다.
- 임시 재현 폴더는 모두 저장소 밖에 보존했고 지우지 않았다.
