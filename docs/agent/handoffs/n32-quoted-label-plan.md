# N-32 따옴표·괄호 자격증명 라벨 구현 계획

- Tier E — 계획·영향 조사만 수행한다. 기준은 `f612f081985f43fe37af4bb1f1e1e73bc003e290`; 제품 변경·성능 시간 측정·Ready·merge는 이번 범위 밖이다.
- 이번 산출물은 이 문서, `research/src/n32-quoted-label-impact.mjs`, `research/results/n32/2026-11-07-plan-impact.json` 세 파일이다. 구현은 계획 PR 검토와 사용자 승인 뒤 별도 Task로 한다.
- Q-1~Q-6 모두 사용자 확정: U3 닫는 문자 8개 `"`, `'`, `)`, `”`, `’`, `）`, `」`, `』`; 여는 짝 검사 없음; 기존 4개 정규식 제자리 수정; JSON 설명 과보호 수용; 기대값 79건만 이관; 강조+따옴표 겹침·대괄호·코드 span·밑줄/취소선·전각 등호 `＝`·복수형은 확장하지 않는다.
- tuple #0 위치, flags `iu/i/i/i`, 왼쪽 경계, 다른 tuple, fallback, reasons 순서는 보존한다. 기존 양성을 잃지 않는다.

## 바꾸기 전과 후 원문

각 블록은 `src/core/policy.ts` 기준 행과 old/new 순서다. 라벨 뒤 `\*{0,3}`만 `(?:\*{1,3}|["')”’）」』])?`로 바꾼다. Unicode 문자는 아래 literal 그대로 고정한다.

### src/core/policy.ts:606 (iu)

```regex
/\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\*{0,3}\s*[:=：]/iu
/\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b(?:\*{1,3}|["')”’）」』])?\s*[:=：]/iu
```

### src/core/policy.ts:211 (i)

```regex
/\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\*{0,3}\s*[:=：]/i
/\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b(?:\*{1,3}|["')”’）」』])?\s*[:=：]/i
```

### src/core/policy.ts:218 (i)

```regex
/(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\*{0,3}\s*[:=：]/i
/(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)(?:\*{1,3}|["')”’）」』])?\s*[:=：]/i
```

### src/core/policy.ts:219 (i)

```regex
/(?<![A-Za-z0-9])api[ \t]?키\*{0,3}\s*[:=：]/i
/(?<![A-Za-z0-9])api[ \t]?키(?:\*{1,3}|["')”’）」』])?\s*[:=：]/i
```

## 영향 조사와 79건 이관

[전체 결과 JSON](../../../research/results/n32/2026-11-07-plan-impact.json)의 `markdown`, `staticStrings`, `migrations`가 출처·변경값의 명세다. 모든 changed 단위에 전체 출처 파일/행 또는 JSON pointer, 입력 SHA-256, mode/reasons/warnings 전후를 보존한다. 임의 말뭉치 원문은 기록하지 않고 승인된 합성 테스트 입력만 기록한다.
- Markdown 213개, 고유 줄+문단 24260개: 새 #0 양성 35, mode 변화 10, reasons 변화 35. 계획·핸드오프 출처 제외 시 mode 0, reasons 2; 혼합 출처 0.
- 사전 설계 기준 `3e4c972` 재확인: 새 양성 8, mode 1, 계획 출처 제외 mode 0 / reasons 2. f612의 새 양성 증가 27개는 추가된 N-32 사전 설계 문서에서만 나온다. 정책 소스는 두 기준에서 같다.
- 정적 조사: TS/JS/MJS/CJS 164파일, JSON 532파일. 일반 문자열 새 양성/mode/reasons 0/0/0, 과거 research 결과 295/267/295, research 코드 17/15/17. 과거 결과·도구는 보존한다.
- 정적 literal·JSON 문자열 값만의 조사다. JSON key/전체 원문, template expression·JSON.stringify 등 임의 동적 입력은 포함하지 않는다. N-27 생성 행렬 468 placement는 별도 전수 확인했다. 추가 이관 미발견은 조사한 literal 값에 한정하며 전체 실행 경로의 증명이 아니다. inventory는 파싱 파일 수, 각 그룹 files는 비어 있지 않은 문자열을 제공한 파일 수다. 다른 확장자는 inventory.otherTrackedFiles에 명시한다. 추가 이관 발견 시 승인 대상이다.
- `structuralAudit`는 네 원문·공통 suffix의 코드 참조 위치, 원문을 그대로 #0에 넘기는 정책 호출 경로, N-27 미분 검사 원문 및 boundary literal의 무변경 검증을 담는다. N-27 approvedRegexes는 과거 양성 보존 검사이므로 새 표기 배제 assertion이 아니다. 원문 동등성 갱신은 E-3 1건이다.
- 별도 raw 코드 줄 조사: 고유 21343줄, 새 #0 양성 15, mode 9, reasons 13. 이는 코드 자체를 입력한다고 가정한 표면 조사이며 실제 테스트 입력 집계에 합산하지 않는다. codeSyntaxExamples의 Python/JS 합성 5개는 새 #0 양성이고 mode 5개가 exact로 바뀐다.
- 추가 한계: `def login(password):`, `def verify(token):`, `(token) => token`, `.map((pass) => pass)`, `(secret)===x`도 여는 짝을 검사하지 않는 Q-2와 닫는 괄호 뒤 등호/콜론 허용의 결과다. 정규식을 바꾸지 않고 후속 설계 문서·literal 테스트에 명시하며, 계획 PR 사용자 검토에서 이 과보호 영향도 확인한다. 이스케이프된 JSON 따옴표도 별도 지원하지 않는다.
- `migrations.rows` 78행은 각 `file:line`, `assertionLine`, label/form/placement, 합성 input, 전체 before/after 값을 담는다. `tests/policy-n27.test.ts`의 dquote/squote/paren × 13라벨 × 2배치: mode 변경 72; `API_KEY` 6건은 exact 유지, reasons 맨 앞에 secret 추가; warnings 변경 33건은 []→[lossy_compression_not_allowed]다. `migrations.structural[0]`은 F-21 E-3 원문 상수(8행)와 assertion(34행), 전후 `.source`, 유지할 flag i를 담는다. 합계 79건이다.
- 기존 N-27 행렬의 과거 before 값과 `tests/helpers/policy-baseline-n27.ts`는 보존한다. 구현 시 f612 정책 전체를 새 `policy-baseline-n32.ts`에 동결하고 N-27 행렬의 승인된 after 78건만 갱신한다. E-3 원문 1건은 별도 갱신한다. JSON after는 영향 조사 관측값이므로 테스트로 그대로 복사하지 않고 독립 806 literal 행렬과 교차 확인한다.
- 이관 편집 단위: 69~81행의 라벨별 newCodes에서 dquote/squote/paren 세 토큰의 두 배치 값만 갱신한다(13×3×2). oldCodes와 다른 표기 열은 유지하고 필요한 출력 literal은 독립 oracle에서 추가한다. TS/JS 반환형 `verify(token): Promise<boolean>` 같은 같은 계열의 과보호도 후속 literal 테스트·문서에 포함한다.

