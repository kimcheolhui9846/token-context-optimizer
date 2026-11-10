# 6.4b-5 — 텍스트 artifact 저장소 상한: 계획·영향 조사

Tier E. 기준 main e906015a4be6bac2904d4ee83b52ae36ab0f2e59; 브랜치 codex/6-4b-5-store-bound-plan. 제품·기존 테스트·번들 변경 없음. E1–E8과 실제 구현은 사용자 결정 대기. #106은 승인·merge 완료로 보존한다.

## 측정과 추정식

Node v24.18.0, V8 13.6.233.17-node.50, Windows, pointer compression=0. 별도 child 3회 중앙값, GC 3회 뒤 heapUsed+external 증가; arrayBuffers는 중복 합산하지 않았다. 1 KiB는 단일/100개 batch의 기록당 값을 함께 표기한다. [원측정](../../../research/results/6-4b-5-store-memory.json), [혼합 문자열 추가 측정](../../../research/results/6-4b-5-store-memory-mixed.json), [최종 분석](../../../research/results/6-4b-5-store-analysis-final.json)에 raw·ratio·실패·소스/dist/분석 스크립트 해시를 보존했다.

| 입력 형태 | 1 KiB 단일 / batch (KiB) | 1 MiB (MiB) | 10 MiB (MiB) |
|---|---:|---:|---:|
| a+LF | 59.86 / 38.87 | 37.02 | 370.02 |
| 빈 줄 LF | 95.86 / 74.87 | 73.02 | 730.02 |
| 40 B 문장 | 27.57 / 5.50 | 3.62 | 36.02 |
| 400 B 줄 | 16.84 / 3.15 | 1.28 | 12.62 |
| 한글·CJK | 27.75 / 5.65 | 3.75 | 37.32 |
| 문장 CRLF | 30.56 / 8.46 | 6.59 | 65.68 |
| ASCII 한 줄 | 16.60 / 2.91 | 1.02 | 10.02 |
| 12글자 ASCII+LF | 29.66 / 10.89 | 9.02 | 90.02 |
| 한 글자 CJK+LF | 49.70 / 26.88 | 25.02 | 250.02 |
| ASCII+끝 이모지 1개 | 17.61 / 3.91 | 2.02 | 스택 초과 3/3 |
| 12글자 ASCII+CRLF | 34.16 / 12.08 | 10.17 | 101.45 |
| 12글자 CRLF+끝 이모지 | 35.08 / 12.98 | 11.17 | 111.45 |
| 문장 CRLF+끝 이모지 | 31.59 / 9.48 | 7.59 | 75.68 |
| 12글자 LF+끝 이모지 | 33.99 / 11.90 | 10.02 | 100.02 |

필수 7형태×3크기×3회는 모두 완료. 확장 포함 text 129/132, 이미지 6/6, null control 3/3, 정보용 default-heap 3/3 완료. 추가 oneEmoji 10 MiB만 기존 buildSourceMap의 RegExpStringIterator.next에서 RangeError: Maximum call stack size exceeded 3/3. 이 셀의 추정식 검증은 미해결이며 값을 대입하거나 제외 사실을 숨기지 않는다. 제품 수정은 별도 범위다.
null control은 모두 1,992 B; 단일 1 KiB의 released 잔차는 약 19–29 KiB여서 작은 입력의 고정 비용에는 GC/초기화 잡음이 섞인다. K 선택은 큰 입력과 batch 모든 반복을 사용한다. 10 MiB 성공 셀의 arrayBuffers 증가는 모두 0 B이며, external 기여를 실제로 포함했다. 큰 기록 해제 후 잔차는 약 19–28 KiB로 감소했다. 이미지 합성 메타데이터는 strict 596.73 B, tolerant 669.05 B/개; 짧은 경로·고정 chunk 이름 2개의 작은 예이며 긴 경로/ignoredSegments/큰 배열의 상한 증거는 아니다.

B=byteLength, L=sourceMap.length. 독립 검토 후 혼합 문자열 36/36과 null3/3을 추가해 전체 text165/168, null6/6이다. 아래 비율은 성공한 raw165건의 최대 actual/estimate; 1 초과는 과소추정이다. K72/110/128/160·F0/4096과 UTF-16 대안도 보존했다. 회수량(retained−released) 기준 K128/F4096 최대 비율은 0.999932로, F32768의 일부는 기록 자체보다 측정 잔차를 보수적으로 흡수한다. 회수량도 GC 잡음이 있는 보조 지표이며 주 지표를 사후 교체하지 않는다.

