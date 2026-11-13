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

## 진행 상태

- [x] 구현 전 요청서 검토·계획 Argon(APPROVE, Minor1/Nit1)
- [x] BASE RED/control, 구현, targeted GREEN
- [ ] 전체 gate, 기본 예산 eviction0 임시 계측, benchmark 비시간 값 대조
- [ ] 메모리 진단 D1/D2, 문서(README/design/SKILL), Argon milestone, PR head 최종 gate
