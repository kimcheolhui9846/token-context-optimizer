# 제품 MCP 원본·개요·영역 보기 비교

- Tier E. 기준 `origin/main` `41fc769`. 2026-11-23 승인된 첫 후속 과제다(사용자: "권장안대로 가보자 그리고 추가적으로 개선안 있으면 계속 찾아보고")
- Orca Task `task_0580dbf92206`. 연구 담당 Claude Code, PM Codex(Astra)
- 범위: 검토용 Draft PR까지. 실험 API 비용 0원
  - 다음은 범위 밖이다: 연구 API 지출, 논문 송부, Ready, merge, 설치, 전역 설정
  - D04는 계속 사용자 직접 송부 보류다
- 프로토콜: [research/plans/2026-11-23-mcp-view-comparison-protocol.md](../../../research/plans/2026-11-23-mcp-view-comparison-protocol.md)

## 소유 경로

- `research/plans/*mcp-view-comparison*.md`
- `research/src/mcp-view-comparison*`
- `research/tools/mcp-view-comparison*`
- `research/test/mcp-view-comparison*`
- `research/results/mcp-view-comparison/**`
- `docs/agent/handoffs/mcp-view-comparison.md`

다음은 읽기만 한다: 기존 R09 자료, 제품, 과거 연구, 제출본, WBS.

## 검토 구분

| 검토 | 주체 | 상태 |
|---|---|---|
| 계획 검토 | Claude Opus 5.5(`harness-opus-review`) | 1차 CHANGES REQUIRED, 재심 PASS WITH NOTES(Task 요청서 기준) |
| 마일스톤 검토 | Claude Opus 5.5, 독립 | 1차 CHANGES REQUIRED(Blocker 0, Major 1: 게이트 미기록, Minor 4, Nit 1, Note 4). 수치 재계산·처음부터 재실행은 모두 일치했다. `e3bfa94` 반영 뒤 2차 **PASS WITH NOTES**(Note A 게이트 근거 위치·대상 커밋, Nit A 검산기 KeyError로 멈춤 → 안전한 쪽이라 남김). 기록 `codex_review/review_2026-11-23_pr141-mcp-view-opus.md` |
| 프로젝트 교차 확인 | Argon(gemini-4-argon) | APPROVE 2회(결과 커밋, fix 커밋), 결함 0. 기록 `codex_review/argon/2026-11-23_mcp-view-comparison-*`, `-fix-*` |
| 최종 판정 | PM Astra | `3d660e4` CHANGES REQUIRED(Major 2: 원본 요청이 JPEG로 성공, 호출자·질문 변경 미검출). 반영 뒤 재판정 대기 |
| PM 반영 재검토 | Claude Opus 5.5, 독립(새 세션) | **PASS WITH NOTES**. Major 2건 해소. Minor: RGB SHA 표 동결 미포함(한계로 기재). Nit: 테스트 임시 폴더 미정리(수정). Note 2건 |
| PM 반영 교차 확인 | Argon | APPROVE(결함 0). `codex_review/argon/2026-11-23_pr141-pmfix-*` |

## 진행

