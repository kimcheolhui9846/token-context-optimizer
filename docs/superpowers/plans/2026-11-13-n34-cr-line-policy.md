# N-34 정책 줄 경계 lone CR 정합 — 계획 PR (구현 전)

- 작성: Claude Code(`claude-opus-5-5`), 2026-11-13. PM·최종 판정: Codex(Astra). 기준 origin/main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`.
- 성격: Tier D 계획 문서. 제품·테스트·설정·원자료를 바꾸지 않았고 새 측정을 하지 않았다. 아래 수치는 모두 기존 원자료에서 옮긴 것이다(출처는 각 절에 적었다).
- 흐름: 이 계획 PR → 사용자 결정(§5) → 새 독립 Task에서 구현 PR. 이 문서가 머지되어도 제품 동작은 바뀌지 않는다.
- 범위 밖: N-35(결합 문자 검색), N-36(contextLines 계약), 파이프 표·전역 `/m` 줄머리·U+2028/U+2029/NEL 정책.

## 1. 결함과 근거

| 위치(현재 main) | 줄 정의 |
|---|---|
| `src/core/policy.ts:710` `isPositiveSemanticText` | `.split(/\r?\n/u)` — lone CR을 줄로 보지 않음 |
| `src/core/policy.ts:777` `containsTechnicalTokenShape` | 같음 |
| `src/core/policy.ts:781` `containsShellCommand` | 같음 |
| `src/core/artifacts.ts` `scanLines`(sourceMap) | CRLF, lone CR, lone LF 모두 줄 경계(N-33) |

- `summarizeArtifact`는 `classifyContext(artifact.content)`가 semantic일 때만 요약한다. sourceMap은 CR로 이은 3줄을 3줄로 보는데 정책은 1줄로 본다.
- 재현(분석 `matrix.txt`, terraform-middle): `P1 \r T \r P3`
  - `P1` = `Please read this short note before the team meeting today.`
  - `T` = `terraform destroy the staging stack before lunch without asking anyone`
  - `P3` = `The rest of this note describes the weekly plan in plain words.`
  - 현행 CR: semantic, `fallbackReason: null`, 첫 줄 1줄 요약. LF·CRLF: exact[code_or_path], 요약 차단.
- 관찰 범위에서 확인한 현행 CR 우회 형태(분석 §2.3, `probe3-prefix-forms.json`·`probe4-argon-check.json`). 열거가 완전하다는 증명은 아니다.
  - (a) `COMMANDS`에만 있고 전역 줄머리 정규식(`policy.ts:619`)에는 없는 `systemctl`·`terraform` 줄머리
  - (b) 옵션 없는 `env` 접두(`env git`, `env terraform`, `sudo env terraform`), 그리고 옵션 없는 `doas`/`sudo` 뒤에 619 목록 밖 명령이 오는 경우(`doas terraform`, `sudo systemctl`). **`sudo git`처럼 619 목록 명령은 현행 CR에서도 exact다.** "옵션 없는 sudo/env 접두 전체가 우회된다"는 주장은 쓰지 않는다
  - (c) `VAR=` 접두에서 앞 줄이 `!`·`?` 등으로 끝나 CR을 넘는 우연 매치가 생기지 않는 경우
  - (d) 줄별 semantic 조건(줄마다 문장부호로 끝남, 5단어 이상)이 CR 연결 때문에 한 줄로 검사되는 경우

## 2. 제안 변경(C2) — 정확한 diff

`src/core/policy.ts`만 바꾼다. 원문 텍스트, 해시, sourceMap, `EXACT_PATTERNS`, `COMMANDS`, 다른 predicate는 바꾸지 않는다. 공개 API·스키마·오류 문구 변화 없음.

```diff
@@ COMMANDS의 `]);` 다음 빈 줄 뒤(= '  "terraform",\n]);\n\n' 뒤), `type PolicyPredicate` 앞
+// Same line terminators as scanLines in artifacts.ts: CRLF, lone CR, lone LF.
+const POLICY_LINE_BREAK = /\r\n|\r|\n/u;
+
@@ isPositiveSemanticText
-    .split(/\r?\n/u)
+    .split(POLICY_LINE_BREAK)
@@ containsTechnicalTokenShape
-  return content.split(/\r?\n/u).some((line) => hasTechnicalTokenShape(line));
+  return content.split(POLICY_LINE_BREAK).some((line) => hasTechnicalTokenShape(line));
@@ containsShellCommand
-  return content.split(/\r?\n/u).some((line) => isShellCommandLine(line));
+  return content.split(POLICY_LINE_BREAK).some((line) => isShellCommandLine(line));
```

- 출처: 분석 `results/candidate-c2.diff`. 현재 main에서 `split(/\r?\n/u)` 리터럴은 정확히 이 세 곳에만 있다(직접 grep, 2026-11-13).
- 상수는 export하지 않는다. 대안 C1(리터럴 세 곳 교체)은 동작이 같고(6,000건 차이 0) 줄 정의가 흩어져서 권하지 않는다.

## 3. 동작 변화 — 단순 엄격화가 아니다

양방향 변화가 있다. 아래는 분석 `matrix.txt`의 실제 행이다.

| 사례(CR로 연결) | 현행 CR | C2 CR | 같은 텍스트 LF 현행 | 방향 |
|---|---|---|---|---|
| `P1 \r T(terraform …) \r P3` | semantic, 1줄 요약 | exact[code_or_path], 차단 | exact | 엄격화(semantic→exact) |
| `P1 \r systemctl stop … \r P3` | semantic | exact | exact | 엄격화 |
| `P1 \r quick reminder \r P3` | semantic, 2줄 요약 | unknown, 차단 | unknown | 엄격화(semantic→unknown) |
| `P1 \r P3 \r T`(마지막 줄 명령) | unknown | exact | exact | 분류만 변화, 둘 다 차단 |
| `Please read this short note before the meeting today. \r --force is never used by our team in plain words. \r P3` | exact[code_or_path] | semantic, 1줄 요약 | semantic | **완화(exact→semantic)** |
| 순수 자연문 3줄 | semantic | semantic | semantic | 불변 |
| CR 파이프 표 | unknown | unknown | exact[numeric_or_table] | 불변(범위 밖, 둘 다 차단) |

- 완화 원인: `hasCommandArgumentShape`(`policy.ts:746-774`)의 run 문자 집합 `[a-z0-9._-]`에 `.`이 들어 있어 앞 줄 끝 `today.`가 하나의 run이 된다. 현행은 전체를 한 줄로 보므로 그 뒤 공백(`\r`)을 넘어 다음 줄 `--force`가 `COMMAND_ARGUMENT_SUFFIX`의 `--?[A-Za-z0-9]…`에 우연히 매치되어 exact가 된다. 줄을 나누면 이 우연 매치가 사라지고 LF 현행과 같은 semantic이 된다. LF 정책이 `--force`로 시작하는 문장 줄을 semantic으로 허용하는 것은 기존 정책이며 이번에 바꾸지 않는다.
- 생성 corpus 6,000건(시드 고정 LCG, `results/generated-differential.json` `stats`):

| 범주 | 건수 | 결과 |
|---|---|---|
| lone CR 없음 | 1,834 | 분류 변화 0 |
| lone CR 있음 | 4,166 | mode 변화 194 = semantic→비semantic(요약 허용 엄격화) 79 + 비semantic→semantic(요약 허용 완화) 12 + unknown↔exact 103(둘 다 차단, 분류만 변화). reasons만 변화 9 |
| 완화 12 | 12 | 12건 모두 lone CR→LF 치환본의 현행 결과와 같다(`probe2.json` `cat.relax.equalsBaseOfLF=12`) |
| C1 vs C2 | 6,000 | 차이 0 |

- 해석 한계: 완화 12건이 LF 현행과 같았다는 것은 **이 corpus에서의 관찰**이다. 모든 입력에서 "C2 CR 결과 = LF 현행 결과"를 보장하지 않는다. 특히 아래 §4 예외가 있다.

## 4. 바꾸지 않는 것과 CR≠LF로 남는 곳

- `hasMultilinePipeTable`(`policy.ts:551-598`)은 `\n`만 줄로 본다. C2 CR과 LF 치환본 현행의 전체 분류(mode/reasons) 불일치는 4,166건 중 247건이고 **전부 이 규칙**이다(reasons만 159, mode 88 = LF판 exact[numeric_or_table] vs CR판 unknown). 두 쪽 모두 요약 차단이다. 요약 허용 불일치는 0건이다. `tests/policy-redos-group3.test.ts:161`이 `"x\r|a|\r"` → false를 고정한다. 이번에 바꾸지 않는다.
- 전역 `/m` 줄머리 정규식(`policy.ts:619`, `:621`)은 JS 규칙상 `\r`, `\n`, U+2028, U+2029 뒤를 줄 시작으로 본다. 바꾸지 않는다.
- U+2028/U+2029/NEL: sourceMap이 줄로 보지 않으므로(`line-terminators.json`, `a?b?c` → 1줄) `POLICY_LINE_BREAK`에 넣지 않는다. 넣으면 sourceMap 계약과 어긋난다.
- `renderSummaryText`는 요약 줄을 `\n`으로 잇는다(기존 동작, 무관).

## 5. 사용자 결정표

| ID | 결정 사항 | 권장안 | 다른 대안과 그 결과 |
|---|---|---|---|
| **D1** | C2 채택(§2 diff 그대로) | **채택.** 세 줄 단위 predicate의 줄 경계가 sourceMap과 같아진다 | **현상유지:** §1 재현과 (a)–(d) 우회가 남는다. CR로 이은 명령 줄이 semantic으로 요약될 수 있고, sourceMap 줄 수와 정책 줄 판정이 계속 어긋난다 |
| **D1-a** | 엄격화 수용 범위 | lone CR 입력에서 semantic→exact/unknown(관찰 79/4,166). 예: §3 terraform·systemctl·quick reminder 행 | (현상유지와 같음) |
| **D1-b** | 완화 수용 범위 | lone CR 입력에서 exact/unknown→semantic(관찰 12/4,166)은 **같은 줄 구성의 LF 현행 결과와 같은 경우에만** 수용. 예: `… today.\r--force is never used …` | 완화를 거부하면 C2를 채택할 수 없다(C2 하나로 엄격화와 완화가 함께 생긴다). 구현 PR의 R5·수용기준 3이 "LF판과 다른 완화"를 실패로 잡는다 |
| **D2** | 범위 고정 | 파이프 표 LF 전용, 전역 `/m`, U+2028/U+2029/NEL 현행 유지. 테스트로 현행 동작을 고정 | 넓히면 sourceMap 계약·기존 group3 고정 테스트가 바뀌므로 별도 finding·계획이 필요하다 |
| **D3** | 자원 사전 gate(§8) 채택 | §8 임계값·절차 그대로 사전등록 | §8 각 항목에 대안 근거를 적었다. 구현 PR에서 수치를 본 뒤 바꾸지 않는다 |
| **D4** | `docs/design.md` Safety Invariants에 한 문장 추가 | 추가: "줄 단위 정책 판정은 sourceMap과 같은 CRLF·lone CR·lone LF를 줄 경계로 쓴다. U+2028/U+2029/NEL은 줄로 보지 않는다" | 생략 가능(동작 무관) |

- 분석 보고 §3의 다른 후보는 결정 선택지로 올리지 않는다. C1은 C2와 동작이 같은 표기 차이이고, C3(artifacts.ts 공통 모듈)·C4(lone CR 전면 unknown)·C5(이중 판정)는 범위 확장·기능 후퇴·CR≠LF 고착으로 분석에서 비권장이었다.
- 결정 요청 형태: "PR #<이 PR>의 D1(C2, 엄격화 D1-a·완화 D1-b 포함), D2, D3, D4를 권장안대로 승인" 또는 항목별 거부. 포괄 승인 문구가 아니라 위 사례와 §8 수치에 대한 승인이다.

## 6. N-32 동결 oracle 보존 — 승인된 정확한 delta만 허용

- 바꾸지 않는 파일: `tests/helpers/policy-baseline-n32.ts`(sha256 고정값 `308043af…7174e` 유지), `tests/helpers/policy-baseline*.ts` 전부, `tests/fixtures/policy/characterization.json`. 새 정책으로 다시 만들어 덮어쓰지 않는다.
- 바꾸는 곳: `tests/policy-n32.test.ts:243-248`의 소스 전문 비교 한 군데. 현재 `expect(product).toBe(frozen.replaceAll(oldSuffix, newSuffix))`를 다음으로 바꾼다.
  1. `n32 = frozen.replaceAll(oldSuffix, newSuffix)`(기존 그대로, 기존 `toHaveLength(5)` 검사 유지)
  2. `n34Delta(text)`: (i) `'  "terraform",\n]);\n\n'`가 정확히 1회 있는지 확인하고 그 뒤에 §2의 주석 1줄·상수 1줄·빈 줄을 삽입, (ii) 리터럴 `.split(/\r?\n/u)`가 정확히 3회 있는지 확인하고 모두 `.split(POLICY_LINE_BREAK)`로 교체
  3. `expect(product).toBe(n34Delta(n32))`, 그리고 product에 `split(/\r?\n/u)` 0회, `POLICY_LINE_BREAK` 정확히 4회(선언 1 + 사용 3)
- 테스트 이름의 "exact four-suffix-only change"는 "exact N-32 suffix + approved N-34 line-break delta"로 바꾼다. 그 밖의 소스 변경은 계속 실패한다. 검사 삭제·느슨한 포함 비교는 하지 않는다.
- delta 문자열(`\r`·`\n` 백슬래시 포함)은 Write 도구 + `String.raw`로 쓰고 저장 뒤 제어 문자 0을 확인한다.

## 7. 수용 테스트(구현 PR, 새 파일 `tests/policy-n34-line-terminators.test.ts`)

핵심은 공개 `classifyContext`·`indexArtifact`+`summarizeArtifact`·sourceMap 동작이다. `loadPolicyInternals(…, ["POLICY_LINE_BREAK"])`는 보조 검사로만 쓴다. 각 행은 variant별로 RED와 control을 나눈다. **lone CR variant만 현행에서 실패(RED)하고 LF/CRLF variant는 현행에서도 통과하는 control이다.**

| ID | 입력(줄 구성은 §1 P1/T/P3 등 분석 `probe.cjs` 원자) | 기대 | RED |
|---|---|---|---|
| R1 | 재현 3줄, 구분자 LF/CRLF/CR | 모두 exact+`code_or_path`. `summarizeArtifact(maxTokens 20)`: `fallbackReason: "exact_content_requires_source"`, `summary: ""`, `sourceMap: null`, warnings에 `lossy_summary_blocked` | CR만 |
| R2 | 우회 형태: `systemctl`, `sudo systemctl`, `doas terraform`, `env git`, `env terraform`, `sudo env terraform`, `foo=bar …`(앞 줄 `!`로 끝남), `quick reminder`, 문장부호 없는 5단어 줄, 마지막 줄 명령 | 각 CR판의 공개 분류·요약 결과 = 같은 줄 구성의 LF판 | 현행 CR이 LF판과 다른 것만. `sudo git`·`sudo -u root …`·`env -i …`는 현행 CR도 exact인 control |
| R3 | 연속 CR(`P1\r\rT\r\rP3`), 혼합(`P1\r\nT\rP3\n`), 역순 `\n\r`, `\r\r\n` | R1과 같은 결과 | 연속 CR만. 혼합·역순은 현행도 exact인 control |
| R4 | 경계 일치: CR/LF/CRLF/혼합/끝 구분자 하나/앞 구분자/빈 줄 | `indexArtifact` sourceMap 줄 수·텍스트와 공개 분류가 같은 줄 구성 LF 입력과 같다. 요약이 허용되는 행은 `sourceMap.endLine`이 같은 줄을 가리킨다 | CR 입력 중 현행 분류가 다른 것 |
| R5 | 완화(D1-b 승인 시에만): `Please read this short note before the meeting today.\r--force is never used by our team in plain words.\rP3` | semantic, LF판과 같은 분류·요약 줄 범위 | CR만(현행 exact). LF판 semantic은 control |
| M1 | MCP: `tests/helpers/crop-mcp-client.ts`의 `CropMcpClient`로 `classify_context {text}`(재현 CR), 임시 루트 파일의 `index_artifact`→`summarize_artifact` | exact, 요약 차단 | CR만. 재빌드한 `bin/` 기준 |

현행에서도 통과해야 하는 control(구현 전후 모두 통과):

- G1: LF/CRLF만 있는 시드 고정 생성 corpus(1,000건 이상): 현재 분류 = F-21 동결 oracle(`tests/helpers/policy-baseline-f21.ts`)
- G3: U+2028/U+2029/NEL로 이은 재현은 현행 결과(semantic, sourceMap 1줄)로 고정(D2)
- G4: 파이프 표 CR = unknown(차단), LF = exact[numeric_or_table](D2). 기존 group3 `:161` 테스트도 그대로 통과
- G5: 순수 자연문 CR 3줄은 semantic이고 요약된다(기능 후퇴 방지)
- G6: 끝 CR·앞 CR 입력(분석 `probe.cjs`의 trailing CR·leading CR 행을 그대로 옮김)은 현행과 같은 semantic이고 요약 줄 수도 같다(matrix: 현행·C2 모두 L2 sel=1, L3 sel=2)

수용 기준:

1. R1–R5·M1의 CR RED는 구현 전 실패, 구현 후 통과. LF/CRLF control과 G1·G3–G6은 전후 모두 통과
2. 생성 corpus(시드 고정): lone CR 없는 입력은 현행과 분류 차이 0
3. lone CR 입력: C2(CR) vs 현행(CR→LF 치환본)의 요약 허용(semantic 여부) 불일치 0. 분류(mode/reasons) 불일치는 파이프 표 규칙으로 설명되는 것만 허용하고 건수를 보고한다. 그 밖의 불일치는 실패
4. §6 delta 검사 통과, 동결본·oracle 무변경(git diff로 확인)
5. 표준 7단계(`npm ci --ignore-scripts` → build → test → typecheck → smoke:mcp → validate:plugin → benchmark) 통과, `bin/` 재생성
6. §8 필수 gate PASS

## 8. 자원 사전 gate 제안(D3, 구현 PR에서 측정 전 사전등록)

이 Task에서는 실행하지 않는다. 임계값과 절차는 기존 승인 근거에서 가져왔고 새 실행 결과에 맞춰 정하지 않았다.

### 8.1 왜 필요한가

- C2 뒤 CR-dense 입력은 split마다 줄 수만큼의 배열을 만든다. 1 MiB `\r` 반복: 현행 1원소 → C2 1,048,577원소(`probe2.json` `splitCount`). split은 `containsShellCommand`·`containsTechnicalTokenShape`에서 항상 2회, `isPositiveSemanticText`에서 조건부 1회다.
- 기존 정책 대형 테스트(`policy-large-input`, group1–4 perf child)는 줄이 촘촘한 10 MiB 입력으로 `classifyContext`를 재지 않는다.
- 참고(정보용, gate 아님): N-33 run5 진단에서 10 MiB `\n` 반복 `indexArtifact`는 기본 heap으로 완료, 후보 retained 765,504,984 B·maxRSS 866,099,200 B(`research/results/6-4b-6-source-map-impl/perf-run5-diagnostic.json`). index→summary 경로는 이 sourceMap 위에 classify split이 더해진다.
- 분석 scratch 1 MiB 시간(5회 단일 프로세스)은 근거로 쓰지 않는다.

### 8.2 고정 입력(모두 정확히 10,485,760 B, child 안에서 생성)

| ID | 정의 | 종류 |
|---|---|---|
| F1 | `\r` × 10,485,760 | CR-dense |
| F2 | `x\r` × 5,242,880 | CR-dense |
| F3 | `\r\n` × 5,242,880 | CRLF 회귀 |
| F4 | `\n` × 10,485,760 | LF 회귀(F1의 LF 치환본) |
| F5 | `x\n` × 5,242,880 | LF 회귀(F2의 LF 치환본) |
| F6 | `x\r\nx\rx\n`(7 B) × 1,497,965 + `x`×5 | 혼합 |
| F6L | F6의 lone CR만 LF로 치환(`x\r\nx\nx\n` × 1,497,965 + `x`×5) | F6 기준선 |
| F7 | (`P1`+`\r`+`P2`+`\r`+`P3`+`\r`)(184 B) × 56,987 + 공백 152 B. `P2` = `Everyone should bring their notes and arrive a little early.` | 일반 prose CR |
| F7L | F7의 `\r`을 `\n`으로 | prose LF(F7 기준선, LF 회귀) |

### 8.3 연산과 arm

- O1 = 공개 `classifyContext(content)`(메모리 내 문자열). O2 = 임시 파일에 쓴 뒤 fresh `MemoryArtifactStore`로 `indexArtifact` → `summarizeArtifact({maxTokens: 400})` 왕복. O1과 O2는 따로 판정한다.
- arm: BASE = 구현 브랜치의 base main 커밋, CAND = 측정 head. 각각 `git archive` → 임시 폴더 → `npm ci --ignore-scripts` → `tsc -p tsconfig.json`. 두 arm의 `dist/src/core/*.js`는 `policy.js`만 달라야 하고 lockfile 해시가 같아야 한다(N-33 사전등록 §1과 같음).
- 비교 두 종류(혼동 금지):
  - **G-R 같은 입력 회귀:** F3·F4·F5·F6L·F7L에서 CAND(X) vs BASE(X). lone CR이 없으므로 split 결과가 같아야 한다.
  - **G-C 새 CR 작업:** F1·F2·F6·F7에서 CAND(X) vs BASE(LF치환(X)), 즉 F1↔F4, F2↔F5, F6↔F6L, F7↔F7L. 현행 CR은 줄을 나누지 않아 작업량이 다르므로 **CAND(X) vs BASE(X)를 gate로 쓰지 않는다.** 그 비율은 정보용으로만 기록한다.

### 8.4 시간 gate(필수) — N-33 run5 R2 절차를 그대로 쓴다

- 근거: `docs/agent/handoffs/6-4b-6-source-map-impl-prereg.md` §3·§9·§10(2026-11-11 사용자 승인 D1·R2·P1), `research/plans/2026-11-02-perf-gate-noise.md`.
- (입력, 연산, 시도)마다 fresh hidden child 1개. 사본 B1·B2(BASE)·C1·C2(CAND), A/A 사본은 같은 `dist`의 바이트 복사. G-C에서는 B1·B2가 LF 치환 입력, C1·C2가 CR 입력을 쓴다.
- 스케줄: 고정 12-순환 `A B C D B D C A D A C B`(A=B1, B=B2, D=C1, C=C2), warmup 2순환(24표본) → 측정 10순환(120표본, 사본당 30).
- 표본 = K호출 묶음 시간. K 보정: K=1부터 2배씩, B1 5묶음·C1 5묶음 최솟값이 모두 ≥ 50 ms인 최소 K(maxK 1024). 보정 표본은 판정에 쓰지 않는다.
- 시간 밖 correctness: 네 사본의 공개 출력 digest. G-R은 BASE와 CAND 출력이 같아야 한다. G-C는 CAND(X)와 BASE(LF(X)) 출력이 같아야 한다(F1–F7에는 파이프가 없다). O2 비교 필드는 classification·`summary`·`sourceMap.startLine/endLine`·`fallbackReason`·`warnings`이고 artifact id·sha256·path는 뺀다. 불일치 = `failed_correctness`.
- 통계: nearest-rank, median = `sorted[14]`, p95 = `sorted[28]`(n=30). n≠30 또는 비유한 값 = INVALID.
- A/A 유효(B1/B2, C1/C2 각각): 중앙값 비 ∈ [0.95, 1.05] 또는 |Δmedian| ≤ 0.1 ms, 그리고 |Δp95| ≤ max(0.2 ms, 참조 p95 × 0.20). 무효면 30 s 뒤 새 child로 시도 전체 재실행, 최대 3시도. **세 번째 무효 = 필수 INVALID, 측정 중단(PASS 아님).**
- 판정(G-R·G-C 공통, N-33 D1 임계): CAND median ≤ max(REF median × 1.10, REF median + 0.5 ms), CAND p95 ≤ max(REF p95 × 1.20, REF p95 + 1 ms). REF = 해당 비교의 BASE 사본 B1. 유효 FAIL은 재시도·완화·진단 강등 없이 중단한다.
- 시간 블록의 timeout·spawn 실패·JSON 1줄 아님·비정상 종료·OOM·표본 누락은 N-33 §3처럼 INVALID로 중단한다(빈 집계·exit 0은 PASS가 아님).
- child timeout 1,800 s(10 MiB × 144표본 + 보정을 위해 N-33의 1 MiB용 600 s에서 늘림. 결과를 보기 전 고정). 순서: O1(F3, F4, F5, F6L, F7L, F1, F2, F6, F7) → O2(같은 순서).

### 8.5 메모리·자원 gate(필수, 시간 gate 뒤 독립 블록)

- N-33 D2 절차: 비교마다 arm × 3회, 반복마다 fresh hidden child, `--expose-gc`만(heap 플래그 없음 = 기본 heap), 한 번에 한 child, 짝수 반복 BASE→CAND·홀수 CAND→BASE. timeout 600 s(N-33 D2는 1 MiB 입력에 300 s. 10 MiB·O2 파일 쓰기 때문에 결과를 보기 전 600 s로 고정).
- child: 모듈 import → 입력 문자열 생성(O2는 파일 쓰기까지) → GC 3회 → before = `heapUsed + external` → 연산 1회 → 결과(O2는 record·store)를 전역에 살려 둔 채 GC 3회 → after. **R(retained) = after − before. P(peak 대용) = `process.resourceUsage().maxRSS` × 1024**(프로세스 high-water, split 순간의 정확한 heap peak가 아님). 출력 digest 기록.
- 3회 nearest-rank median. 판정(N-33 D2 임계): R_CAND ≤ R_REF + max(1 MiB, R_REF × 0.02), **그리고** P_CAND ≤ P_REF × 1.10 + 32 MiB. P가 0·비유한이면 `unmeasurable`(PASS 아님).
- N-33과 다른 점(의도적): N-33 §3은 OOM·timeout을 모두 INVALID로 보았다. 시간 블록은 네 사본이 한 child에 있어 원인을 arm에 귀속할 수 없으므로 그대로 INVALID로 둔다. 메모리 블록은 arm마다 child가 따로라서 CR-dense 할당 위험을 직접 판정하도록 아래처럼 FAIL로 분류한다.
- 자원 실패 정의(메모리 블록): REF가 완료한 입력에서 CAND child가 OOM(비정상 종료, `FATAL ERROR … heap` stderr)·timeout·`RangeError`를 내면 **`failed_gate`(자원 FAIL)**, 재시도하지 않는다. REF가 실패하면 `ref_failed`로 기록하고 그 비교는 판정 불가 → 필수 gate는 PASS가 아니며 새 사용자 결정이 필요하다. spawn 실패·JSON 1줄 아님·표본 누락 = INVALID.
- 종료 사유 우선순위: failed_correctness > failed_gate > invalid. **최종 승인 = 시간 gate PASS 그리고 메모리 gate PASS일 때만.**

### 8.6 보존·금지·재현

- 출력: `research/results/n34-cr-policy/perf-<run>-{timing,memory}.json` 새 파일만(있으면 거부). 원시 표본(순서·사본·arm·입력 ID·ms), K, child 종료 코드·signal·stderr 끝, 환경(Node `v24.18.0`, V8, OS, CPU, 메모리, 전원 계획), 소스 해시(blob 기준/작업 사본 기준 구분), 사전등록 커밋, 측정 head, 상태·사유.
- 실행 전후 추적 파일 해시 동일, 임시 폴더 삭제 확인. dirty 작업 트리면 실행 거부.
- 금지: 유효 FAIL 뒤 임계 완화·필수에서 정보용으로 강등, `--max-old-space-size` 등 heap 증액, 유효 FAIL 재시도, 결과 보고 뒤 입력·순서 변경, 이전 결과 삭제·덮어쓰기. 제품을 다시 고치면 새 사전등록 커밋·새 결과 파일.
- 재현 명령(예정): `node research/src/n34-cr-policy-perf.mjs --prereg=<커밋> --block=timing|memory --output=research/results/n34-cr-policy/perf-run1-<block>.json`, 검사만 `--check-only`.

## 9. 구현 Task(결정 뒤 새 독립 Task)

- 새 Orca worktree `--no-parent`, base = 그 시점 origin/main, 브랜치 `claude/n34-cr-line-policy`. Tier E(연구 스크립트·측정 포함). stacked·rebase·force push 금지.
- 순서: RED 테스트 커밋(§7) → Draft PR → C2 구현·§6 delta·D4 문장 → targeted(`npx vitest run tests/policy-n34-line-terminators.test.ts tests/policy-n32.test.ts tests/policy-redos-group3.test.ts tests/source-map.test.ts`) → 표준 7단계 → 사전등록 커밋(`docs/agent/handoffs/n34-cr-line-policy-prereg.md` + runner·worker) → 시간 블록 → 메모리 블록 → Argon → Astra 판정.
- 예상 변경 파일: `src/core/policy.ts`, `tests/policy-n34-line-terminators.test.ts`(신규), `tests/policy-n32.test.ts`(§6 한 곳), `bin/token-context-optimizer.mjs`(재생성), `docs/design.md`(D4), `research/src/n34-cr-policy-perf{,-worker,-mem-worker}.mjs`, `research/results/n34-cr-policy/*`, `docs/agent/handoffs/n34-cr-line-policy*.md`.
- 바꾸지 않는 파일: `src/core/artifacts.ts`, `tests/helpers/policy-baseline*.ts`, `tests/fixtures/policy/characterization.json`, `package*.json`.
- 통합: S-10·N-38 등 다른 PR과 `bin/`이 겹친다. main 통합은 사용자 merge 승인 뒤 순차로 하고, 뒤 PR은 최신 main을 merge 커밋으로 받아 `npm run build`로 `bin/`을 다시 만든 뒤 7단계를 다시 통과한다.

## 10. 한계

- §3·§4 수치는 분석 corpus(6,000건, 시드 고정)와 행렬의 관찰이다. 모든 입력의 보장이 아니다.
- 분석 하네스의 "신규 실패 1건(`policy-n32.test.ts:248`)"은 실제 vitest 결과가 아니다. 구현 PR에서 실제 vitest로 확인한다.
- §8 임계값은 N-33(1 MiB indexArtifact)에서 승인된 값을 10 MiB classify·index→summary에 옮긴 것이다. 이 연산에 맞는지는 D3 결정 사항이다. 측정 시간은 예측하지 않는다.
