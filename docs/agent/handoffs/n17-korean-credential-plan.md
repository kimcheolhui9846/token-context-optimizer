# N-17 한국어 자격증명 라벨 — 구현 전 계획

- Tier E: 영향 조사 수치를 포함한 계획 PR. 기준 `f78737ea66fc91cb59bf1069a8c598a46c7032e1`, 브랜치 `codex/n17-korean-credential-plan`.
- 범위: 이 문서, `research/src/n17-korean-credential-impact.mjs`, `research/results/n17/2026-11-03-impact.json`. 제품·테스트·기존 증거는 변경하지 않는다. [사전 설계](../../../research/plans/2026-11-02-n17-korean-credential-predesign.md)와 [G-1–G-6](../../../research/plans/2026-11-02-perf-gate-noise.md)를 잇는다.
- 목적: 문장 안 `비밀번호: hunter2` 같은 문자 자격증명이 semantic으로 분류되어 손실 압축 가능한 문제를 보호한다. 단독 줄은 이미 unknown이므로 두 배치를 구분한다. 정책 근거: `src/core/policy.ts:211` F-21 정규식, `:600` tuple #0, `:632` reasons 집합, `:678` 자원 한계 fallback, `:714` 산문 판정.

## 결정표 — 전부 사용자 결정 필요, 아래는 권장안

| ID | 선택지 | 권장안과 근거 |
|---|---|---|
| K-1 | T1만 / T1+T2 | T1+T2. 영어 token 보호 및 F-21 E-2의 과보호 수용과 일관된다. 암호·토큰 실제 노출을 막지만 용어 설명과 입력토큰도 과보호한다. |
| K-2 | ASCII `:`·`=` / 한국어만 `：` 추가 / 영어에도 추가 | 한국어만 추가. 영어 전각 콜론은 N-27 결정으로 분리한다. 전각 등호 `＝`는 모두 제외한다. |
| K-3 | 서술형 포함 / 제외 | 제외. `비밀번호는 8자 이상` 같은 안내문까지 확대하지 않는다. 영어 서술형과 같은 한계를 문서화한다. |
| K-4 | 새 tuple / #0 OR | #0 OR. 기존 `/iu` 영어 및 F-21 `/i` 술어를 그대로 보존하고 새 술어만 OR한다. tuple 번호와 reason 순서를 유지한다. |
| K-5 | `i` / `iu` | `i`. 한글 대소문자 영향은 없으며 F-21의 ASCII 의도를 유지한다. 기존 정규식 flags는 바꾸지 않는다. |
| K-6 | `[ \t]*` / `\s*` | `\s*`. 구분자 직전 NBSP·전각 공백·줄바꿈을 영어처럼 허용한다. 라벨 내부 공백과 구분한다. |
| K-7 | 강조 제외 / 한국어 라벨에 짝이 맞는 `*`·`**`·`_`·`__` 허용 | 이번 구현에서는 제외 권장. 강조 문장 노출은 남지만 영어 강조와 함께 별도 설계한다. 포함 선택 시 혼합·중첩·짝 없는 강조 제외와 추가 영향 조사를 먼저 확정한다. |
| K-8 | 기존 T2 접미부만 / 지정 라벨 내부에 하이픈·밑줄 한 칸도 허용 | 기존 접미부만 권장. `개인_키:` 등의 노출은 남기되 사전 설계 문법을 유지한다. 포함 선택은 아래 `·`를 `[ \t_-]?`로 확대하고 추가 영향 조사를 요구한다. |
| api 앞 경계 | `(?<![A-Za-z0-9])` / 영어와 같은 ASCII `\b`(`/i`) | 전자 권장. 둘 다 v2api는 제외, 카카오api는 허용하지만 my_api는 전자만 허용한다. 한국어 합성 입력과 접두어를 유지한다. |
| N-27 | 영어 전각 콜론도 같은 구현 PR / 별도 후속 | 별도 후속 권장. `password：hunter2` 문장 노출은 남는다. 영어 #0/E-3 변화까지 섞지 않고 별도 영향·영어 oracle 승인을 받는다. |

