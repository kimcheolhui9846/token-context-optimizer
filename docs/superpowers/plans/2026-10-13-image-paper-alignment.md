# Task 32: Image paper alignment implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan after user approval. Checkbox steps are acceptance checkpoints, not authority to run experiments.

**Goal:** 이미 승인된 Task31 설계를 한국어 논문 전체에 반영하고 사용자 리뷰의 세 Nit를 국소 수정한다.

**Architecture:** 결정 원장은 메모, 실행 설계는 프로토콜, 설명 문서는 논문으로 유지한다. 문서 정합화는 구현·실험·안전성 검증이 아니다. 사용자가 이 계획과 아래 P-1(a)/P-2/P-3/N-1/N-2 및 조건부 npm 생략을 승인했다. 본문 구현은 별도 구현자가 수행한다.

**Tech stack:** Markdown, Git, 의존성 없는 문서 검사. 코드·package 변경과 npm 실행은 현재 범위 밖이다.

## 1. 기준과 범위

- 기준 commit: `b57f7bcf2460bc0fe9ec3bc348d1a0c5bfe6f908` (`origin/main`). 아래 행 번호는 모두 이 base 기준이며 편집 후 행 번호가 아니다.
- 브랜치: `codex/task-32-paper-alignment`. 선행 Task31 head `0a0f58c70246145e96fa28310d82f36ada7fd7c8`는 사용자 지시로 PR31 Ready/merge됐다.
- 최초 HEAD/base 일치와 clean status를 직접 확인했다. 첫 산출물은 [Task32 핸드오프](../../agent/handoffs/task-32.md)다. 공유/루트 HANDOFF와 WBS는 사용자 지시로 제외한다.
- 계획 단계 당시 허용 파일은 이 계획과 Task32 핸드오프 두 개뿐이었다. 구현 승인 전 기존 문서 편집·commit·push·PR은 하지 않는다.
- 승인 후 제안 파일은 아래 다섯 개로 한정한다.

| 파일 | 허용 변경 |
| --- | --- |
| `docs/research/image-first-paper-draft.ko.md` | §3의 지정 hunk와 삽입, 전체 정합성 검토 |
| `docs/research/image-first-evaluation-protocol.md` | 이 계획 §4의 R-1(프로토콜 §3)/R-2(프로토콜 §2)와 임시 불일치 주석만 |
| `docs/agent/handoffs/task-31.md` | base L122에 대체 표시 한 개만 |
| `docs/superpowers/plans/2026-10-13-image-paper-alignment.md` | 계획·검증·리뷰·전달 기록 |
| `docs/agent/handoffs/task-32.md` | 작업 현황·실제 증거·후속 사항 |

- 보호: 결정 메모 전체/17 결정값, Task29/30, Task31 계획, WBS, 코드·테스트·설정·package·데이터·사용자 리뷰 원문.
- 금지: 새 연산 순서, encoder/OCR/selector/no-op/resize 규칙, 정확 치수/family 배정, calibration 기준, 파일럿 모델 선택. 실험·이미지 생성·encoder/probe·calibration·hosted/count-tokens·외부 조사 없음.
- Task31의 npm 생략 승인은 자동 승계하지 않는다. Task32 docs-only gate 생략을 새로 제안하며 사용자 결정 전 승인됐다고 쓰지 않는다.

## 2. 이미 승인된 요구사항의 논문 추적

결정일은 **2026-10-12**, 이번 문서 작업일은 **2026-10-13**이다. [메모](../../research/image-protocol-decision-memo.md) §11 아래 사용자 결정 기록과 [프로토콜](../../research/image-first-evaluation-protocol.md)을 근거로 옮긴다. 일반 합성 표를 재계산하지 않는다.