## 독립 기대값과 구현 순서

1. f612 기준 baseline helper를 동결하고 13라벨 × 사전 설계 §1의 31표기 × 줄 단독/문장 안 = 806개 기대값을 literal로 작성한다. mode/reasons/warnings와 #0 결과는 후보 정규식으로 생성하지 않는다. API_KEY 및 한국어 API 키의 기존 예외도 그대로 명시한다.
2. 음성 16문장은 #0 false와 현재 전체 출력을 literal로 고정한다. 다른 규칙으로 이미 exact인 5개를 non-exact로 오인하지 않는다. 과보호 8문장(JSON 설명 5, (token) 1, U3만 잡는 산문 2) 및 겹침 `**"password"**:`, `"**password**":`, `("password"):`, `('password'):`, `"(password)":`의 미보호도 literal로 고정한다.
3. N-27의 정규식 4개를 literal로 동결한 미분 검사를 둔다. 현재 양성 ⊆ 새 양성을 검사하고, 새 양성은 승인된 U3 표기로 한정함을 행렬·경계 사례로 검증한다. 새 테스트 RED 확인 → 4개 suffix만 변경 → GREEN → 전체 회귀 검증 순서다.
4. `docs/design.md` N-27 문단의 N-32 제외 문장을 수정한다. 새 보호 표기, 여는 짝 미검사와 JSON 설명 과보호, 남는 제외 범위를 적는다. 구현 파일 범위는 정책·테스트/helper·N-32 성능 도구/증거·해당 설계 문단·bundle이다.

## 성능 게이트 사전등록