T1 14라벨은 `비밀·번호, 비번, 패스·워드, 인증·키, 개인·키, 비밀·키, 시크릿·키, 액세스·키, api·키, 복구·코드, 백업·코드, 인증·토큰, 접근·토큰, 액세스·토큰`, T2 3라벨은 `암호, 토큰, 보안·코드`다. `·` 위치만 `[ \t]?`(공백/탭 0–1개)이며 실제 글자가 아니다. 한글 라벨 왼쪽 경계는 없고 api만 위 경계를 쓴다. 라벨 뒤 K-6 공백과 `[:=：]`까지만 검사하여 값이 없어도 보호한다. NFD 자모, 라벨 내부 NBSP/줄바꿈은 제외한다. K-1=T1이면 합성 토큰의 접미부 보호가 사라지고, K-6=JS 공백이면 긴 NBSP/줄바꿈 성능 검증이 필수다.

## 영향 조사와 재현

재현: 저장소 루트에서, JSON에 기록된 동일 Node v24.18.0·TypeScript 버전과 lockfile을 사용한다. 위 기준 checkout에서 `npm.cmd ci`, `npm.cmd run build` 후 `node research/src/n17-korean-credential-impact.mjs --out research/results/n17/2026-11-03-impact.json`. 재실행은 다른 `--out` 경로를 사용해 두 파일 바이트를 비교한다. 입력은 고정 base의 Git blob, 분류기는 그 base로 빌드한 self-contained dist만 읽는다. source/blob/LF SHA·dist SHA·스크립트 SHA·Node/TS 버전을 JSON에 남기며 다른 dist는 거부한다. 후보는 #0 OR를 모의 적용(비exact 이유 교체, 기존 exact의 secret 중복 없이 선두 추가, 자원 한계 fallback 보존)하며 제품 구현 증거로 주장하지 않는다.
정의된 기존 입력 193,669행, 전역 정확한 문자열 중복 제거 후 187,492개(중복 출현 6,177): characterization120·policyCorpus120·F21 overlay4·core static/resolved/each78·F21 static41·실제 소형 생성기5개의 출력177,208·benchmark10·한글 포함 Markdown119파일의 줄12,748/문단3,340. 줄·문단은 출처별 원행을 유지하고 전역 집계에서 같은 문자열만 합친다. 전체 저장소 통합 실행 추적은 아니며 동적 flatMap/template, 대형 스트레스, 기타 통합 파일·원시 실험 데이터는 제외한다. unresolved 호출9곳과 출처별 원행/고유 결과를 JSON에 명시했다.

| 후보 | 고유 입력 | unknown→exact | semantic→exact | 모드 유지·reasons 변경 | 전체 결과 변경 |
|---|---:|---:|---:|---:|---:|
| T1-H | 187,492 | 1 | 0 | 5 | 6 |
| T1-J | 187,492 | 1 | 0 | 5 | 6 |
| T12-H | 187,492 | 4 | 0 | 19 | 23 |
| T12-J | 187,492 | 4 | 0 | 19 | 23 |

변경은 전부 Markdown: 줄 모드 전환 T1=1/T12=4, 줄 reasons만5/13, 문단 모드0·reasons만0/6. 다른 입력 집합은 변화0이다. N17 사전 설계 문서만 출처인91개를 제외하면187,401개이며 T1 변화0, T12 unknown→exact2/reasons만7이다. 남는 모드 변화는 `research/plans/2026-10-21-ieie-captions.md:66`의 공급자 청구 토큰 정의와 `research/results/rq1-sweep-001/README.md:16`의 이미지 토큰 정의다. corpus의 줄간 후보 일치는0이며 JS 공백 효과는 독립 oracle로 검증한다. 기존 문서의 자기참조가 섞였고 실제 대화 분포가 아니므로 semantic 전환0은 과보호 없음의 증거가 아니다. K7/K8 포함·api 변경·N27 포함 선택 시 이 네 후보 밖의 조사를 추가하고 구현 전에 다시 승인받는다.

추가 누락 점검: base 추적992파일 중 Markdown204개는 위 집계로 다루고, 나머지 UTF-8 텍스트709개를 T12-J로 직접 검색했다. 바이너리/비UTF8 79개는 사유별 제외 목록을 남겼다. 비Markdown 매칭은 기존 N17 probe 소스와 결과 JSON 두 개뿐이다. 이는 원문 문자열 검색이며 escape로 구성된 동적 입력의 완전 탐색을 뜻하지 않는다.

## 독립 oracle — 원자료 boundaries 13건

