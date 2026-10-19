# 텍스트 발췌 재현 벤치 — Task 39 수정 뒤 (excerpt-bench-002)

- 실행: 2026-10-19, Claude Code. 모델 호출 없음, 비용 0
- 목적: Codex Task 39(PR #45, `query_artifact` 동점 일치 줄 여러 구간 반환)의 합격 기준 확인. 기준은 `codex_review/codex_task39_request_2026-10-15_query-multi-match.md` "합격 기준"과 [excerpt-bench-001](../excerpt-bench-001/README.md) "쓰임"이다.
- 벤치·세션·질의 규칙·도구 인자(maxTokens 400, contextLines 1)는 001과 같다. `maxExcerpts`는 넘기지 않았다(기본값 5).
- 이번에 바꾼 벤치 코드(`src/excerpt-bench.mjs`, `src/mcp-client.mjs`)
  - `--bundle`: 비교할 플러그인 번들 경로. 기본값은 이 checkout의 `bin/`
  - `--sessions`: 세션 폴더 경로. 기본값은 `out/sessions`
  - `hitAny`: 돌려받은 발췌 중 **어느 것이든** 근거 줄을 덮고, 비교차 문항이면 그 발췌에 정답이 있으면 성공. 001의 `hit`(첫 발췌만 판정)도 그대로 기록한다.
  - 행마다 `excerptRanges`(모든 발췌 구간), `moreMatches`(생략된 동점 수)를 추가로 기록한다.
- 번들: `git show <커밋>:bin/token-context-optimizer.mjs`로 꺼내 scratchpad에서 실행했다. 저장소 `bin/`은 바꾸지 않았다.

| 구분 | 커밋 | SHA-256 |
|---|---|---|
| 수정 전 | main `c2237ca` | `1267f3de364b4b2ac73f3acea8e683897af075196c925412eea9fac22bbb22b4` |
| 수정 뒤 | PR #45 구현 커밋 `68fe59d`(head `ab000c2`와 bin 동일, 그 뒤는 핸드오프만 바뀜) | `98c707dab49072f8b210fe9ba3fe2cf9dde863844803666d68dbc632a25175fd` |

- 세션: 실험 3 세션 원자료(`out/sessions`, gitignore). 001과 같은 파일이다.

## 1. 수정 전 재현

- 수정 전 번들로 같은 벤치를 돌렸다(`before-summary.json`).
- 분할 3 × 규칙 3의 9칸 모두 001의 `summary.json`과 n·hit·동점·놓침·비최고점 값이 같다.
- 여러 발췌 응답 0건, 점수 복제본 불일치 0건이다. 벤치 코드 변경이 001 판정을 바꾸지 않았다.

## 2. 결과 (수정 뒤)

| 분할 | full | keywords | entity: 첫 발췌(hit) | entity: 어느 발췌든(hitAny) |
|---|---|---|---|---|
| held-out | 72/72 | 72/72 | 20/24 | **24/24** |
| calibration | 18/18 | 18/18 | 5/6 | **6/6** |
| 개발 | 9/9 | 9/9 | 2/3 | **3/3** |

- **합격 기준 충족.** entity 질의가 held-out 24/24, 전체 33/33으로 근거 줄을 덮는다. full·keywords는 99/99를 유지한다(hit·hitAny 모두).
- 여러 발췌 응답은 동점이 있던 entity 질의 11건뿐이다. 모두 발췌 2개다. `moreMatches`가 붙은 응답은 0건이다(동점 줄을 모두 담았다).
- 동점 11건 모두 첫 발췌는 수정 전 구간과 같다. 첫 발췌가 근거 줄을 놓쳤던 6건(001에서 놓친 held-out 4, calibration 1, 개발 1)은 두 번째 발췌가 근거 줄을 덮는다. 나머지 5건은 첫 발췌가 이미 근거 줄을 덮었다.
- 회귀: 동점이 없는 220개 질의는 발췌 구간이 수정 전과 행 단위로 같다.

## 3. 해석의 범위

- 이 벤치는 **고정 규칙 질의에서 근거 줄이 발췌에 들어오는가**만 본다. 모델이 두 구간 중 맞는 줄을 고르는지는 재지 않았다.
- held-out 결과(실험 3)는 사전 등록대로 바꾸지 않는다. 이 수치는 제품 개선의 확인이다. 논문에는 "발견된 한계와 후속 개선"으로만 쓴다(Task 38 범위). 개선 효과를 모델 정확도로 주장하려면 새 사전 등록이 필요하다.
- 원자료: `rows.jsonl`(질의별), `summary.json`, `table.md`, `before-summary.json`