| 결정 | 논문에 반영할 의미 | 위치 |
| --- | --- | --- |
| D1 | 직접 생성한 손실 이력 없는 RGB PNG, channels 3 | §4 clean 정책 |
| D2.1 / D2.2 | JO: clean 치수, q50 잠정값, P-in | §4 네 조건 |
| D2.3 / D2.4 | DO/CB: 같은 A-cap 긴 변 상한 1024 잠정값 | §4 네 조건 |
| D2.5 / D2.6 | CB: 1024 뒤 q50, P-in | §4 네 조건 |
| D2.7 | D2-b 조건 공통, 후보값 1536/q75와 다름 | §4 조건·calibration |
| D3.1 | B-rc, crop 없이 1536 no-upscale → q75 JPEG | §3.1 / §4 arms |
| D3.2 | S-same, C/D는 영역만 선택, 출력 preset 선택 안 함 | 초록·서론·§3.1 / §4 |
| D3.3 | E-same, oracle crop 뒤 B와 같은 변환 | §4 arms |
| D3.4a | PC-out 역할, 현재 조합의 arm 출력에서는 비활성. 이름 유지 | §3.1 |
| D3.4b | K-n, 원천 clean 파일 그대로, PNG canonical 재인코딩 없음 | §4 clean 정책 |
| D4.1 / D4.2 | DO PNG, 입력 RGB 3 channels 보존 | §4 네 조건 |
| D4.3 / D4.4 | DO가 PNG이므로 JPEG quality/profile 해당 없음 | §4 네 조건 |

- 추가 사용자 결정 X1은 B crop 없음, X2는 변환 arm 최종 출력 q75 P-in JPEG(A와 D fallback 제외)다. D3에서 자동 도출했다고 쓰지 않는다.
- P-in은 `jpeg-ycbcr8-baseline-444-v1` 목표 프로필이다. 실제 encoder 출력 적합성은 X9 미검증이다.
- clean 긴 변 `1536 < L <= 2528`, 사용자 확정 기준값 **2048**. 정확 width×height·종횡비·family 배정과 기준값의 운영 의미는 이후 생성 Task에서 사용자 승인으로 구체화한다. 새 치수를 고르지 않는다.
- q50/1024는 사용자 선택 잠정값이며 근거로 최적화한 값이나 검증된 안전 threshold가 아니다. 12 calibration family의 확인 기준은 미정이며 실행 전 사용자가 결정한다.
- 어떤 stress 값 변경도 사전 사용자 승인 후 이전 값·새 값·이유를 기록한다. arm 1536/q75는 유지한다. 이 절차가 arm preset 변경 허가는 아니다.
- P2: stress recipe 먼저 고정 → 해당 recipe에서 guard 조정 → 이후 stress 변경 시 최종 값에서 guard 재확인 → held-out 전에 함께 freeze. held-out 튜닝 금지. 변경 때 D2-b, T < 1536, clean/stress 치수 부등식, accounting 상한과 최종 guard 조정을 재확인한다.
- CB를 clean에서 직접 파생한다는 P1은 기존 메모 집계 가정이다. 새 사용자 결정으로 승격하거나 실제 생성 경로가 검증됐다고 쓰지 않는다.
- 위 결정 코드는 계획의 추적용이다. 논문 본문에는 Task 번호와 메모 결정 코드를 쓰지 않는다. 조건 표는 clean, JPEG-only, downscale-only, combined 전체 이름과 일반 설명을 사용한다. 프로필 ID는 한 번 정의한다. canonical clean은 원천 명칭으로 그대로 유지하며 PNG canonical 재인코딩과 혼동하지 않는다.

## 3. 논문 편집 지도와 보존 조건

대상: [논문](../../research/image-first-paper-draft.ko.md), base 212행. 아래 교체 범위 안에서도 지정한 기존 사실·안전 문장은 유지한다. 줄바꿈을 위한 인접 범위 확대는 하지 않는다. 추가 모순을 발견하면 구체 hunk를 계획/리뷰에 먼저 기록한다.

### 3.1 초록·서론·방법의 선택 대상