- [x] 인계 기록과 프로토콜(표 스키마·호출 흐름) 커밋. 실행 전 `a267b48`. Draft PR [#141](https://github.com/kimcheolhui9846/token-context-optimizer/pull/141)
- [x] 테스트 RED `9050b9f`(하네스 모듈 부재로 실패) → 하네스 GREEN 19/19 `85c9c2d`. RGB 파생 manifest와 준비 검산을 측정 전에 같은 커밋에 고정
- [x] 실행 A·B, LF 사본 실행 C, Python 독립 검산
- [x] 전체 게이트(`cd1b908`)
  - 빌드 전 `git status --short`는 비어 있었다
  - npm 7종(`ci --ignore-scripts`, `build`, `test`, `typecheck`, `smoke:mcp`, `validate:plugin`, `benchmark`) 모두 종료 0. test는 58파일, 4,562 통과, 5 건너뜀이다
  - 빌드 뒤 `bin/token-context-optimizer.mjs`가 수정됨으로 보였다. 줄바꿈만 다르고 blob이 `5709a18`로 같아, 이번 빌드로만 바뀐 그 파일만 되돌렸다
  - 연구 테스트 전체 119/119 통과, `git diff --check` 0, 변경 경로는 모두 소유 경로다
  - 로그와 종료 코드: `codex_review/gates/2026-11-23_pr141-mcp-view-comparison/`(비추적)
  - 게이트 대상은 `cd1b908`이다. `e3bfa94`는 연구 파일만 바꿨고, 그 뒤 연구 테스트 125/125다
- [x] Argon APPROVE
- [x] Opus 마일스톤 검토 반영(`fix(review)`)
  - Major 1(게이트): 위 기록으로 해소
  - Minor 1–4, Nit 1: 검사를 더 엄격하게만 고쳤다. 새 테스트 6개 RED(새 export 부재) 뒤 GREEN 25/25
  - Note 1–4: RESULTS.md 한계에 적었다
  - 수정 코드로 처음부터 다시 실행했다. A·B 결정적 출력과 검산이 커밋된 결과와 바이트 단위로 같았고, 측정값은 바뀌지 않았다. 변경 내역은 프로토콜 §11에 있다
- [x] PM 검토 반영(`codex_review/review_2026-11-23_pr141-mcp-view-pm.md`)
  - RED `a22aed9`: Major 1 테스트 4개는 수정 전 `outcome: ok`로 실패했다
    - 예정 원본과 폴백 원본에 전체 크기 JPEG가 온 경우
    - 원본 참조에 이미지 본문이 함께 온 경우
    - 부분 요청에 원본 참조가 온 경우
  - RED `a22aed9`: Major 2는 수정 전 실행기가 변경된 배정을 받아들이고 뒤의 무관한 이미지 검사에서 멈췄다. 단위 테스트는 미구현 placeholder로 실패했다. 기록은 `codex_review/gates/2026-11-23_pr141-mcp-view-comparison-pmfix/red-before-fix.log`
  - 수정 `a0f22fc`
    - 전체 크기 요청은 이미지 본문 없는 원본 참조만 받고, 실제로 열어 해시를 확인해야 성공이다
    - 부분 요청은 cropped JPEG만 받는다
    - 실행기는 서버를 띄우기 전에 `FROZEN_INPUTS`(기준 커밋에서 고정)로 배정·투영·질문·원본 SHA를 대조한다
  - GREEN 33/33
  - 재실행 `1f2ee11`: A·B(CRLF)·C(LF 사본) 서로 바이트 일치
    - 정규 측정값 불변. `raw.jsonl`, `cells.jsonl`, `summary.md`, `recount.json` 동일
    - 바뀐 것은 `input-check.json`의 새 필드 `frozenInputs`와 그에 따른 evidence 해시뿐이다. 그 필드를 빼면 이전 파일과 같다. 대조 기록 `pm-fix-comparison.json`
  - 게이트(`1f2ee11`). 로그 `codex_review/gates/2026-11-23_pr141-mcp-view-comparison-pmfix/`
    - npm 7종 중 6종 종료 0
    - `npm test`는 기본 병렬에서 시간 초과로 종료 1이었다. 첫 회는 3건으로 검토자 파이프라인과 동시 실행, 재실행은 1건이다. 모두 `policy-redos-group3`·`summarizer-selection`의 5s/60s 시간 초과다
    - 두 파일 단독 실행은 20/20 통과
    - `VITEST_MAX_WORKERS=1 npm test`는 58파일, 4,562 통과, 5 건너뜀, 종료 0이다. PR #140 PM 기록과 같은 양상이고, 이 PR은 제품 코드를 바꾸지 않았다
    - 빌드가 줄바꿈만 바꾼 `bin/`은 되돌렸다(blob `5709a18` 불변)
    - 연구 테스트 133/133
  - 재검토 Nit 반영: 새 테스트의 임시 폴더를 `after()`에서 지운다. 테스트 전용 변경이라 측정과 무관하다
- [ ] PM 재판정

## 결과 요약

[RESULTS.md](../../../research/results/mcp-view-comparison/RESULTS.md)

- 회색조 원본은 strict·tolerant 모두 색인에서 거부되었다(`unsupported_png_profile`)
  - 6셀 × 48 = 288행이고, 후속 도구는 호출하지 않았다
  - 이 행들은 분모에 남고, 근거 포함은 평가 불가다
- 무메타데이터 RGB 파생본은 두 프로필 모두 48/48 수락되었다
  - 원본 보기: 원본 참조를 실제로 열어 해시가 일치했다(96/96)
  - 개요: 512×384로 디코드했다(192/192)
- 영역(R09 좌표 재생): 부분 JPEG 36, 원본 폴백 12(KO·nl 전부). 포함 47/48
  - partial 1건(`status-cards-code-s1-ko`)은 답 값이 2px 잘렸다
  - 응답과 호출자 모두 잘림을 알지 못했다. 재조회 0
- 재현
  - A·B 바이트 일치, LF 사본 C도 A와 바이트 일치
  - Python 검산 불일치 0
  - 가드 13/실행, 차단 0
- 추가 개선 후보 5건은 RESULTS.md §5에 있다. 모두 이번 범위 밖이다
