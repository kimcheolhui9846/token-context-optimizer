# N-17 한국어 자격증명 라벨 구현

- Tier E: 제품·테스트·성능 증거. 기준 `46939f3913e2c16bbe9bbc402974208e86eb99d6`, 브랜치 `codex/n17-korean-credential-impl`.
- 사용자 승인: 계획 권장안, `/model` Astra 사용자 확인, 2026-11-05 `codex_paste_2026-11-05_n17-perf-rework.md`의 가′ 재작업 및 후속 `시작`.
- [승인 계획](n17-korean-credential-plan.md), [프로젝트 핸드오프](../HANDOFF.md), [attempt-1 원본 결과](../../research/evidence/n17/result.md).
- 범위: tuple #0 한국어/API 술어, 미분·회귀 테스트, 측정기/분석기/증거, bundle. research/, 의존성, 기존 영어/F-21/tuple/flags/fallback/기능 기대값, Ready·merge 제외.

## 확정 계약과 구현

- T1+T2 17라벨; 내부 `[ \t]?`, 뒤 `\s*[:=：]`, `i`, api 앞 `(?<![A-Za-z0-9])`. 서술형·전각 등호·강조·새 하이픈/밑줄 문법 제외. T2 접미부·별도 숫자 보호 유지.
- 최초 RED `7620e3d`: 294 실패/33 대조군 통과; GREEN `3a614ed`: 정책 회귀 416 통과. 기준 helper는 실제 병합 정책 소스와 일치한다.
- attempt-1: tooling `26cde59`, 사전등록 `0dce98f`, 결과 `48cbaf1`. 4 PASS/4 유효 FAIL/4 INVALID, 재시도 불가로 중단했다. space/tab/NBSP/mixed의 점추정 1.031–1.055.
- 승인된 재작업: 한국어 16라벨과 api 라벨을 별도 모듈 상수로 분리해 OR한다. 다른 정책 동작은 보존한다.
- 고정된 원래 단일 정규식과 새 상수 OR 및 실제 tuple0를 비교한다. 양성/음성/합성어/api case·앞 문맥·구분자/서술형·공백류·NFC/NFD·반복 호출을 포함한다.
- 대표 입력 5개를 새 ID의 정확히 10 MiB 합성 한국어/영어 산문·코드·Markdown·한국어 자격증명 문장 반복으로 교체한다. 완전한 UTF-8 unit 반복 후 ASCII 공백 padding. 양성 문장은 ASCII 공백으로 구분한다.
- 기존 literal A 중앙값 11,150–42,550 ns와 A′/A 무효 4건이 설계 수리의 근거다. 타이머 해상도가 원인이라고 입증한 것은 아니다. 분리·상수 hoisting·대표 입력 변경이 함께 있어 대표 결과를 분리만의 효과로 단정하지 않는다.

## 측정 계약과 중단 조건

- 최악 입력 7개 bytes/hash, 3% 한계, A′/A `[0.97,1.03]`, warmup12/2블록, 측정36/6블록 유지. A는 `46939f3`; `48cbaf1`은 기존 증거 출처이며 기준 구현을 대체하지 않는다.
- 각 블록 6순열 shuffle, 입력별 PRNG 초기화. seed `0x4e173001`; bootstrap seed `0x4e173002`, 10,000회 6개 블록 복원추출 후 36비율 중앙값, type-7 2.5/97.5% CI.
- 점추정=round별 `B/mean(A,A′)` 중앙값; A′/A 중앙값 밴드 밖 INVALID. 점추정>1.03 FAIL; 그 이하 CI상한>1.03 BORDERLINE; 나머지 PASS.
- 집계 INVALID>FAIL>BORDERLINE>PASS 유지. 전역/다른 입력 INVALID와 함께 있어도 개별 유효 FAIL은 중단하며 재시도하지 않는다.
- 새 `manifest-attempt-2.json`은 attempts 2–3용 campaign manifest. 코드·manifest를 먼저 커밋하고 attempt-2를 실행한다. FAIL 없는 INVALID만 같은 manifest로 attempt-3 한 번 허용; 재무효/FAIL이면 push 없이 중단.
- 모든 attempt 증거를 즉시 커밋하고 삭제·덮어쓰지 않는다. 기존 manifest.json/measurement-attempt-1.json/result.md는 byte-for-byte 보존한다. 새 결과는 result-attempt-2.md(필요하면 3.md)에 둔다.
- full classifier 1회/cell, 강제 GC 없음. 입력/해시/직렬화는 timer 밖. drift 6/6 및 18/18은 진단용. CI는 기술 통계이며 오류확률 보장이 아니다.
- prepare는 실제 A/A′/B 출력·parent 원본/해시·최악 입력/프로토콜을 쓰기 전에 검증한다. load/종료 시 소스·빌드·bundle·도구·입력·출력·환경 해시 재검증; attempt-3은 커밋된 이전 증거와 재계산 analysis를 요구한다.