| 후보식 | 최대 실제/추정 | 과소추정 건수 |
|---|---:|---:|
| 2B + 72L + 32768 | 1.559638 | 42 |
| 2B + 110L + 32768 | 1.130309 | 18 |
| 2B + 128L + 32768 | 0.999925 | 0 |
| 2B + 160L + 32768 | 0.992051 | 0 |

호환성 조사 기준은 잠정 **2B + 128L + 32768 B**. K128은 관측 최악 줄 비용에 가까워 여유가 좁고, 독립 검토는 추가 여유를 원하면 **K160**을 권고했다(보정 표에 포함, K160 호환성 실행은 미수행). 사전 F4096의 oneEmoji1MiB 과소추정 1.0056배 때문에 F32768을 사후 추가했다. 실패 셀·다른 Node/V8·경로/metadata 길이에 대한 보편 상한이나 독립 검증이 아니다. weight는 저장 시 보존하며 외부 record 변형/참조는 실제 메모리를 accounting 밖에서 늘릴 수 있다.
default heap 한도 4,496,293,888 B에서 a+LF/빈 줄/CRLF 10 MiB는 각각 완료했다. 최대 RSS는 ascii1=1454.88 MiB, empty=2714.48 MiB, crlf=276.59 MiB. 최대 RSS는 프로세스 high-water이며 정확한 색인 heap peak가 아니다. 256 MiB는 저장된 추정치 예산일 뿐 색인 순간 메모리·RSS·동시 작업 상한이 아니다.

## E1–E8 결정표

| ID | 선택지 | 권고·근거 |
|---|---|---|
| E1 | (a) 무제한+문서 (b) 개수 (c) 추정 bytes (d) 둘 다 | **(c)**. 같은 10 MiB 입력의 retained 크기가 크게 달라 개수만으로 제한하기 어렵다. |
| E2 | (a) FIFO (b) get 승격 LRU | **(b)**. 반복 query/summary 대상 보존; get과 같은 ID re-put을 delete+set으로 승격. |
| E3 | (a) oversized 거부 (b) 새 기록 singleton | **(b)**. 기존 파일 크기 수락 정책을 추가로 좁히지 않는다. accounting은 max(예산, 단일 기록 추정치) 이하이나 기존 색인 실패까지 해결하지 않는다. |
| E4 | 보정 후 기본값 선택 | **256 MiB 잠정**. 빈 줄 10 MiB 추정은 약 1300 MiB여서 singleton. 일반 문서 수십 개를 보장하는 값은 아니다. |
| E5 | (a) 상수 (b) 생성자 (c) 생성자+env | **(b)** maxEstimatedBytes 추가, 0인자 생성자/ArtifactStore get·put 인터페이스 유지. env 추가 없음. |
| E6 | (a) 기존 오류 (b) 재색인 안내 (c) 새 코드 | **(a)** 정확히 `Artifact not indexed: <id>`. tombstone 없음; 현재 이 literal을 검사하는 기존 테스트는 0개. |
| E7 | (a) 이미지 유지+문서 (b) 동일 정책 | **(a)**. 이번 작은 프로필은 약 0.6–0.7 KiB/개, 픽셀 없음. 무제한 metadata 누적 위험은 별도로 명시. |
| E8 | (a) trimToTokenBudget 삭제 (b) 유지 | **(a)**. MVP dc60f14 도입 이후 호출 없음; 현행 줄 단위 정책과 맞지 않는 private 함수. |

## 소비자와 후보 실행

src/core/artifacts.ts가 유일한 직접 구현이고 src/server/index.ts:98,136,159가 프로세스 singleton을 공유한다. 같은 canonicalPath+fileSha256은 같은 ID를 덮어쓰며 내용 변경은 새 ID/옛 기록을 남긴다. 64-bit ID 접두부 충돌 시 덮어쓰는 기존 동작은 그대로다.
benchmarks/run.ts:124는 report당 store 하나를 여러 시나리오가 공유한다. tests/core.test.ts에는 관련 식별자 57곳과 :2077의 TimedMemoryArtifactStore 하위 클래스가 있다. tests/query-artifact-boundaries.test.ts와 tests/summarizer-selection.test.ts는 fixture마다 fresh store, tests/helpers/policy-large-input-child.mjs:128도 fresh store다. 별도의 ArtifactStore 직접 구현은 발견되지 않았다.
research/src/6-4b-4-summarizer-worker.mjs:72,210은 fresh store; 6-4b-4-summarizer-perf-worker.mjs:17,18은 shared store와 별도 indexed Map을 보유한다. 역사적 blank→prose→late→single 4개는 B=2,300,653, L=200,010으로 새 식에서 30,333,658 B(28.93 MiB), 256 MiB 아래다. 이 caller는 이번 실행하지 않았으며 외부 Map 참조 회수는 정책 밖이다.
임시 git archive + 명시적 C:\Windows\System32\tar.exe 복사본에서 A=256 MiB/LRU/singleton, B=A+미사용 함수 삭제. clean BASE/A/B와 계측 A256/TinyA1을 분리했다. 아래 통과/실패는 전체 테스트 및 별도 동작 시나리오 수다. 계측·Tiny는 정보용이다.

