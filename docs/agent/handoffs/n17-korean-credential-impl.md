# N-17 한국어 자격증명 라벨 구현

- Tier E: 제품·테스트 변경과 성능 측정 증거. 기준 `46939f3913e2c16bbe9bbc402974208e86eb99d6`, 브랜치 `codex/n17-korean-credential-impl`.
- 사용자 승인: 2026-11-05 계획 권장안 전체 확정, 현재 `/model` Astra 표시 사용자 확인. [승인 계획](n17-korean-credential-plan.md), [기존 프로젝트 핸드오프](../HANDOFF.md).
- 범위: 정책 tuple #0의 한국어 술어 OR, 독립 literal 테스트·기준 helper, 성능 측정기·분석기·증거, design 문서·생성 bundle.
- 제외: research/ 수정, 기존 영어·frozen120·F-21 oracle 변경, 다른 tuple/flags/fallback 변경, N-27·N-30, Ready·merge.

## 확정 계약

- T1+T2 17라벨, 내부 `[ \t]?`, 라벨 뒤 `\s*[:=：]`, `i`, api 앞 `(?<![A-Za-z0-9])`. 서술형·전각 등호·강조·새 하이픈/밑줄 문법은 제외한다.
- 한글 왼쪽 경계는 없으며 T2 접미부는 보호한다. 미지원 표기도 다른 규칙으로 exact/unknown이 될 수 있다.
- 수작업 기대값으로 단독/문장·내부 공백·JS 공백·13경계·api 접두부·숫자/코드 reason 순서를 검사한다. 기준 helper는 승인된 실제 정책 소스를 고정한다.

## 계획·현황

- [x] 병합·작업 격리·초기 독립 검토. 기존 characterization/URI 83개 및 기준 build 통과.
- [x] literal RED: 327개 중 새 보호 동작 294 실패, 대조군 33 통과. Primary 재실행 JSON 확인, helper 원문 일치 및 제품 미변경 확인. 별도 RED 커밋 (`Agent: codex`).
- [x] RED `7620e3d`, GREEN `3a614ed`. #0 OR만 변경, 정책·영어/F-21 회귀 416개 및 typecheck/build 통과.
- [x] 증거 분석기·재시도 RED/GREEN: 보완 회귀 46개 통과. 원래 정책 대비 실제 diff는 tuple #0 OR 한 줄뿐이다.
- [x] 측정 전 독립 재검토 PASS; 측정기 커밋 `26cde59`.
- [x] manifest 사전 커밋 `0dce98f`, 첫 측정 완료(432 warmup/1296 measured cells), 저장 analysis 재계산 일치.
- [x] 문서·전체 npm 검증 및 측정 후 `--check` 통과; primary 최종 판정 **CHANGES REQUIRED**: 유효한 성능 FAIL 4건.
- [ ] push·Draft PR: 사용자 지정 FAIL 중단 조건에 따라 미실행. 재측정·최적화도 하지 않는다.

## 성능 사전 확정

- S-1 채택: warmup 12라운드(2블록), 측정 36라운드(6블록). 각 블록은 A/A′/B의 6개 순열을 shuffle한다. 입력마다 PRNG를 초기화한다.
- shuffle seed `0x4e173001`; bootstrap seed `0x4e173002`, 10,000회마다 6개 블록을 복원추출하고 36개 round 비율의 중앙값을 다시 계산한다. CI는 type-7 2.5/97.5 percentile.
- 점추정은 round별 `B/mean(A,A′)`의 중앙값(짝수 중앙 두 값 평균). `A′/A` 중앙값이 `[0.97,1.03]` 밖이면 INVALID.
- 점추정>1.03 FAIL; 그 이하이고 CI상한>1.03 BORDERLINE; 나머지 PASS. 집계 우선순위 INVALID>FAIL>BORDERLINE>PASS. 유효한 개별 FAIL이 하나라도 있으면 다른 INVALID와 함께 있어도 재시도하지 않는다.
- FAIL이 없는 INVALID만 전체 재측정 1회 허용하며 모든 attempt를 보존한다. 재무효·FAIL이면 중단하고 보고한다.
- 한 cell은 full classifyContext 1회다. 해시·직렬화·입력 구성은 timer 밖. 작은 입력의 단일 호출은 잡음 위험이 있으며 결과를 본 뒤 batching이나 허용폭을 바꾸지 않는다.
- drift는 warmup 6/6, 측정 18/18의 뒤/앞 평균 비율을 진단용으로만 저장한다.
- 10 MiB 반복 라벨 및 완성 라벨 뒤 space/tab/NBSP/U+3000/LF/혼합 공백을 각각 검사한다. 영어·자연어·숫자·코드 및 한국어 변경의 literal 출력도 확인한다.
- manifest를 측정 전에 커밋하고 schema·seed·소스/빌드/스크립트/입력/출력 해시, round/block/position/variant, 결손·중복·순열 불균형을 검증한다. 최종 B 소스와 빌드는 측정값과 같아야 한다.

