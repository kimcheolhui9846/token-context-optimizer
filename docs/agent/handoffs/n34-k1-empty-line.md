# N-34 K1: 빈 줄 빠른 반환 (Task handoff)

- 요청서: `codex_review/review_2026-11-15_n34-k1-implementation-request.md` (Codex PM, 추적 안 됨)
- 범위: N-34 F1 정보용 위험에 대한 보완. 같은 branch `claude/n34-cr-line-policy`, 같은 Draft PR #119
- 구현: Claude Code (`claude-opus-5-5`). 계획·최종 판정: Codex PM
- 시작 HEAD `7e732e0`(pre-K1), PR base `main` `5d668f9`

## 상태
- [x] 1단계 시작: worktree clean, HEAD = origin = PR head `7e732e0`, Draft OPEN
- [x] baseline targeted (pre-K1 `7e732e0`): policy 9개 파일, 1,872 통과
- [x] 초기 계획 교차 확인(아래): blocker/major 없음
- [x] 테스트 먼저 `ad1d3e6`: 예상된 scope guard RED 3개, 기능 control 전부 통과(기능 RED 없음)
  - n32 exact source에 K1 delta, guard 2개, 비공개 `lastIndex` 차이
- [x] 구현 `b4f60ed`: src +2줄(두 guard), bin은 build 결과(+2줄)
  - targeted 10파일 1,884 통과(baseline 1,872 + 신규 12)
- [x] 전체 npm 7단계 @`b4f60ed`: 모두 exit 0, test 52파일 4,455 통과·5 skip
- [x] 2단계 prereg·하네스 `85e8200`: `n34-k1-prereg.md`, `research/src/n34-k1-perf*.mjs`
  - check-only PASS: 18행, 음성 대조, 원자료 완결성, run3 사본 가드
- [x] synthetic self-check `4af1abf`(64 KiB, gate 아님)
  - 결함 분류 9/9, timing 5행·memory 30 child 완료, raw 누락 0, 추적 파일 무변경
- [x] milestone Argon 1회: APPROVE, Minor 1·Nit 1(`codex_review/argon/2026-11-15_n34-k1-prep-{bundle,argon}.md`)
  - Minor(현재 소스를 기존 loader extraExports로 로드) 반영 `02fd545`. Nit은 묶음 요약 표기 문제로 보고서에 밝힌다
- [x] 전체 npm 7단계 재실행 @`02fd545`: 모두 exit 0, 4,455 통과·5 skip, build 결과 변경 0
- [ ] PM 1단계 preflight → 2단계 실측. 10 MiB 성능 측정·profiling은 아직 하지 않았다

## 제품 변경 (정확히 두 곳)
- `src/core/policy.ts`의 `hasTechnicalTokenShape(line)`, `isShellCommandLine(line)` 맨 앞에
  `if (line.length === 0) return false;`
- 그 밖의 소스(`somePolicyLine`, 줄 경계, `isPositiveSemanticText`, EXACT_PATTERNS, 공개 API)는 그대로다
- 공백만 있는 비어 있지 않은 줄은 대상이 아니다. K2(배열 상수화)와 classify 우회는 하지 않는다

## 초기 계획 교차 확인 (소스 `7e732e0` 대조)
- 호출처
  - `hasTechnicalTokenShape`: 735행(`isPositiveSemanticLine`)과 793행(`containsTechnicalTokenShape`)
    - 735행 경로의 줄은 `trim` 후 `filter(Boolean)`을 거친다. 빈 줄이 오지 않아 guard에 닿지 않는다
  - `isShellCommandLine`: 797행(`containsShellCommand`)만
- 빈 문자열의 기존 반환값은 둘 다 false다
  - shell: `"".trim().split(/\s+/u)` → `[""]` → filter → `[]` → false
  - technical의 하위 predicate 5개
    - `hasDottedTokenShape("")`, `hasTraceLikeValue("")`: false
    - regex 2개: `""`에 일치하지 않는다
    - `hasCommandArgumentShape("")`: index 0에서 char가 undefined라 false. 이때 `COMMAND_ARGUMENT_SUFFIX`는 쓰지 않는다
  - 빈 문자열 경로에는 throw 지점이 없다
- 상태 차이
  - `TRACE_PREFIX_SCAN`을 참조하는 곳은 68행(선언), 499행(0 대입), 500행(exec 루프) 세 줄뿐이다
  - `hasTraceLikeValue`를 부르는 곳은 633행(EXACT_PATTERNS)과 744행이다. 매 진입마다 499행에서 0으로 초기화한다
  - K1 뒤에는 빈 줄에서 `hasTraceLikeValue`를 부르지 않는다
    - 그래서 직전 양성 호출이 남긴 0이 아닌 `lastIndex`가 다음 진입까지 남을 수 있다(pre-K1은 빈 줄 호출 뒤 0)
    - 이 차이는 비공개 내부 상태다. 공개 출력과 호출 순서가 같다는 것은 반복 시퀀스 테스트로 확인한다
  - 그 밖의 regex는 non-global이거나 사용 직전에 `lastIndex`를 대입한다
- 판정: blocker/major 없음
- 세부 보완: pre-K1 oracle의 출처
  - 현재 소스에서 두 guard를 정확히 제거해 만든다
  - 그 결과가 `7e732e0` blob(LF)의 sha256 `a44c77d7…`과 같은지 테스트에서 고정한다
  - helper·baseline 파일은 바꾸지 않는다

## 테스트 계획
- 기능 RED: 해당 없음. 두 함수는 빈 줄에서 이미 false를 반환하므로, 동치 테스트는 수정 전에도 통과한다(baseline → GREEN)
- scope guard RED
  - `tests/policy-n32.test.ts` exact full-source 불변식에 K1 delta(두 anchor, 각 1회)를 더한다
  - 구현 전에는 이 테스트가 실패하는 것이 예상 동작이다. 성능 실패가 아니다
- 새 `tests/policy-n34-k1.test.ts`
  - pre-K1 대 K1 비교: 빈 문자열, CR·LF·CRLF 경계, 공백·Unicode 공백, 산문, 명령·식별자·trace 양성/음성
  - 반복 시퀀스: trace 양성 → 빈 줄 → 음성 → 양성
  - 시드 corpus: 공개 mode/reasons/warnings와 요약 허용
- 기존 9,841·200,000 콜백 동치 테스트, F-21·N-32 oracle, baseline helper는 바꾸지 않는다

## 이후
- 진행과 결과는 이 파일에 갱신한다. N-34 handoff에는 링크만 남긴다
- run3 PASS를 K1 HEAD의 PASS로 쓰지 않는다. F1 위험은 해소로 표시하지 않는다
