# D01 최신 원고·그림·표 주장 정합성

- Tier E. 기준 main 927a5639(R08 병합)이다. 원고 출발점은 Draft #112 고정 head e1e5351이며, 공통 조상 5d668f9 이후 main은 #112의 11개 경로를 바꾸지 않았다.
- 첫 커밋 58d13f3은 #112의 11개 경로를 수정 없이 흡수했고 인덱스 blob이 11/11 일치한다. 네 그림 파일의 Git 속성은 text·filter 미지정이며 PDF만 diff=astextplain이다.
- 공개 전 점검에서 텍스트 diff, PDF 메타데이터, PNG 텍스트 청크, 두 분할 PNG 화면 모두 비공개 정보가 0건이었다.
- 커밋 502370f와 0ba15c4, PM 보완 커밋으로 #112 대비 15개 행의 문장을 바꿨다: 7·13(두 초록), 23·25(제품 도구 설명), 35(C4), 63(overview 비호환), 69(JPEG 648슬롯/458 고유, strict 거부·tolerant 통과, RQ1 7 별도), 130, 148(표 3 캡션), 164(H3 표현), 166, 180(R03 요약 감사·R04 한계), 182(R06 캐시 이월 관측과 추론), 184(R08 231/231·20/24·24/24), 188(결론).
- 줄 수는 그대로이고 사전 등록 판정, 표 수치, 그림, RQ는 바뀌지 않았다. 문장별 대응은 [D01 대응표](../../research/d01-claim-alignment.md)에 있다.
- 계획 교차 검토(claude-opus-5-5) 1차는 CHANGES REQUIRED로 Major 1(R08 재실행 범위를 고정 규칙 질의로 한정하지 않은 정정안)과 Minor 7이었다. 2차는 PASS WITH NOTES로 Minor 3(판정자 한계 구절, 이월 추론 표현, 원고에서 해시 제외)을 반영했다.
- 검증으로 #112 verify.py가 18/18 PASS였고, 흡수 직후 저장본과 전체 동일하며 수정 뒤에도 18/18이다. 그림 5의 두 분할을 격리 worktree에서 기존 생성기로 재생성하니 PNG 바이트가 동일했고 PDF는 /CreationDate만 달랐다.
- R06 사례를 calls.jsonl에서 재집계해 원고 값과 일치함을 확인했고, R03 verify는 종료 코드 0이었다.
- R05·R07은 실행하지 않았고 R09는 사용자 결정 대기 중이므로 미측정으로만 기술한다. 새 실험, API 호출, 지출은 0이다.
- #112 Ready·병합·close와 D01 Ready·병합은 이 Task 범위 밖이다. #112 종료는 D01 병합 뒤 별도 사용자 승인으로 처리한다.
- 초안은 harness-sonnet-worker(실행 모델: claude-sonnet-5-5)가 작성했고, 통합·검증·Git은 claude-opus-5-5가 맡는다.
- 구현 점검(claude-opus-5-5)은 PASS WITH NOTES였다(Blocker·Major 0). Minor 2와 Nit 3을 커밋 0ba15c4에서 고쳤다(같은 런타임 비교 한정, H3 표현 통일, 요약 192개 모집단과 판정자 계열 범위, JPEG 수락 여부, 영문 초록 구문). 남은 Minor 1은 본문이 약 1,600자 늘어난 점이며, 8면 영향은 D02 조판에서 확인한다.
- R08 재실행 0–6단계는 격리 worktree에서 모두 종료 0이었다(evidence check 통과). R02 생성물은 작성자 실행에서 24종 중 23종이 바이트 일치했다. slots-exp2-heldout.json 1종은 OCR 자료가 없어 생성하지 않았다(다운로드 금지). 이 재실행은 claude-sonnet-5-5가 맡았다. 이후 PM이 후보 코드·입력을 오프라인으로 다시 생성했다. 기존 R02 영어 OCR 자료(SHA-256 5dc5d8d6…d747)를 써서 24/24가 바이트 일치했고, 720 슬롯 원장(36ae3dec…efba12)도 Git blob·R02 기준표와 같았다.
- 프로젝트 게이트 7종(npm ci·build·test·typecheck·smoke:mcp·validate:plugin·benchmark)은 모두 종료 0이었다. 테스트는 4,562개 통과, 5개 건너뜀이다. 빌드로 생긴 bin 변경은 LF로 맞추면 커밋본과 같아 되돌렸다. Argon(gemini-4-argon)은 APPROVE, 지적 0이었다.
- PM 검토(후보 e413f58) 판정은 CHANGES REQUIRED였고 지적은 두 가지다. (1) Excel 재계산 저장이 중앙 WBS의 설정 시트 참조 드롭다운 3개(WBS F2:F300·G2:G300, Findings C2:C300)를 x14 확장으로 옮겼다. 그래서 openpyxl로 다시 저장하면 이 규칙이 사라졌다. (2) 35·188행의 Haiku 비용 문장에 비교 조건이 없었다.
- 보완: WBS는 두 시트 XML의 유효성 영역만 고쳐 세 규칙을 표준 dataValidation으로 되돌렸다. 캐시 2,001개와 셀 값은 그대로이며 openpyxl 왕복과 Excel 모두 6/6 규칙이 D01 이전과 같다. 원고 35행은 S2 대 S0(GPT-4o 9.1%, Haiku S2 > S0), 188행은 Haiku S2·S3 > S0로 비교 조건을 적었다. 수치와 판정은 그대로다.