## 검토·제약

- Claude `claude-opus-5-5`, initial: CHANGES REQUIRED (0 blocker/5 major/6 minor/4 note), 제공된 계획 텍스트 검토. manifest 선행 커밋·혼합 FAIL 처리·최종 해시 검증을 채택했다. 실제 구현에서 재검토한다.
- Claude `claude-opus-5-5`, premeasurement: CHANGES REQUIRED (0 blocker/1 major/6 minor/7 note). 중단된 attempt의 전역 INVALID가 완료된 recipe FAIL을 가리는 오류를 재현·수정했다.
- 재검토 보완 RED 4실패/42통과 → GREEN 46통과: localStatus로 FAIL 보존, 같은 manifest와 재계산 analysis만 재시도 허용, ordinal 키 정렬, 비유한 비율 거부. Python 독립 golden PRNG/순열/CI 및 임계값 경계도 통과했다.
- prepare는 측정 코드·테스트·설정의 tracked/clean 상태를 요구한다. 강제 GC는 추가하지 않고 기존 자연 GC 조건을 사전 명시한다. tuple/flags/fallback 보존은 기준 커밋과 직접 diff로 확인했다.
- Claude `claude-opus-5-5`, retry-recheck: PASS (0 blocker/0 major/2 minor), 앞선 전체 재검토 240초 timeout 뒤 범위 한정 재시도 성공. major 해결 확인. minor: 집계 INVALID 우선순위는 승인 계약대로 유지하되 local FAIL을 보고하며, 재시도 시 attempt-1을 먼저 커밋해 원본을 고정한다.
- 크기 제한 선행 fallback 우려는 실제 코드와 달라 기각했다. 분류 후 특정 stack RangeError를 catch하며 임의 입력 길이 제한은 없다. 존재하지 않는 제한을 위한 테스트는 만들지 않는다.
- 검증기·측정기 테스트 38개 통과. 초기 하위 에이전트의 검증기 초안은 test-first가 아니었으며, primary 보완에서 실패 7/36 및 runner 실패 2/38을 직접 기록한 뒤 수정했다. 최종 통합 수정은 독립 검토 대상이다.
- 오류 수정: 기준 helper 복사 손상을 Git blob 직접 복사로 해결하고 원문 일치를 검사했다. 10 MiB 테스트의 공백 정규식은 검증기 자체 RangeError를 일으켜 동등한 trim 검사로 대체했다.
- 12개 입력×3변형 출력 및 측정 후 해시 검증 통과. 전체 npm 게이트: typecheck/build/smoke:mcp/validate:plugin 통과, 43파일 1740테스트 통과·기존 symlink EPERM 5건 skip.
- 첫 성능 측정: 집계 INVALID, 개별 PASS 4/FAIL 4/INVALID 4, `retryEligible=false`. 유효 FAIL: space 1.044847, tab 1.046243, NBSP 1.055465, mixed 1.031375(한계 1.03). 영어/numeric/code/한국어 양성은 A′/A 밴드 밖으로 무효이며 개선 근거로 쓰지 않는다.
- 원본·점추정·CI·A′/A: [성능 결과](../../research/evidence/n17/result.md). final Astra: **CHANGES REQUIRED**; 기능·범위·회귀·증거 무결성은 확인했으나 성능 수용 기준 미충족. 원본과 중단 사유를 보존하고 승인된 중단 조건에 따라 후속 구현/재측정/push/PR을 멈췄다.
- 다음 Task·Ready·merge는 별도 사용자 승인 대상이다.