- [x] L8–9: ‘후보 변환을 고르고’를 ‘후보 영역을 고르고 고정된 출력 변환을 적용하며’라는 의미로 정합화한다. 위험 시 동일 원본 fallback과 전처리 정책 제안이라는 문장을 보존한다.
- [x] L24–26: ‘변환 후보를 선택’의 대상을 영역으로 한정하고 fallback 판단의 주체는 selector가 아니라 guard로 명확히 한다. 목표·보수적 원본 복귀·안전성 가설 문장을 삭제하지 않는다.
- [x] L56: 요청 입력의 ‘선택 가능한 변환 프리셋’을 현재 선택된 고정 출력 변환 설정으로 고친다. 질문/원본 pixels/보안 제약을 보존한다.
- [x] L62–67 교체: 활성 변환은 1536 no-upscale 뒤 q75 P-in JPEG 하나, selector는 영역만 고른다. PNG canonical 이름은 유지하되 S-same/PC-out에서 arm 출력에는 비활성임을 명시한다. DO 준비 PNG와 동일 encoder 설정이라는 주장은 하지 않는다.
- 이 hunk는 기존 ‘계획이며 검증된 안전값 아님’, resize→JPEG 순서, effective transform 기록, 질문/OCR의 작은 글자·선·표·UI 단서와 OCR binding gate를 보존한다. 후보 점수·tie break·구체 selector는 정하지 않는다.
- 여기에는 “resize의 실제 적용은 입력 조건과 crop 결과 치수에 달린다(§4 참조)” 한 문장으로 전방 참조를 둔다. 세부 identity 설명은 §4에 한 번만 쓴다: DO/CB 준비 resize는 실제 치수를 줄인다. 이후 arm의 1536 resize 단계는 identity다. B에는 crop이 없어 q75 재인코딩이 남고 C/D/E는 선택된 crop/영역 처리와 q75가 남는다. CL/JO에서 B의 resize는 비identity이며 C/D/E는 crop 결과 치수에 따른다.
- q75 재인코딩을 q50 JPEG에 대한 no-op으로 생략하지 않는다. resize identity는 pixels/bytes 동일성이 아니다. full-frame/no-op, 중간 crop 저장, resize 필터/반올림과 실제 bytes는 미정·미검증이다.

### 3.2 원본 복귀와 calibration

- [x] L78의 같은 문단 끝에 삽입: “입력 stress recipe와 guard의 calibration 및 공동 freeze 순서는 §4에 따르며, 이번 문서는 calibration 결과를 보고하지 않는다.”라는 한 문장 전방 참조를 둔다.
- 이 계획 §2의 잠정값·변경 승인·12 calibration family·P2 상세 절차와 기준 미정은 논문 §4의 네 조건 표 뒤에 한 번만 설명한다. 통과 기준을 만들지 않는다.
- L71–78 원문은 그대로 보존한다: original은 배정 variant, damaged fallback에 hidden clean 없음, guard 위험 조건, calibration-only/held-out 금지, 인증 threshold 없음, fallback 사용률 자체가 성공 아님.
- L80–83 출력·provenance·경로·원본 보존 규칙도 그대로 둔다.

### 3.3 평가 입력과 arms

- [x] L115–119 교체: 12/36 family·세 strata 균등·OCR-small-text, ‘탐색용 held-out’, ‘실제 데이터셋은 아직 확보하지 않았고’, ‘답과 증거를 숨긴’을 보존하면서 첫 pilot 원천을 직접 생성한 합성(소유) 무손실 이력 RGB PNG로 한정한다. public benchmark 후보/라이선스·접근·hash 확인 전 미사용 조건은 유지한다.
- [x] L119 뒤 새 문단으로 삽입: clean의 K-n/치수 범위/2048/미정 정확 치수와 실제 PNG 프로필·encoded 10 MiB 미검증을 설명한다. 이어 네 조건의 compact table을 둔다. K-n은 계획 추적 코드이며 논문에는 원천 그대로 사용한다는 일반 설명만 쓴다.