## 검증과 검토

- 제품 targeted: primary 428/428 통과 후 실제 tuple0·flags·추가 공백 보완 split 13/13 통과. 기존 policy-n17 327개 기대값 변경 없음.
- 증거 테스트: 첫 에이전트의 RED 실행은 sandbox 수집 단계에서 막혔으며 성공으로 세지 않는다. Primary가 null campaign 재시도 버그를 1 실패/48 통과로 재현하고 보완 후 최종 54/54 통과했다. 모든 추가 테스트의 RED를 관찰했다고 주장하지 않는다.
- 전체 최종 gate: typecheck/test/build/smoke:mcp/validate:plugin PASS; 44파일 1761 통과, 기존 Windows symlink EPERM 5 skip. git diff --check 통과. 생성 bundle은 정책 분리만 반영한다.
- 타이밍 없는 12입력×A/B preflight 통과; 7개 최악 입력 해시가 원본과 동일. prepare에서 A′까지 다시 확인한다. 기존 raw analysis canonical 재계산 일치 테스트 통과.
- Claude `claude-opus-5-5`, rework initial: CHANGES REQUIRED (0 blocker/4 major/4 minor/2 note); provenance/명세 보완 채택, boolean 전용 술어의 match span 요구는 코드 근거로 기각.
- Claude `claude-opus-5-5`, milestone: CHANGES REQUIRED (0 blocker/3 major/5 minor/2 note); prepare oracle·campaign/legacy 테스트·실제 tuple0 미분 검사 보완.
- Claude `claude-opus-5-5`, scoped recheck: APPROVED (0 blocker/0 major/3 minor/4 note), M1/M2/M3 해결. 모두 제공된 코드의 정적 검토이며 CLI가 테스트를 실행한 것으로 기록하지 않는다.
- 잔여 minor: 일부 fail-closed provenance 음성 테스트 부족; 두 재시도 음성 assertion은 다른 거부 조건과 중첩; prepare의 전체 JSON roundtrip guard 없음(현재 cpu와 기존 CI는 정의됨). 독립 검토 완료, 성능 판정은 아직 미실행.
- 원본의 raw-byte 비교는 줄바꿈이 바뀌면 fail-closed한다. 현재 원본 3파일 SHA-256을 확인했다. 정책 기능/범위/회귀는 확인했지만 측정 전 성능 PASS를 주장하지 않는다.

## 현재 상태와 남은 작업

- [x] 승인된 분리 구현·미분 검사·측정기 보완·독립 재검토·전체 gate.
- [ ] 재작업 코드 커밋 → 새 manifest 사전 커밋 → --check → attempt-2 단독 측정.
- [ ] 원자료·레시피별 점추정/CI/A′/A/상태 기록, primary Astra 최종 판정.
- [ ] PASS/BORDERLINE일 때만 push·Draft PR·최종 local gate. 유효 FAIL/재무효면 push하지 않고 보고한다.
- 다음 Task·Ready·merge는 별도 사용자 승인 대상이다.