K-7/K-8 포함 열은 수작업 설계 기대값이며 선택 시 추가 조사로 확인한다. 아래는 고정 문장 `회의실 {라벨} hunter2 이니까 접속할 때 참고해 주세요.`의 최종 결과다. E=exact/reasons `["secret"]`, S=기존 semantic, U=기존 unknown. H=`[ \t]*`, J=`\s*`. 단독 `{라벨} hunter2`는 미매칭 시 모두 U(영어 행만 기존 E), 매칭 시 E다. 기대값은 후보 정규식에서 계산하지 않고 literal 표로 작성하여 두 배치를 각각 단언한다. 영어 행은 한국어 술어 불일치지만 기존 영어 규칙이 E를 보장한다.

| ID·라벨 | T1-H | T1-J | T12-H | T12-J | K-7/K-8 포함 시 변화 |
|---|---|---|---|---|---|
| B01 인증_토큰: | S | S | E | E | K8: T1도 E |
| B02 인증-토큰: | S | S | E | E | K8: T1도 E |
| B03 API-키: | U | U | U | U | K8: 네 변형 E |
| B04 개인_키: | S | S | S | S | K8: 네 변형 E |
| B05 비밀_번호: | S | S | S | S | K8: 네 변형 E |
| B06 보안_코드: | S | S | S | S | K8: T12만 E |
| B07 입력토큰: | S | S | E | E | 변화 없음, 과보호 예 |
| B08 비밀번호+NBSP+: | S | E | S | E | 변화 없음 |
| B09 비밀번호+U+3000+: | S | E | S | E | 변화 없음 |
| B10 **비밀번호**: | S | S | S | S | K7: 네 변형 E |
| B11 비밀번호+공백2개+: | E | E | E | E | 변화 없음 |
| B12 비밀+공백2개+번호: | S | S | S | S | 변화 없음 |
| B13 password+NBSP+: | E | E | E | E | 기존 영어 보호 유지 |

## 구현 시 테스트·문서 계약

사용자 결정 뒤 별도 Task에서 `tests/policy-n17.test.ts`의 수작업 기대값부터 추가하여 현재 미보호 실패(RED)를 확인하고, `src/core/policy.ts` #0 OR만 수정해 GREEN으로 만든다. `tests/helpers/policy-baseline-n17.ts`는 기준 정책을 고정하되 새 라벨 기대값을 제품 정규식에서 가져오지 않는다. frozen120/F-21 oracle·기존 영어 기대값은 수정하지 않는다. tuple 수·인덱스와 reasons 중복 제거·순서도 확인하고 국소 정리 후 재검증한다.
행렬은 17라벨×3구분자×단독/문장, 각 `·`의 무공백/공백/탭, 구분자 앞 NBSP/U+3000/LF/CRLF/U+2028/U+2029/FEFF 및 U+200B 음성이다. `암호화:`·`토큰화:`·`비밀번호 변경:`·서술형 음성, 코드 span(기존 unknown), 합성어 과보호, api 앞 영숫자/한글/밑줄도 별도 literal로 검증한다. 한국어 라벨과 숫자 규칙이 함께 맞으면 `["secret","numeric_or_table"]`; 라벨 불일치 숫자 예제는 기존 numeric_or_table을 유지한다. 혼합 code/secret도 기존 순서에 새 secret만 첫 위치에 들어오는지 단언한다.
`docs/design.md` 분류 절에 한국어 라벨 전체와 서술형 미보호, 숫자 보호, K-7/K-8 제외 표기, N-27 잔존을 적는다. 보호되지 않는 표기는 압축 허용을 보장하지 않으며 다른 규칙으로 exact/unknown일 수 있음을 설명한다.

## G-1–G-6 성능 게이트 설계 — 이번 PR에서는 미측정