| 조건 | 기재할 recipe |
| --- | --- |
| clean | 원천 RGB PNG 그대로, 재인코딩 없음 |
| JPEG-only | clean 치수 그대로 → quality 50 JPEG, 정의한 목표 프로필 |
| downscale-only | 긴 변 상한 1024 downscale → RGB PNG, channels 3 보존; JPEG quality/profile 해당 없음 |
| combined | 긴 변 상한 1024 downscale → quality 50 JPEG, 정의한 목표 프로필 |

- 표 뒤 같은 cap 표현/같은 q50/D2-b와 arm 1536/q75와의 구별을 적는다. P1 기존 집계 가정 및 미확인 실제 경로를 짧게 표시한다.
- accounting 문구 제안: “치수 범위에 대한 JPEG decoder accounting 검토는 산술적 한계 검토이며, 실제 encoder 출력·encoded 크기·프로필 적합성·메모리 사용 또는 안전성을 검증한 결과가 아니다(프로토콜 §2 및 결정 메모의 accounting 산술 기록 참조).” 논문에는 이 두 원문 링크를 둔다.
- decoder accounting 숫자·fixture table 상수·큰 도출표를 논문에 중복하지 않는다. 보호할 §5의 ‘앞 절 수치’ 설명 및 §3.3 provider token 회계와 혼동을 피한다. 이것이 초기 리뷰 m2를 반영한 최종 계획 권고안이며 사용자 계획 승인 대상이다.
- [x] L121–128 교체: 다섯 arm을 현재 선택에 맞춰 명시한다. B crop 없음, C/D 영역 처리 뒤 같은 변환, E oracle crop 뒤 같은 변환, A/D fallback 배정 variant 그대로. L128의 조건 나열은 recipe table로 대체하되 ‘네 입력 조건에서 source family를 함께 유지한다’는 문장은 보존한다.
- 반드시 유지: 동일 variant/question/model/detail/output cap, E hidden geometry의 optimizer/tuning 유입 금지, **E annotation은 배정된 source variant에서 만든 frozen geometry와 crop만 사용**, **deployable arm에 전달하지 않음**, **네 조건에서 source family를 함께 유지**, guard 유무 비교, preexisting corruption과 새 degradation 분리.
- [x] L121–128 교체 문단 바로 뒤에 새 문단을 삽입하여 이 계획 §3.1의 상세 identity 설명과 q75 재인코딩/no-op 한계를 한 번만 배치한다. 이 삽입은 보호된 L129를 변경하지 않는다.
- ‘가능한 한’ 없이 같은 출력 변환 설정임을 적되 crop 수/영역 차이로 transform budget이 달라지면 selector만의 효과로 해석하지 않고 출력 size/effective transform을 함께 보고한다. 동일 설정이 동일 치수/동일 bytes라는 주장은 하지 않는다.

### 3.4 D−C 해석과 결과 보고

- [x] L140 뒤 새 문단으로 삽입: 기존 논문 용어인 ‘fallback 사용률’을 사용하며 첫 정의에만 ‘fallback 사용률(fallback rate)’로 병기할 수 있다. primary D−C와 전체/조건별로 함께 보고한다. 분자는 held-out D slot 중 guard가 fallback을 선택한 수, 분모는 D 배정 전체 144/조건별 36이다. guard 결정 없는 slot(`not_started` 등)은 분자에서만 제외하고 개수를 별도 보고하며 분모에 남긴다.
- primary metric은 planned production slot의 family-averaged QA success임을 프로토콜과 맞춰 명시한다. fallback 비용·지연을 D 결과에 포함한다. fallback rate로 slot을 제외하거나 primary를 조정하지 않는다.
- rejection n/N·n/S와 fallback rate는 다른 지표다. 기존 failure/retry/not_started 규칙은 바꾸지 않는다. calibration fallback 분모를 새로 만들지 않는다.
- D−C 문구: 설계상 입력 선택 차이는 D fallback slot에서만 가능하다는 필요조건이며 충분조건은 아니다. 수락 slot의 같은 artifact 사용과 변환 결정성은 X9 미검증이다. fallback에서도 C JPEG와 CL/DO PNG bytes는 같을 수 없고 JO/CB는 일치 가능성을 배제하지 못하지만 측정하지 않았다.
- DO vs CL, CB vs JO/CL의 치수 구별은 실제 cap downscale가 실현될 때의 도출이다. 네 조건의 모든 pixel 배열이 서로 다르거나 q50 손상/효과가 입증됐다고 쓰지 않는다.
- L137–140 기존 primary/secondary·family clustering·비열등성/검정력 제한·oracle 진단·지표 문장은 보존한다.

