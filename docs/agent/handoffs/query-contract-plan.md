# Handoff — query-contract-plan (N-35/N-36 계획)

- 날짜: 2026-11-13
- 작업자: Claude Code (claude-opus-5-5), Orca task_1d0f708e7d1e
- PM·최종 판정: Codex (Astra)
- 브랜치: `claude/query-contract-plan`, base origin/main `5d668f9`
- Tier: D(계획 문서). 제품 코드·테스트·의존성·실험 데이터·수치 변경 없음

## 산출물

- 계획: `docs/superpowers/plans/2026-11-13-query-contract-n35-n36.md`
- 이 핸드오프

## 요약

- N-35: 질의 토큰화가 결합 문자(`\p{M}`)를 버려 हिन्दी가 `ह`,`न`,`द`로 쪼개진다. 현행 소스에서 `contextLines: 0` 또는 띄운 배치의 기본 옵션으로 목표 줄이 `moreMatches`로 밀림을 재확인했다
  - 권장 B: `[\p{L}\p{N}_./:-][\p{L}\p{M}\p{N}_./:-]*`. term은 결합 문자로 시작하지 않는다
  - 단순 M 추가(A)는 U+FE0F(이모지 표시 선택자)와 단독 결합 문자를 term으로 만들어 무관한 줄에 점수를 준다
- N-36: 직접 `queryArtifact`의 `contextLines`가 검증되지 않는다. 1.5/0.5는 TypeError, -1/NaN/-Infinity는 사실과 다른 `source_span_exceeds_budget`, `"1"`은 문자열 연결로 비대칭 span, `null`은 기본값, 11 이상·Infinity는 전체 파일을 낸다
  - 권장 C2: 음이 아닌 safe integer만 허용, 상한 없음. `maxExcerpts` 검증 바로 뒤, store 접근 전에 던진다
  - 문구: `"contextLines must be a non-negative safe integer"`. MCP 스키마(0–10)는 바꾸지 않는다
- S-10(#113)과 src hunk는 겹치지 않는다. S-10의 LRU `get` 때문에 검증을 store 전에 두는 것이 필요하다. 통합은 merge commit + 재build

## 검증

- 직접 읽기: 계획 문서, 근거 행 번호, 호출자 표
- `git diff --check`
- scratch 재현(추적 파일 변경 없음): 현행 `artifacts.ts` 번들 + 공개 `queryArtifact`, 토큰화 대안 비교. 새 측정 아님

## 남은 결정

계획 §6 D1–D6(사용자). 권장: D1 C2, D2 B, D3 null 거부, D4 Infinity 거부, D5 README 2문장 추가, D6 재현율 감소 수용.

## 다음

Astra 판정 → 사용자 결정 → 구현 Task `claude/query-contract-impl`(계획 §4–§5).