- N-27 runner/analyzer의 N-32 복사본을 만든다. 기존 도구·evidence·evidence 테스트 바이트는 보존한다. 복사본에서 schema/campaign/path/base 및 analyzer의 하드코딩 recipe 수 20을 28로 맞추되 판정 규칙은 변경하지 않는다.
- JSON `performancePlan.recipes`에 기존 20개와 신규 8개의 정확한 prefix/unit, 10 MiB 입력 해시, A/A′/B 전체 출력과 #0 기대값을 등록했다. 28개 모두 세 variant의 출력이 같다. #0 true는 ko-credential-10mib뿐이다. 각 기대값은 dist와 untimed 후보 실행으로 확인했다.
- 신규 8 unit: `"password"`+NBSP×60+ASCII 공백; `"password"`+NBSP×8; `"password"`+U+3000×8; `"password" `; `(password) `; `"비밀번호"`+NBSP×8; `「비밀번호」`+NBSP×8; `"api키"`+NBSP×8. prefix는 빈 문자열이며 N-27 recipeInput의 반복·ASCII 공백 패딩으로 정확히 10 MiB를 만든다.
- 대표 입력은 기존 5개, 최악 입력은 23개다. shuffle seed `0x4e173001`, bootstrap seed `0x4e173002`; warmup 2블록×6순열=12라운드, 측정 6블록×6순열=36라운드. 28×12×3=1,008 warmup cell, 28×36×3=3,024 측정 cell, 합계 4,032.
- seed는 N-27 그대로 재사용한다. 새 recipe는 닫는 문자 중 큰따옴표/괄호/낫표만 직접 다루므로 다른 문자에 대한 성능 대표성은 한계다. 승인된 28개를 늘리지 않으며 나머지 문자는 기능 행렬로 검증한다.
- recipe별 36라운드 paired ratio B/mean(A,A′)의 중앙값; A′/A 중앙값 [0.97,1.03]; 6개 블록 전체를 단위로 10,000회 bootstrap, type-7 2.5/97.5% CI. point>1.03은 FAIL; point≤1.03이고 upper>1.03이면 BORDERLINE 통과; 둘 다≤1.03이면 PASS. 블록별 중앙값도 보고한다.
- 우선순위 INVALID>FAIL>BORDERLINE>PASS. 무결성·출력·순서·개수·해시·유한값·A′/A 검사를 유지하며, 대표 5개에서 각 variant 중앙값 1 ms 미만이면 INVALID다. 첫 시도 INVALID이고 개별 FAIL이 없을 때만 1회 재시도한다. FAIL/BORDERLINE 재측정 금지; 사후 regex/recipe 조정 금지.
- 실제 측정은 독립 빌드한 A/A′/B 파일 모듈을 사용한다. 이 조사의 data URL 모듈은 시간 측정에 쓰지 않는다. 구현 PR에서 source/tool/input/oracle 해시와 환경·seed·고정 프로토콜 manifest를 측정 전에 커밋한다. 이 계획 PR은 시간 값을 측정하지 않았다.
- 기존 N-27 산문 지연 2.0~2.2%와 사전 설계의 술어 단독 관측값은 상한이나 통합 게이트가 아니다. BORDERLINE 가능성을 수용하며 결과에 따라 사전등록을 바꾸지 않는다.

## 재현·검증·검토

- 재현: 별도의 f612 checkout에서 의존성 설치·build 후 `node <plan-PR>/research/src/n32-quoted-label-impact.mjs <built-f612-checkout> --out <tmp.json>`. 바이트 재현은 기록된 Node v24.18.0/TypeScript 5.9.3 기준이다. plan PR HEAD를 baseline으로 넘기면 거부한다. pinned Git blob 조사, source/dist 일치·dist 전후 해시 검증을 수행한다. 메모리 모듈은 해당 dist의 상대 import 없음에 의존하며 dirty 검사는 policy와 N-27 두 도구에 적용된다.
- 출처 해시는 JSON `provenance`에 있다. source와 Git 텍스트 해시는 LF 정규화, dist는 실제 바이트 기준이다. 번들·package-lock 및 비상수 동적 문자열은 정적 조사에서 제외하며 제외 목록도 결과에 남긴다.
- `provenance.preservedFiles`는 이번 계획 PR에서 보존하는 기준 파일의 해시다. 후속 구현에서 policy/N-27 행렬/E-3 테스트는 위 승인대로 변경하며, N-27 helper·도구·evidence·evidence 테스트만 계속 보존한다. 해당 정책 식별자 넷은 production export가 아니고 테스트 로더만 내부를 노출한다. 구현 시 dist/bundle 재빌드 일치도 확인한다.
- 기준 테스트 `npm test -- tests/policy-n27.test.ts tests/policy-n17.test.ts tests/policy-f21-rework.test.ts --reporter=dot`: 855 PASS. 제품 변경의 GREEN이 아닌 기존 상태 확인이다. 영향 JSON 2회 바이트 일치, 79건/28 recipe/출력·원문 assertion, 프로젝트 gate와 Draft PR 뒤 결과는 PR 본문에 기록한다.
- 동적 이관 재확인: 별도 임시 f612 복사본의 policy 원문 4개만 위 후보로 치환하고 `npm run build`, `npm test -- --reporter=json --outputFile=<tmp.json>` 실행. 2255 PASS / 79 FAIL / 5 SKIP이며 실패 이름 집합은 migrations.rows 78개 + E-3 1개와 정확히 같다. 작업 브랜치 제품 파일은 바꾸지 않았고 이 RED는 이관 대상 확인용이다.
- Claude Opus 5.5 초기 계획: 0 blocker / 5 major / 5 minor / 3 note; 원문·8 unit·출력·빌드/읽기 구분·출처/비밀보호 명세로 반영. 마일스톤 검토 및 Astra 최종 판정은 PR 본문과 로컬 HANDOFF에 기록한다.
- 중단 조건: 범위 밖 기대값·의존성·설계 변경은 승인 요청; 제품 구현은 계획 PR 검토 및 사용자 승인 전 시작하지 않는다. 현재 목표는 Draft PR까지만이다.