| 후보 | 전체 테스트 통과/실패 | benchmark exit | 시간 외 값 | 동작 통과/실패 |
|---|---:|---:|---|---:|
| base | 4332 / 0 | 0 | 기준 | 4 / 15 |
| A | 4332 / 0 | 0 | 동일 | 19 / 0 |
| B | 4332 / 0 | 0 | 동일 | 19 / 0 |
| A-instrumented256 | 4332 / 0 | 0 | 동일 | 정보용, 미실행 |
| TinyA1 | 4331 / 1 | 0 | 동일 | 정보용, 미실행 |

clean 결과는 [candidate JSON](../../../research/results/6-4b-5-store-candidates.json), 최종 계측·실패 상세는 [instrumented JSON](../../../research/results/6-4b-5-store-instrumented.json). 첫 계측의 worker 종료 hook 누락과 설치 테스트 import 이름 충돌은 원자료/스크립트 커밋 41d5d64로 보존하고, 계측만 worker별 동기 저장·고유 이름으로 수정해 재실행했다. 표는 재계측 값이다. A256의 test/benchmark 제거는 모두 0건, 최대 개별 store 추정치는 각각 42,632,766 / 800,570 B. Tiny의 제거는 96 / 85건이고 benchmark 시간 외 값은 동일하다. 계측은 실제 메모리나 clean 실행의 시간 증거가 아니다.
기본값 이관 후보는 **0개**. Tiny에서만 tests/core.test.ts:929의 uses mode-specific fallback reasons for blocked lossy summaries가 먼저 넣은 visual 기록 제거로 실패했다. 작은 예산을 해당 테스트에 적용한다면 두 기록이 들어갈 명시적 예산이나 모드별 fresh store가 후보이며, 현재 기본값에서는 변경 불필요하다. 전체 테스트는 각 5 skip; BASE 동작 실패 15개 중 2개는 새 private accounting의 부재를 확인하는 white-box RED이고 나머지는 정책 동작/입력 검증 RED다. 정보용 실패 뒤 benchmark도 실행했다.

## 구현 PR의 검증·문서 변경 계획

RED 먼저: tests/core.test.ts에 capacity/실제 victim, get 승격·miss, 같은 ID 증감·중복 미계산·re-put, oversized empty/replace/multi-victim, evicted query/summary 정확 오류, 잘못된 한도와 0인자 호환을 추가한다. unsafe weight의 put 실패가 keys/합계를 보존하는지, 혼합 weight에서 get/re-put 뒤 victim 순서도 검사한다. 모든 store.get caller의 실제 사용 의미를 검토해 불필요한 LRU 승격을 찾는다. 현재 제품 테스트 변경 없음; BASE에서도 통과하는 control과 신규 정책 RED를 구분한다.
GREEN은 최소 store 변경과 승인된 E8 삭제, targeted→전체 tests→typecheck/build→smoke:mcp→validate:plugin→benchmark 순서. 필요한 consumer 이관은 위 실제 기본값 실패를 근거로 결정한다. 사용자 승인 없이 공개 인터페이스/오류/환경 설정을 확대하지 않는다.
메모리 진단은 **구현 PR에서만**: 기본 heap/예산에서 빈 줄 10 MiB를 고유 ID로 순차10회 색인하고 외부 record/응답 참조·regex 상태를 해제한 뒤 GC3회. 매 단계 store 기록 수=1, 합계 weight=singleton weight를 검사한다. M=첫 singleton의 baseline 대비 실제 retained, S=256MiB+최대 단일 추정치로 두고 모든 후속 retained가 **min(S+max(64MiB,20%S), M+max(64MiB,20%M))** 이하여야 통과한다. 이렇게 보수적인 추정식 때문에 두 기록 잔존이 통과하는 구멍을 막는다.
별도 중간 크기 계열은 1MiB CRLF 고유 ID100개: 매 단계 추정 합계≤256MiB, 기록 수≤floor(예산/동일 fixture 추정치), 합계와 실제 entry weights 일치를 확인하고 위 S 기준 retained 한도도 검사한다. 관찰용 검사는 LRU를 승격하지 않는다. 두 계열 모두 OOM/stack failure는 진단 실패이며 임의 heap 증액으로 통과시키지 않는다. failure가 정책상 transient peak인지 누수인지는 별도로 분류한다. RSS/concurrency/caller 참조는 한계이며 두 진단 모두 이번에 실행하지 않았다.
시간 게이트는 권장하지 않는다: get은 평균 O(1) Map 작업, put은 실제 제거한 기록 수만큼 반복(삽입들 전체에 상각)한다. 앞으로 A/A 세 번째 무효 중단은 필수 게이트에만 적용하고 정보용 블록은 뒤에 두어 계속한다.
문서 변경 후보: README.md:41–42의 process-local 설명, skills/optimize-context/SKILL.md:55–57,86–93의 session-local/재색인 안내, docs/design.md의 artifact 수명 설명에 eviction·재색인·soft bound와 외부 참조 한계를 추가한다. 현 문구가 텍스트 ID의 무조건 세션 유지 계약이라고 단정하지 않는다. 이번에는 이 문서들 변경 없음.