G1: A/A′는 구현 직전 승인된 기준 commit의 동일 빌드 독립 사본, B는 구현 head다. 소스·빌드·Node·OS·CPU·입력 hash를 고정한다. 같은 프로세스에서 `[A,A′,B]`, `[A,B,A′]`, `[A′,A,B]`, `[A′,B,A]`, `[B,A,A′]`, `[B,A′,A]`를 1블록으로 매번 shuffle한다. mulberry32/Fisher–Yates seed `0x4e173001`; warmup 12라운드(2블록·36호출), 측정 18라운드(3블록·54호출), 각 입력별 동일 프로토콜이다.
G2: round로 짝지은 `B_i/mean(A_i,A′_i)`의 중앙값을 판정한다. 짝수 표본은 중앙 두 값의 평균이다. G3: 짝지은 `A′_i/A_i` 중앙값이 `[0.97,1.03]` 밖, 표본 결손/중복, 비양수·비유한 시간, schema/hash/기대 출력 불일치이면 INVALID다.
G4: drift는 진단용이며 PASS/FAIL/INVALID 판정을 바꾸지 않는다. warmup을 12라운드로 늘리되 안정성을 가정하지 않는다. 각 변형별 warmup 뒤6/앞6, 측정 뒤9/앞9의 평균 비율을 drift로 저장한다. G5: 3개 순열 블록을 통째로 복원추출(매회3블록)하여 10,000회 점추정 재계산, mulberry32 seed `0x4e173002`, type-7 2.5/97.5 percentile CI를 기록한다. 점추정>1.03은 FAIL, 그 이하면서 CI상한>1.03이면 경계 통과, 나머지 PASS. 우선순위 INVALID>FAIL>경계 통과>PASS. 블록3개 CI는 잡음의 기술적 요약이며 오판정 확률이 아니다.
G6: `scripts/measure-n17-policy.mjs`, `scripts/analyze-n17-policy.mjs`, `tests/n17-policy-evidence.test.ts`, `docs/research/evidence/n17/{manifest,measurement}.json`에 schema/version·source/build hash·seed·입력·round/block·variant·실제 position·warmup 여부·시간·전체 출력 hash·판정 사유를 함께 설계/검증한다. variant와 position을 구분하고 analyzer는 결손·중복·순열 불균형·manifest 불일치를 거부한다.
최악 입력은 10 MiB=10,485,760 UTF-8 bytes 이하로 완전한 반복 단위를 채우고 남은 바이트는 ASCII 공백으로 맞춘다. `비밀 번호 ` 반복과 완성 라벨 `비밀번호` 뒤 긴 공백(space/tab/NBSP/U+3000/LF 및 혼합) 뒤 구분자 없는 입력을 각각 둔다. 기존 영어·자연어·numeric/code 대표 입력도 포함한다. 모든 레시피에 full classifyContext 3% 게이트를 적용하며 regex 단독값으로 대체하지 않는다. 최악 입력은 A/A′/B 출력 동등성, 의도된 한국어 변화는 승인 literal oracle로 확인한다. INVALID는 전체 증거를 보존하고 1회만 전체 재측정하며 재무효·FAIL은 중단한다. 순서 균형이 사본/라운드 간 이월 효과를 제거했다고 주장하지 않는다.

## 검증·리뷰·종료

- Claude `claude-opus-5-5`: initial 검토 후 문법/재현/결정 상태 보완; milestone CHANGES REQUIRED(0/1/3/4), scoped RESOLVED(0blocker/0major/0minor/2note). 존재하지 않는 테스트를 근거로 한 major는 Git 증거로 철회, minor3건 반영. 전체 트리 점검 설명 note는 반영했고 assertion 메시지 보강은 선택적 후속이다.
- 검증: 조사 재실행 byte 일치(SHA256 `ff13bd27b0e685aa18b51e453fe3f67f023f804ec597a0b0d15766d735a71919`), 경계13×2배치·행렬102·control30의632 case/variant 검사 통과. typecheck/build/smoke:mcp/validate:plugin 및 전체1367 pass/5skip, diff-check 통과. RED는 제품 변경 없는 계획이므로 해당 없음. Draft PR #92 생성 후 d50a88f에서 최종 5개 npm 게이트도 모두 통과했다(1367 pass/5 EPERM skip).
- 종료 조건: 허용한 3파일만 커밋(`Agent: codex`)·push·Draft PR, 최종 로컬 게이트와 primary 검토. Ready/merge/제품 구현은 하지 않는다. K-1–K-8·api 경계·N-27의 사용자 결정 뒤 별도 구현 Task를 승인받는다.

- Primary 최종 검토: PASS WITH NOTES. 요구사항·3파일 범위·재현 JSON·독립 oracle·검토 해결·push/Draft 상태를 직접 확인했다. 실제 대화 분포/동적 입력과 구현 성능은 미검증이며 사용자 결정 후 후속 Task다. [기존 프로젝트 핸드오프](../HANDOFF.md)는 보존한다.
