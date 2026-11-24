# 핸드오프: 한국어 OCR × 한글 검색 키 보존 4조건 실험

- Task: `ko-ocr-factorial` (Orca task_d794d8f4b49d). Tier E. PR #146 후속.
- 브랜치: `claude/ko-ocr-factorial`, Draft PR #147, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`
- 프로토콜: `research/plans/2026-11-24-ko-ocr-factorial-protocol.md` (등록 커밋 `a7b3804`, 이후 규칙 변경 없음)
- 채점 전용 명단: `research/results/ko-ocr-factorial/cohort.jsonl` (96행, SHA-256 `86ccac53…6b2eb3`)
- 역할: PM Codex Astra, 연구 작성자 Claude Code Opus 5.5, 독립 Python 검산은 별도 하위 에이전트(Sonnet, 명세만 전달), 마일스톤 검토 harness-opus-review(claude-opus-5-5).

## 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 사전등록·명단·핸드오프 커밋, Draft PR | 완료 | `a7b3804`, PR #147 |
| RED 시험 → 연구 코드 | 완료 | RED `8921cb4`(모듈 없음, 종료 1, `logs/red-before-lib.txt`), 구현 `5d212df`, 대상 시험 20/20 |
| run A/B 실측(384 페이지 OCR) | 완료 | 기술 오류 0, 워커 교체 0, 가드 차단 0. run A 예측 채점 전 고정 `9f4c6d6` |
| 채점, A/B 비교 | 완료 | 기준 엄격 성공 70/72 검증, O0K0 과거 대조 96/96, 결정적 파일 6개 A/B 바이트 동일 (`66bf1eb`) |
| 독립 Python 검산 | 완료 | run A·B 종료 0, 검산기 시험 50/50. 첫 실행 `denom` 키 명세 모호 5건 공개 |
| 연구 회귀, npm 7단계 | 완료 | 연구 153/153, 7단계 통과(빌드가 줄바꿈만 바꾼 `bin/` 파일 되돌림) |
| Argon 최소 발췌 대조 | 완료 | APPROVE, 지적 없음 (`codex_review/argon/2026-11-24_ko-ocr-factorial-*.md`) |
| Opus 마일스톤 검토 | 완료 | PASS WITH NOTES(Blocker·Major 0). Minor 1–3, Nit 4 반영, Note 5–10 기록 |
| Astra 최종 판정 1차 (`78ea93e`) | CHANGES REQUIRED | Major 2(README 셸 명령, A/B 행 비교 단방향), Minor 1(입력 객체 누락 시 `stop.json` 없음) |
| PM 지적 수정 | 완료 | `03022b4`(세 건, RED는 `logs/red-review-78ea93e.txt`), `b80aeb6`(새 클론 실행에서 찾은 tar `C:` 경로 문제). 대상 시험 28/28, 연구 161/161, 검산기 50/50 |
| 새 클론 README 재현 | 완료 | GitHub 새 클론 `b80aeb6`에서 README 1–3단계 + 게시본 대조: 192행, 차단 0, 검산 종료 0, 결정적 7개 파일 바이트 동일, 비교기 `reproduced: true` |
| Opus 수정 범위 재검토 | 완료 | `78ea93e..03022b4` PASS WITH NOTES(Blocker·Major 0, Note 6). `b80aeb6`은 README tar 한 줄 변경으로 검토 범위 밖 |
| Astra 최종 판정 2차 | 대기 | |

## 결과 요약 (run A = run B)

- 주 집단 24쪽: O1K1만 매치 24/24, 엄격 근거 회복 18/24. 나머지 세 조건 0/24.
- 대조 72쪽: 매치 손실 0/72 전 조건. 기준 엄격 성공 손실 O1 두 조건 1/70, 기준 비엄격 2쪽은 O1에서 엄격 성공.
- 전체 엄격 성공 /96: 70, 70, 71, 89. 교호 대비: 매치 회복 +24/24, 엄격 회복 +18/24, 매치 손실 0, 엄격 손실 0, 전체 +18/96.
- 상세: `research/results/ko-ocr-factorial/RESULTS.md`, 재현: 같은 폴더 `README.md`.

## 경계와 메모

- 제품, 기존 연구 파일, 기존 PR, 논문은 변경하지 않았다. 실험 수치를 WBS에 넣지 않았고 기존 필수 WBS 완료로 집계하지 않는다(WBS 갱신 안 함).
- #145·#146은 Git 객체(`708d9946…`, `cdff545c…`)로만 읽었다.
- 언어 파일은 `research/.cache/ko-ocr-factorial/`(Git 무시). 저장소에 모델·PNG 없음. 연구 API 비용 0원.
- 측정 전 배선 확인(`--non-measurement --limit 2`)으로 code 앵커 4쪽 × 2 OCR 조건을 저장소 밖에서 실행했다(채점 안 함). 첫 배선 시도는 OCR 전에 패키지 버전 조회 오류로 멈췄고 고친 뒤 커밋했다.
- run B는 가드 요약 바이트 비교를 위해 단계 표지 `kof-a`로 실행했다(가드 기록 파일은 별도, 저장소 밖).
- Opus Note: 검산 명세가 출력 구조를 자세히 옮겨 정의 수준 결합이 있다(N5). 워커 재생성 자체 실패 시 run이 멈추는 경우는 프로토콜에 없고 이번에는 발생하지 않았다(N8). 채점 시각은 커밋 순서로만 뒷받침된다(N9).