## 재현·검토·승인

재현 환경은 Windows PowerShell, Node v24.18.0이다. 격리 checkout에서 `npm ci --ignore-scripts`; bundle 바이트를 보관한 뒤 `npm run build`하고 원본 bundle을 복구한다. `node research/src/6-4b-5-store-memory.mjs --output=research/results/6-4b-5-memory-repro.json`; `node research/src/6-4b-5-store-analysis.mjs --input=research/results/6-4b-5-memory-repro.json --output=research/results/6-4b-5-analysis-repro.json`; `node research/src/6-4b-5-store-candidates.mjs --k=128 --fixed=32768 --output=research/results/6-4b-5-candidates-repro.json`. 계측만 재현은 `--instrument-only --output=research/results/6-4b-5-instrumented-repro.json`을 사용하며 커밋된 clean 결과를 기준으로 재사용했다고 표시한다. 출력 덮어쓰기는 거부한다. 모든 child hidden; 원본 제품 SHA 보존/임시 폴더 제거는 JSON에 기록했다. Git LF와 Windows CRLF 변환은 해시 대조 시 구분한다.
혼합 셀 재현: memory 명령에 `--mixed-shapes --output=research/results/6-4b-5-mixed-repro.json`, 분석 명령에 `--mixed-input=research/results/6-4b-5-mixed-repro.json`을 추가한다. clean script/raw는 41d5d64, 최종 계측·혼합 측정 script/raw는 5abc37e에 보존했고 이후 후보 스크립트 변경은 변환 검증·오류 보고 보강뿐이다.
Claude Code claude-opus-5-5 initial: B0/M4/minor6/note5 반영; memory preflight: B0/M2/minor6/note5 반영. 미제공 파일을 주장한 scoped 의견은 실제 코드와 대조해 미채택. milestone: B0/M2/minor7/note5 → 혼합36셀/진단 민감도 보완. **scoped milestone: B0/M0/minor6/note6**, 주요 지적 해결·추가 측정 불필요. 최종 분석은 입력 환경·base·dist 일치와 mixed 실패/대조군을 함께 검사하고 동일 재생성 확인; 현재 A/B 변환 해시도 측정 당시와 동일하다. 최종 gate는 Draft 뒤 기록한다.
전달문 대비 추가: 4형태+검토 후 혼합3형태, batch/null/release/default-heap, 정보용 A256/Tiny, 사후 F32768, 명시적 System32 tar로 git archive 추출. Luna 초안 오류는 primary가 통합 수정했다. 다중 victim 시나리오 확장은 위 구현 RED 계획이며 이번 19개가 이를 이미 검증했다는 뜻은 아니다. null은 생성자 TS 타입 계약 밖이며 prototype에서는 기본값으로 처리한다. 알려진 한계는 oneEmoji 기존 실패, 사후 보정과 K128의 좁은 관측 여유, 작은 합성 이미지 표본이다. Draft까지만 진행하고 E1–E8·구현·Ready·merge는 사용자 승인 대기다.
