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
- [ ] #0 OR 최소 구현, GREEN·회귀 확인 후 별도 커밋.
- [ ] 증거 분석기 RED/GREEN, 측정 전 manifest 커밋과 독립 검토.
- [ ] 성능 게이트 및 문서, 전체 npm 검증, push·Draft PR, 최종 로컬 검증과 primary 판정.

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
- 크기 제한 선행 fallback 우려는 실제 코드와 달라 기각했다. 분류 후 특정 stack RangeError를 catch하며 임의 입력 길이 제한은 없다. 존재하지 않는 제한을 위한 테스트는 만들지 않는다.
- 검증기/측정기 및 최종 독립 검토는 진행 중이다. 성능 측정, push·Draft PR, 최종 Astra 판정은 아직 수행하지 않았다.
- 다음 Task·Ready·merge는 별도 사용자 승인 대상이다.
