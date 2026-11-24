# 핸드오프: 새 합성 문서 96쪽에서 한국어 OCR × 한글 검색 키 4조건 재검증

- Task: `ko-ocr-holdout` (Orca task_2ca73e896573). Tier E. #147 후속.
- 브랜치: `claude/ko-ocr-holdout`, Draft PR #148, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`
- 프로토콜: `research/plans/2026-11-24-ko-ocr-holdout-protocol.md` (등록 `1fd978c`, 이후 규칙 변경 없음)
- 자료 작성자 지침·보고: `research/tools/ko-ocr-holdout/AUTHOR_BRIEF.md`, `AUTHOR_REPORT.md`
- 역할: PM Codex Astra, 연구 작성자 Claude Code Opus 5.5, 자료 작성자·Python 검산 작성자는 각각 별도 Sonnet 하위 에이전트(제한 명세만 전달), 마일스톤 검토 harness-opus-review(claude-opus-5-5).

## 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 사전등록·작성자 지침·핸드오프 커밋, Draft PR | 완료 | `1fd978c`, Draft PR #148 |
| 자료 작성 위임·동결 전 검사·자료 동결 | 완료 | `936baef`. 별도 작성자가 지침·렌더러만 읽고 `design.py` 작성. 두 번 생성·렌더 101파일 바이트 동일, 검사 1–4 통과(겹침 0, 예비 시드 0), 매니페스트 두 번 동일 SHA-256 `c8de0505…cc350f5a`. OCR 0회 |
| RED 시험 → 연구 코드 | 완료 | RED `5995f2d`(모듈 없음, 종료 1, `logs/red-before-lib.txt`), 구현 `c797193` |
| run A 실측, 예측 고정 | 완료 | 192행, 오류 0, 워커 교체 0, 가드 차단 0, 코드 `c797193` 깨끗. 예측 고정 `f31bc15`(채점 전 push) |
| run B, 채점, A/B 비교 | 완료 | `fa977c3`. 결정적 파일 5개 A/B 바이트 동일, `reproduced: true` |
| 독립 Python 검산 | 완료 | `7cfd7e3`. run A·B 종료 0, 검사 1–4 불일치 0, 검산기 시험 32/32 |
| 대상 시험, 제품 npm 7단계 | 완료 | 대상 12/12. 7단계 모두 종료 0(vitest 4639 통과·5 건너뜀). 빌드 전 깨끗했던 `bin/token-context-optimizer.mjs`가 줄바꿈만 바뀌어(내용 diff 0) 되돌림 |
| Opus 마일스톤 검토 | 완료 | PASS WITH NOTES(Blocker·Major 0). Minor 2(RESULTS 0분모 문장, 원인 문장) 반영, Note 5 기록 |
| Argon 최소 발췌 | 완료 | APPROVE, 지적 없음. 대표 3쪽(각 문서 종류의 사전순 첫 ko/nl ID)과 공개 합계만. 메인 checkout `codex_review/argon/2026-11-24_ko-ocr-holdout-{bundle,argon}.md` |
| 깨끗한 새 클론 재현 | 완료 | GitHub 새 클론 `7cfd7e3`에서 README 1–4단계: 자료 재생성 바이트 동일(PNG 96 포함), run A·B 차단 0, A/B `reproduced: true`, 게시본과 결정적 6파일 바이트 동일, 검산 종료 0, 대상 시험 12/12 |
| Astra 최종 판정 | 대기 | |

## 결과 요약 (run A = run B)

- 기준(run A O0K0): M 24, C 72, E 0, S 15. 주 집단 ko/nl: M_K 24, C_K 0, E_K 0.
- 엄격 성공 /96: O0K0 15, O0K1 15, O1K0 15, O1K1 19.
- ko/nl 회복: O1K1만 매치 24/24, 엄격 4/24(모두 intake). 나머지 세 조건 0/24.
- 손실 0(매치→미매치 0/72, 엄격→실패 0/15 전 조건), 대조군 새 엄격 0, 기술 오류 0.
- 낮은 엄격 비율은 창 위치와 줄 선택이 섞인 사후 관찰이다(RESULTS.md 해석 한계). 상세 `research/results/ko-ocr-holdout/RESULTS.md`.

## 경계와 메모

- 제품, 기존 연구 파일, 기존 PR(#145–#147), 논문, 패키지 manifest·lockfile은 변경하지 않았다. WBS는 갱신하지 않았다(PM 중앙 기록, 필수 완료 카운트 제외).
- #147은 Git 객체 `c0c2f5dd…`로만 읽었다. lib blob은 Git 무시 캐시에 바이트 그대로 꺼내 import한다.
- 측정 전 배선 OCR은 실행하지 않았다(프로토콜 §3.4). 측정 OCR은 run A·B와 새 클론 재현 run A·B뿐이다.
- 연구 API 비용 0원, GPU 0. Argon(BAZE) 호출 1회는 요청서의 교차 확인 절차다.
- 독립성 한계: 두 하위 에이전트의 읽기 금지는 지시로만 강제되며, 각자 보고한 열람 목록을 `AUTHOR_REPORT.md`와 이 문서에 남긴다. 검산 작성자는 `tools/ko-ocr-holdout/` 목록에서 `AUTHOR_*`·`design.py` 이름을 보았으나 열지 않았다고 보고했다.
- 순서 메모: 자료 검사 도구 `ko-ocr-holdout-data.mjs`는 동결 커밋에 함께 들어가 RED 대상 밖이다. 그 함수의 시험은 RED 커밋에 포함됐다.
- Opus Note: run B도 가드 표지 `koh-a`(설계상 가드 요약 동일), RED는 파일 단위 import 실패.