### 3.5 논의·결론과 전체 점검

- [x] L168의 첫 ‘소유·합성’ 표현을 이번 pilot의 직접 생성 합성(소유) 원천으로 한정한다. 프로토콜 L26의 넓은 소유·합성 범주와 충돌하지 않는다. L168–171의 대표성 한계·공개 dataset의 family split/hash·domain 분리·video 별도 승인은 보존한다.
- [x] L178–180의 기존 milestone 순서(입력 프로필 확장 → resize/crop provenance → guard/fallback → 평가 adapter)와 ‘순서대로’를 유지하고 ‘먼저 구현할 변환 연산은 아직 선택하지 않았다’는 한정만 덧붙인다. 현재 M1a 한계, ‘이 프로토콜의 gate를 통과’, ‘paper와 구현은 증거 사양이 안정된 범위에서’ 및 L181 경계를 보존한다. 이는 roadmap 순서를 해체하지 않는 최종 계획 권고안이며 사용자 계획 승인 대상이다.
- [x] 초록부터 참고문헌까지 다시 읽고 ‘후보’, ‘원본’, ‘PNG canonical’, ‘identity’, ‘소유’, ‘순서’, ‘안전’, ‘결과’의 문맥을 확인한다. 검색은 누락 탐지 보조일 뿐 문장 의미 검토를 대체하지 않는다.
- 편집 없이 보존할 구간: L1–7, L10–23, L27–55, L57–61, L68–78, L79–114, L120, L129–140, L141–167, L169–177, L181–212. 위 삽입 위치는 기존 행을 바꾸지 않는다. L168은 첫 표현 외 나머지를 보존한다.
- 특히 **§3.3 L85–111**, **§5 L142–148**, **참고문헌 L183–212**는 아래 승인된 단어 수준 예외 외 byte/줄바꿈 정규화 기준 동일하게 보호한다. 모델 ID·수치·외부 확인일/인용을 새로 검증하거나 갱신하지 않는다.
- 사용자 승인 P-1(a) 예외: 논문 L87의 ‘PNG 바이트’를 ‘파일 바이트’로, L147의 ‘텍스트 및 PNG 엔지니어링 테스트’를 ‘텍스트 및 PNG, JPEG 엔지니어링 테스트’로 바꾼다. 이 두 치환 외 해당 행과 보호 구간은 그대로다. 앞 보존 목록에도 이 예외만 적용한다. JPEG 추가라는 승인 의미에 맞춰 구현 지시와 쉼표 표기를 통일했다.

## 4. 프로토콜과 과거 기록의 최소 수정

