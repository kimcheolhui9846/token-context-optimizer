# S-10 (WBS 6.4b-5) — 텍스트 artifact 저장소 추정 바이트 상한: 구현

Tier E. 기준 origin/main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`, 브랜치 `claude/s10-store-bound-impl`. 작업자 Claude Code(claude-opus-5-5), PM·최종 판정 Codex(Astra). 승인: 2026-11-10 사용자 "권장대로 승인"(E1–E8, K160, F32768), 2026-11-13 전체 지적 수정 승인. 계획·근거: [6-4b-5-store-bound-plan.md](6-4b-5-store-bound-plan.md)(그 문서의 K128·승인 대기 문구는 당시 상태).

## 계약 (구현됨)

- `MemoryArtifactStore`: weight = 2·byteLength + 160·lineCount + 32768 B를 put 때 계산해 보존. 기본 256 MiB soft bound.
- LRU: get hit·같은 ID put이 최신으로 승격, get miss는 순서 불변. 초과 시 가장 오래된 것부터 제거, 방금 넣은 기록은 제거하지 않음(상한보다 크면 singleton, 다음 put에서 정상 회수).
- 생성자 `{ maxEstimatedBytes?: number }`만. 0인자·`undefined`·`{}`·`{maxEstimatedBytes: undefined}`는 기본값.
- 오류(새 공개 문구)
  - 인자 null/비객체/배열: `MemoryArtifactStore options must be an object`
  - 한도가 양의 safe integer가 아님(null, 0, 음수, 소수, NaN, ±Infinity, 2^53, 문자열): `maxEstimatedBytes must be a positive safe integer`
  - put의 byteLength·lineCount가 0 이상 safe integer가 아님: `Artifact record byteLength and lineCount must be non-negative safe integers`
  - 계산 weight가 safe integer가 아님: `Artifact record estimated weight must be a safe integer`
  - 검사는 상태를 바꾸기 전에 끝난다(거부된 put은 기록·순서·합계 불변). 메모리 할당 실패 같은 런타임 예외까지 원자적이라고 주장하지 않는다.
- 제거된 ID는 기존 그대로 `Artifact not indexed: <id>`, 재색인으로 복구. get 반환 객체 동일성 유지, freeze/clone/공개 stats/env 없음. 내부에서 `this.get`/`this.put`을 다시 부르지 않아 subclass 호출 수가 그대로다.
- 미사용 private `trimToTokenBudget` 삭제(E8). 이미지 store는 변경 없음(E7, 상한 없는 metadata 누적은 문서화).
- 256 MiB는 저장된 추정치 합의 상한이다. 실제 heap/RSS 상한이 아니다: 색인 순간 transient, 동시 색인, store 밖 참조, put 뒤 record 변형, singleton(추정 합 ≤ max(예산, singleton weight))은 범위 밖이다.

## 테스트

- `tests/artifact-store-bound.test.ts`(custom·기본 예산 store), `tests/artifact-store-default-bound.test.ts`(`defaultArtifactStore`, 파일 격리). 공개 get/put과 indexArtifact/query/summary만 관찰한다.
- BASE(5d668f9) 실행: control 8 PASS(C1–C3, R6, R8, R11, R18 수락, R20a), 정책 RED 17 FAIL(R1–R5, R7, R9, R10, R12–R17, R18 거부, R19, R19b, R20b). 구현 뒤 25/25 PASS.

## 검증 결과

- 전체 gate(8b7c49a): npm ci/build/test/typecheck/smoke:mcp/validate:plugin/benchmark 모두 exit 0, 테스트 4379 PASS / 5 SKIP.
- 기본 예산 eviction0(임시 계측 사본, 새 S-10 테스트 제외): 기존 테스트 4354 PASS / 5 SKIP, 제거 0건. 기본 예산 store 최대 추정 합 52,232,766 B(테스트) / 873,370 B(benchmark). benchmark 비시간 값은 BASE·clean HEAD·계측본이 모두 같다. 근거 `research/results/s10-store-bound-impl/eviction0-benchmark.json`, 패치 `instrumented-patch.diff`(제품에 넣지 않음).
- 메모리 진단 `research/src/s10-store-bound-diagnostic.mjs`(child 3회, default heap 4,496,293,888 B, hidden, GC3회)
  - run1: D1·D2 판정 PASS. 그러나 사전에 정한 하네스 자기 점검(flush 뒤 잔존 ≤ 32 MiB)이 D1에서 실패했다(잔존 729.4 MiB). 원인은 top-level await가 마지막 resolve 값(직전 기록)을 다음 macrotask까지 붙잡는 것이었다. probe 결과 flush 직후 730.0 MiB, 한 tick 뒤 0.0 MiB였다(`harness-probe-run1.txt`). 제품 누수가 아니다. run1은 그대로 보존한다.
  - run2: 측정 전 macrotask를 한 번 기다리도록 고쳤고 기준은 바꾸지 않았다. 결과 PASS, 하네스 유효.
    - D1(weight 1,698,725,888): 매 단계 기록 1개, 합계는 singleton weight와 같음. retained 764.8–765.7 MB(약 730 MiB), 한도 약 876 MiB(M 기반). flush 잔존 −0.5 MiB.
    - D2(1 MiB CRLF, weight 9,424,480): 기록 수 최대 28(= floor(256 MiB / weight)), 합계 최대 263,885,440 ≤ 256 MiB, LRU 순서 일치. retained 최대 154.4 MiB, 한도 329.0 MiB.
    - maxRSS(정보용, retained와 다름): D1 약 2,437 MiB, D2 약 361 MiB.
- fix(review) 2026-11-13: 진단 parent가 결과와 무관하게 exit 0이던 것을 고쳤다(pass·harnessValid가 모두 true일 때만 0). 합성 stub으로 pass 0 / invalid·fail·crash 1을 확인했다(`exit-code-check/`). run1·run2는 이전 parent의 raw이고 다시 실행하지 않았다(`script-provenance.md`). README·design의 재색인 문장에 같은 ID가 돌아오는 조건(경로·바이트 불변, 바뀌면 새 ID와 hash 비교)을 적었다.
- 하지 않은 것: D0 재보정(K160 corpus 재측정). 정보용이며 이번 범위 밖이다.

## 진행 상태

- [x] 요청서 검토, 계획 Argon(APPROVE, Minor1/Nit1 채택)
- [x] BASE RED/control, 구현, targeted, 전체 gate, eviction0 계측, D1/D2, 문서
- [x] milestone Argon(APPROVE, 지적 0)
- [ ] PR head 최종 전체 gate, Codex 최종 판정, 사용자 merge 승인
