# N-34 CR 정책 계획 PR — 현재 상태

- 작업자: Claude Code(`claude-opus-5-5`), Orca worker task_3b03e3def304 / dispatch ctx_88570881719a. PM·최종 판정: Codex(Astra).
- 브랜치 `claude/n34-cr-policy-plan`, base origin/main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`.
- Tier D: Markdown 계획과 이 기록만 추가했다. 제품·테스트·설정·package·원자료·기존 숫자 무변경. 새 측정·custom verify 없음.
- 승인 범위: 커밋 → push → Draft PR. Ready·merge·제품 구현은 승인 범위 밖이다.

## 산출물

- 계획: `docs/superpowers/plans/2026-11-13-n34-cr-line-policy.md`
  - §2 C2 정확한 diff(`POLICY_LINE_BREAK = /\r\n|\r|\n/u`, 세 split만)
  - §3 양방향 동작 변화 사례와 corpus 수치
  - §4 바꾸지 않는 규칙(파이프 표, 전역 `/m`, U+2028/U+2029/NEL)
  - §5 사용자 결정표 D1(-a/-b)–D4
  - §6 N-32 oracle 보존 delta 검사
  - §7 R1–R5·M1·controls와 수용 기준
  - §8 자원 사전 gate, §9 구현 Task

## 결정 대기(사용자)

| ID | 권장 | 핵심 |
|---|---|---|
| D1 | C2 채택 | 대안은 현상유지뿐. 현상유지면 CR 연결 명령 줄 요약(재현)이 남는다 |
| D1-a | 엄격화 수용 | lone CR 입력 semantic→exact/unknown, 관찰 79/4,166 |
| D1-b | 완화 수용(LF 현행과 같을 때만) | `… today.\r--force is never used …` exact→semantic, 관찰 12/4,166 모두 LF 치환본 현행과 같음 |
| D2 | 범위 고정 | 파이프 표 LF 전용(CR=LF 분류 불일치 247, 모두 차단), `/m`, U+2028/U+2029/NEL 유지 |
| D3 | 자원 gate 채택 | 10 MiB F1–F7, O1 classify·O2 index→summary, G-R/G-C 분리, N-33 D1/D2/R2 임계·절차 |
| D4 | design.md 한 문장 | 줄 정의 명시(동작 무관) |

## 근거로 쓴 기존 자료(새 실행 없음)

- 분석 보고: 메인 `codex_review/codex_paste_2026-11-12_n34-analysis.md`, primary 검토 `review_2026-11-12_remediation-analysis-final.md`
- raw: `codex_review/remediation-analysis-2026-11-12/n34/results/`
  - `generated-differential.json` `stats`: 1,834 변화 0, 4,166 중 mode 194(79/12/103)·reasons 9, CR=LF 불일치 247
  - `probe2.json`: 완화 12 = LF 결과 12, 불일치 247 = 파이프 표 159 + mode 88, splitCount 1 → 1,048,577
  - `probe4-argon-check.json`: `sudo git` CR 현행 exact, `doas terraform`·`env git`·`env terraform`·`sudo env terraform` CR 현행 semantic
  - `matrix.txt`, `candidate-c2.diff`
- 현재 소스 직접 확인: `split(/\r?\n/u)` 리터럴이 `policy.ts:710/777/781` 세 곳에만 있다. `tests/policy-n32.test.ts:243-248` 전문 비교와 group3 `:161` 파이프 표 고정
- gate 근거: `docs/agent/handoffs/6-4b-6-source-map-impl-prereg.md` §3·§4·§9·§10, `research/plans/2026-11-02-perf-gate-noise.md`, N-33 run5 진단 10 MiB `\n` index(정보용)

## 하지 않은 것

- 제품 구현, 테스트 작성, npm gate, 성능·메모리 측정, 새 corpus 실행
- WBS 저장(공통 single writer). 변경안은 완료 보고에만 적는다
- N-35/N-36, 파이프 표·Unicode 줄 구분자 정책

## 검증(Tier D)

- 계획 수치와 경로를 위 raw·현재 소스로 직접 대조했다
- `git diff --check` 통과(커밋 전)
- Argon(gemini-4-argon) 1회 성공: APPROVE, Nit 2건 직접 확인 후 채택
  - §8.5 메모리 timeout이 N-33 D2(300 s)와 다른데 설명이 없었다 → 600 s 고정 사유와 module import 순서를 적었다
  - §2 diff 삽입 위치 표기가 §6과 달랐다 → `]);` 다음 빈 줄 뒤로 통일했다(분석 `candidate-c2.diff`와 같음)
  - 추가로 OOM 분류가 N-33과 다른 점(메모리 블록 CAND 단독 OOM = FAIL, 시간 블록은 INVALID)을 명시했다
- Argon이 발췌 밖이라 "확인 불가"로 남긴 항목(`"terraform",` 앵커 1회, split 리터럴 3회, N-33 R2 12-순환·≥50 ms, D2 임계, run5 진단 수치)은 원문에서 직접 확인했다
- 완료 보고: `codex_review/codex_paste_2026-11-13_n34-plan.md`

## 다음

1. Astra 최종 판정
2. 사용자 D1–D4 결정
3. 결정 뒤 새 독립 Task `claude/n34-cr-line-policy`에서 RED → Draft PR → C2 → 7단계 → 사전등록 → gate
4. `bin/` 통합은 다른 PR과 사용자 merge 승인 뒤 순차(merge 커밋 + 재빌드, rebase·force 금지)