- [x] R-1: 프로토콜 base L122에서 ‘B와 C는 가능한 한 같은 output’의 ‘가능한 한 ’만 삭제한다. L119–121의 단일 설정과 일치시킨다.
- L123–126의 transform budget/출력 size/effective transform, 모델·질문 불변, fresh session block/randomize, crop 수·모델·detail·output cap·provider 설정 freeze를 원문 그대로 보존한다. 프로토콜 §4 및 P1 안전 경계도 모두 보존한다.
- [x] R-2: 프로토콜 L47–55의 clean 정책 문단과 뒤 빈 행 L56을 내용 그대로 L45 ‘입력 조건은 네 가지다.’ **앞으로 이동**한다. L45–46과 L57–60의 네 항목이 이어지게 한다. 정책 내용을 다시 쓰거나 list를 바꾸지 않는다.
- [x] 논문 검증 후 프로토콜 L7–10 임시 불일치 주석만 교체한다. 반영 문구: “Task 32 문서 정합화(2026-10-13): 2026-10-12 사용자 결정을 논문에 반영했다. 이 문서 정합화는 변환 구현·calibration·pilot이 실행되었음을 뜻하지 않는다. 결정 원장은 결정 메모 §11과 그 뒤 사용자 결정 기록이다. 작업 기록과 후속 사항은 Task 32 핸드오프를 참조한다.” 날짜는 실제 실행일로 채우며 기존 메모 링크를 유지하고 Task32 핸드오프를 연결한다.
- 완료 주석은 실제 논문 수정·수용 검사 이후에만 적용/확정한다. L3–5의 실행 전 제안/승인 아님/논문 동시 유지/텍스트 벤치마크 비증거 문장은 그대로 둔다.
- 프로토콜 허용 변경 외 전체를 보호한다. 12/36, 720/576/144, primary metric/paired 단위, rejection/unknown/not_started/retry, blinding, stop, OCR/held-out 경계와 roadmap 모두 변경 금지다.
- 사용자 승인 P-1(a) 추가 예외: 프로토콜 L156의 ‘PNG 바이트’를 ‘파일 바이트’로만 치환한다. 나머지 L155–157과 지표 의미는 그대로다.
- [x] R-3: Task31 핸드오프 base L122 끝에 ` (아래 절로 대체됨)`을 추가한다. 기존 문장을 삭제/수정하지 않고 다른 모든 행을 그대로 둔다. Task31 완료/merge 이력 정리는 이 Task의 별도 편집 대상이 아니다.

## 5. 수용 기준

- [x] AC1: 현재 단계는 신규 두 문서만, 승인 후 최종 diff는 지정 다섯 파일만이다. memo와 17 결정값은 base와 동일하다.
- [x] AC2: 17 결정의 위 표 의미와 추가 X1/X2가 논문에 빠짐없이 반영되며 selector가 preset을 고르는 문장은 없다. 논문은 전체 조건명/일반 설명을 사용하며 프로필 ID는 한 번 정의한다.
- [x] AC3: 잠정값/사용자 선택/도출/실측을 구별하고 P2 순서·변경 승인·기준 미정·held-out 금지를 유지한다.
- [x] AC4: 논문의 ‘fallback 사용률’ 용어가 일치하며 144/36과 missing decision 처리, primary 동시 보고/무조정, D−C 필요조건·byte caveat가 정확하다.
- [x] AC5: clean 치수 범위/2048/정확 치수 미정과 accounting-only 한계가 일치한다. 실제 PNG/JPEG 적합성·encoded 10 MiB·효과/안전/비용 결과를 주장하지 않는다.
- [x] AC6: 지정 보존 구간과 P1 경계·호출 분모·§3.3·§5·참고문헌·현행 구현 한계가 유지된다.
- [x] AC7: R-1 한 구절 삭제, R-2 exact move, R-3 한 표시만 수행하고 임시 주석은 실제 정합화 이후 갱신한다.
- [x] AC8: 독립 초기/마일스톤 리뷰와 최종 Astra 직접 검토, 실제 검증/Git/PR 기록을 구별한다. 미수행은 NOT RUN으로 남긴다.

## 6. 구현 단계와 검증 설계

### Task A: 계획 승인 전

