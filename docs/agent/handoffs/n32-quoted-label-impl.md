# N-32 따옴표·괄호 자격증명 라벨 구현

- Tier E — 기준 `b4abdb88d72f16f35de01ecaed80cd5a7325b700`, 승인 명세 [구현 계획](n32-quoted-label-plan.md), branch `codex/n32-quoted-label`.
- 범위: tuple #0 정규식 4개 suffix만 변경, 독립 기대값·기존 79건 이관, N-32 성능 도구/증거, 설계 한계, bundle. research/와 N-27 역사 증거는 보존한다.
- 사용자 승인: 코드·JSON 설명 과보호 수용; Draft PR까지만. 추가 기대값 이관·계획 변경·Ready·merge는 별도 승인 대상이다.
- 계획: 독립 literal RED → 승인된 정책/기대값 GREEN → 전체 gate/독립검토 → 입력·도구·환경 manifest 커밋 → 고정 성능 측정 → 결과/Draft PR → 최종 gate/Astra 검토.

## 구현과 검증

- 라벨 뒤 `\*{0,3}`만 `(?:\*{1,3}|["')”’）」』])?`로 치환했다. 기준 원문 전체와 비교하여 4개 외 차이가 없음을 확인했다.
- N-27 after 값 78개(dquote/squote/paren ×13×2), F-21 E-3 원문 1개만 변경했다. before 값과 다른 기존 assertion은 보존했다.
- f612와 b4의 정책 LF SHA-256은 동일하다: `308043afc87102079a8b8a082199afaf26301d88f8253ffb349e0d7b1ba7174e`.
- `policy-baseline-n32.ts`는 type-only import 경로와 출처 주석만 옮겼다. 이를 되돌린 원문은 기준과 동일하다.
- 806 literal 행렬은 기존 N-27 literal과 승인 U3 의미, 정적 정책 조건으로 작성했다. 후보 regex/classifier 출력에서 생성하지 않았다. JSON 여는 중괄호 뒤 문장 마침표의 기존 `code_syntax` 이유도 보존한다.
- 새 테스트는 음성16, 과보호8, 코드6, 미보호 겹침5, 잔여제외8, 동결 정규식4개의 양성 포함·경계·tuple 보존 검사를 포함한다.
- RED: 851개 중 447 PASS / 404 FAIL. 실패는 사전 지정 행렬390+과보호8+코드6와 일치; 예상 밖 실패0. 기준 기대값806도 독립 검사에서 일치했다.
- Luna 초안의 decoder/기준세대/겹침 오류는 primary Codex가 정적 근거로 수정했다. 초안 실패는 RED 증거로 세지 않는다. 이 수정은 승인 명세 내 테스트 오류 수정이다.
- 기존 기준 gate: targeted855 PASS, 전체2334 PASS/5 SKIP; typecheck/build/smoke/plugin/exact/diff PASS.
- GREEN 및 통합 gate: targeted1759 PASS; 전체3238 PASS/5 SKIP; typecheck/build/smoke:mcp/validate:plugin/check:exact/git diff --check PASS.
- `docs/design.md`에 새 표기와 여는 짝 미검사, JSON·코드 과보호, 겹침/밑줄/취소선/전각등호/코드span/대괄호/복수형/escaped JSON 제외를 기록했다.

## 성능 사전등록

- [preflight](../../research/evidence/n32/preflight.json)에 제품·79건·도구복사 감사, oracle 작성 경로, RED 집합, 환경 관측과 소스 해시를 묶는다.
- N-27 analyzer는 namespace와20→28 외 동일, runner는 namespace/base/recipes/artifactPaths 외 동일. 기존20 및 승인28 전체 입력/출력/tuple 값이 계획과 일치한다.
- warmup1008+measurement3024=4032 cell, 28 recipe, shuffle/bootstrap seed 및 통계·무효·재시도 규칙은 N-27 그대로다. baseline A/A′는 별도 파일 빌드다.
- manifest를 측정 전에 커밋한다. FAIL/BORDERLINE 재측정 금지; 첫 INVALID이며 개별 FAIL이 없을 때만1회 재시도. 측정 뒤 regex/recipe 변경 금지.
- 실제 성능: 첫 시도28 PASS/0 BORDERLINE/0 FAIL/0 INVALID,4032 cell 완료, 재측정 없음. [결과·recipe별 point/CI/블록 중앙값](../../research/evidence/n32/result.md).
- 최대 point1.016215(`quoted-password-nbsp-60`), CI[1.005968,1.021152]; 최대 CI상한1.022927. 저장 분석 재현 및 별도 Python 통계 대조 PASS,15artifact/3variant 해시 일치.
- 구현 커밋 `d9f6150`, 측정 전 manifest 커밋 `21d133a`. 측정 뒤 정규식·입력·도구·oracle은 변경하지 않았다.
- 한계: 균형 조정 전원/백신 활성 등 읽기 전용 환경 관측이며 배경 부하를 완전히 통제하지 않는다. 신규 성능 입력은 닫는 문자 중 큰따옴표/괄호/낫표만 직접 다룬다.

## 검토 및 인계

- Claude Opus 5.5 / initial-plan / 조건부 PASS / blocker0 major3 minor5 note4: oracle 작성 근거·사전 RED 집합·정규화 도구 감사로 major 증거 요건을 반영했다.
- Claude Opus 5.5 / tooling milestone / PASS / blocker0 major0 minor3 note2: functional oracle fingerprint 및 승인28 전체 대조 테스트를 추가했다. 상속 fallback과 Unicode 표기 혼용은 보존했다.
- 성능 도구 테스트52 PASS. 최초 도구 RED 시도는 sandbox 접근으로 시작 전 차단되어 유효 RED로 세지 않는다.
- Claude Opus 5.5 / implementation milestone / 조건부 PASS / blocker0 major1 minor4 note5: 실제 source/flags 검사·전체정책 동등성·변경표기집합·코드tuple 검사로 보완. 기능 테스트는852개이며 기존 기대값 추가이관은 없다. Claude Opus 5.5 scoped 재검토 PASS, blocker0 major0 minor0 note4; 모든 지적 해소.
- dist/bundle 재빌드 전후 바이트 동일. 최종 Astra는 측정 결과 및 git/PR/head 확인 후 수행한다.
- Claude Opus 5.5 / result milestone / PASS / blocker0 major0 minor3 note3: 예산 내 관측 지연·Python 산술대조 범위/코드·manifest 고정 재현 절차를 보완했다. frozen analyzer는 변경하지 않았다.
- 남은 일: push/Draft, Draft 후 gate/Astra. Ready/merge는 하지 않는다.