- [x] Git 격리/clean/base 확인, 첫 핸드오프 생성, 관련 원문 읽기.
- [x] 구체 hunk·보존 목록·AC 정의.
- [x] `node .artifacts/task-32-plan-review/verify-plan.cjs` 실행. 보완 후 지정 계획 담당 직접 재실행 PASS, existingFilesUnchanged true, errors []. ignored 보조 도구이며 구현 검사가 아니다.
- [x] 별도 정확 Claude Opus5.5 초기 계획 검토, 실제 모델 응답 증거와 모든 지적 처리 기록. 상세 결과는 핸드오프 §7에 있다.
- [x] 사용자에게 계획과 Task32 npm gate 생략 제안을 제시하고 중지.

### Task B: 승인 후 문서 구현

- [x] 승인 범위/조건을 핸드오프에 기록. RED 비적용 이유(실행 동작 없는 문서 정합화)와 아래 수용 검사 baseline을 먼저 기록한다.
- [x] 별도 정확 Claude Opus5.5 구현자가 논문 지정 hunk를 작성하고 controller가 승인 범위만 적용한다. 소유권 분리, 타 작업 수정 금지.
- [x] R-1/R-2/R-3 적용, 논문-프로토콜-결정 메모 대조 뒤 임시 주석 갱신.
- [x] 의존성 없는 구현용 문서 checker를 ignored scratch에 준비하고 실행한다. 아래 검사를 포함하며 계획 단계 checker의 ‘기존 파일 불변’을 구현 완료 gate로 잘못 쓰지 않는다.

| 검사 | 기대 증거 |
| --- | --- |
| scope/base | base 대비 다섯 파일 allowlist, branch/HEAD 확인, 신규/기존 모두 직접 읽기 |
| 보존 | memo/관련 보호 파일 hash, 논문 지정 구간을 base 내용 anchor로 비교(편집 후 행 번호 아님), 네 조건 family 유지/E의 배정 variant frozen geometry·crop 한정/deployable arm 전달 금지, 프로토콜 exact edit/move 외 동일, Task31 한 suffix 외 동일 |
| 의미 | 17 결정 매핑, P2 순서, P-in 목표 한계, clean 범위/2048, fallback 144/36, 기존 720=576+144 확인 |
| 형식 | UTF-8/BOM 정책, U+FFFD·conflict marker·trailing whitespace·줄바꿈·fence·표 열 수·상대 링크 |
| 문서 전체 | 실제 전체 diff/read로 정합성·과장·누락·인접 보존 문장 직접 확인 |
| Git | `git diff --check` 및 staged/base diff 검사; untracked 문서는 직접 검사하여 빈 tracked diff PASS를 증거로 오용하지 않음 |

- accounting 수치는 기존 메모와 동일성만 확인한다. 산술을 재확인하더라도 무의존 산술만 허용하며 encoder·실제 출력·새 측정 증거가 아니다.
- [x] 구현자와 별도 fresh session의 독립 마일스톤 리뷰를 수행한다. 구현자 대화/내부 reasoning을 공유하지 않고 필요한 비민감 요구사항·실제 diff·검증만 제공한다. blocker/major를 범위 내 해소하고 재검증한다. 의미 변경/새 선택이면 먼저 사용자 승인을 받는다.
- [x] 일반화 표 재계산·새 실험·whole-file formatting 없이 국소 정리한다. 바뀐 항목만 재검증한다.

### Task C: 승인된 구현 전달

- [x] Task branch에 범위 파일만 정상 commit/push, Draft PR 생성. 기존 승인과 사용자 통합 기본값 안에서 진행하며 Ready/merge는 별도 지시가 필요하다.
- [x] Draft 뒤 targeted 문서 gate 재실행. npm gate는 이번 Task 사용자 결정에 따라 실행/생략하고 실제 결과나 NOT RUN 사유를 적는다. 생략은 이번 Task 사용자 승인에 따라 NOT RUN으로 기록한다.
- [x] Astra가 실제 diff/문서/검증/리뷰 해결과 HEAD=upstream=PR head, Draft 상태를 직접 확인한다. 결과 기록 변경 후에도 최종 head를 확인한다.
- [ ] Task Review Result로 보고하고 다음 Task 승인 대기. 첫 연산 구현이나 생성/calibration Task를 자동 시작하지 않는다.

## 7. 리뷰 상태와 위험

- 사용자 제공 Task31 PR 리뷰는 `claude-opus-5-5`, Approve / blocker 0 / major 0 / minor 0 / Nit 3이다. 원문은 주 저장소 `codex_review/codex_review_feedback_2026-10-13_task31-pr31.md`, 읽기 전용이며 Task32 독립 리뷰와 별개다.
- Task32 초기 독립 리뷰: 정확 `claude-opus-5-5` / `firstParty` 실행 성공, APPROVE WITH CHANGES(blocker 0 / major 1 / minor 6 / note 5). M1 보존 누락은 원문 직접 확인 후 명시 보존/검사로 수정했다. m1/m2는 위 최종 권고안으로, 나머지 표기·전방 참조·보존·독립성은 반영했다. m6 핸드오프 체크박스는 리뷰 입력 이후 이미 갱신된 시점 차이다. 실제 usage와 상세 처리는 Task32 핸드오프 §7에 기록한다. 구현 마일스톤과 scoped 재검토는 PASS WITH NOTES이며 구현 head의 최종 Astra 검토도 PASS WITH NOTES다.
- 위험: 동일 출력 설정을 동일 bytes/selector 단독 효과로 과장, provisional stress를 안전값으로 오해, PNG 준비와 비활성 canonical 혼동, 회계 상한을 전체 resource/encoded 승인으로 오해, 역사 문구를 현재 상태로 오해.
- 대응: 지정 caveat·보존 검사·전체 논문 의미 검토. X3/X4/X5/X8/X9와 실제 corpus 증거는 잔여로 유지한다.
- 사용자에게 새로 필요한 결정은 **이 계획의 구현 승인 및 Task32 docs-only npm gate 생략 여부**다. 기존 17 결정·PNG 이름 유지·2048·치수 결정을 이후 생성 Task로 미룬 선택은 재승인을 요구하지 않는다.
- 현재 상태: 사용자 계획 승인과 P-1(a)/P-2/P-3/N-1/N-2 반영 및 본문 구현·마일스톤 보완 완료, scoped 재검토 및 최종 Astra PASS WITH NOTES, Draft PR32 전달. 다섯 파일/hunk 밖 불일치를 발견하면 수정 전에 정확 hunk를 보고한다. Task 최종 전달 완료는 아직 주장하지 않는다.

## 8. 사용자 승인 반영 기록

- 사용자 제공 Task32 계획 리뷰는 Claude Code `claude-opus-5-5`라는 원문 표기, blocker 0 / major 0 / minor 3 / nit 2다. 이는 하네스 초기 리뷰와 별개이며 원문은 읽기 전용으로 보존한다.
- P-1(a): 논문 L87/L147, 프로토콜 L156의 위 세 단어 수준 예외만 승인. P-2: fallback 사용률 용어. P-3: identity는 L121–128 뒤 새 문단, L78은 같은 문단 끝, L119/L140은 새 문단. N-1: 논문 Task 번호·메모 코드 금지. N-2: ‘사용자 결정을 논문에 반영했다’ 문구.
- **npm gate NOT RUN 승인:** 다섯 Markdown 파일만 변경하고 코드·테스트·설정·package·dataset을 변경하지 않는 조건이다. 범위가 코드나 `docs/research/datasets/`로 넓어지면 생략 판단은 무효이며 먼저 범위와 검증을 재검토한다. Task31 waiver 승계가 아니라 이번 사용자 승인이다.
- 이 절은 앞의 ‘승인 대기’, ‘npm 결정 대기’, ‘현재 두 파일만 허용’이라는 계획 단계 상태를 대체한다. 이미 수행된 초기 리뷰/검증 기록은 이력으로 보존한다. 실행은 별도 구현자가 담당하며 이 계획 담당은 본문을 수정하지 않았다.
