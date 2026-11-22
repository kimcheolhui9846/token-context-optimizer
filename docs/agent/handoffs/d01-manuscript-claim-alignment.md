# D01 최신 원고·그림·표 주장 정합성

- Tier E. 기준 main 927a5639(R08 병합)이다. 원고 출발점은 Draft #112 고정 head e1e5351이며, 공통 조상 5d668f9 이후 main은 #112의 11개 경로를 바꾸지 않았다.
- 첫 커밋 58d13f3은 #112의 11개 경로를 수정 없이 흡수했고 인덱스 blob이 11/11 일치한다. 네 그림 파일의 Git 속성은 text·filter 미지정이며 PDF만 diff=astextplain이다.
- 공개 전 점검에서 텍스트 diff, PDF 메타데이터, PNG 텍스트 청크, 두 분할 PNG 화면 모두 비공개 정보가 0건이었다.
- 두 번째 커밋 502370f는 원고 행 7·13(두 초록), 23·25(제품 도구 설명), 35(C4), 63(overview 비호환), 69(JPEG 648슬롯/458 고유, strict 거부·tolerant 통과, RQ1 7 별도), 130, 148(표 3 캡션), 166, 180(R03 요약 감사·R04 한계), 182(R06 캐시 이월 관측과 추론), 184(R08 231/231·20/24·24/24), 188(결론)을 수정했다.
- 줄 수는 그대로이고 사전 등록 판정, 표 수치, 그림, RQ는 바뀌지 않았다. 문장별 대응은 [D01 대응표](../../research/d01-claim-alignment.md)에 있다.
- 계획 교차 검토(claude-opus-5-5) 1차는 CHANGES REQUIRED로 Major 1(R08 재실행 범위를 고정 규칙 질의로 한정하지 않은 정정안)과 Minor 7이었다. 2차는 PASS WITH NOTES로 Minor 3(판정자 한계 구절, 이월 추론 표현, 원고에서 해시 제외)을 반영했다.
- 검증으로 #112 verify.py가 18/18 PASS였고, 흡수 직후 저장본과 전체 동일하며 수정 뒤에도 18/18이다. 그림 5의 두 분할을 격리 worktree에서 기존 생성기로 재생성하니 PNG 바이트가 동일했고 PDF는 /CreationDate만 달랐다.
- R06 사례를 calls.jsonl에서 재집계해 원고 값과 일치함을 확인했고, R03 verify는 종료 코드 0이었다.
- R05·R07은 실행하지 않았고 R09는 사용자 결정 대기 중이므로 미측정으로만 기술한다. 새 실험, API 호출, 지출은 0이다.
- #112 Ready·병합·close와 D01 Ready·병합은 이 Task 범위 밖이다. #112 종료는 D01 병합 뒤 별도 사용자 승인으로 처리한다.
- 초안은 harness-sonnet-worker(실행 모델: claude-sonnet-5-5)가 작성했고, 통합·검증·Git은 claude-opus-5-5가 맡는다.
- 구현 점검(claude-opus-5-5)은 PASS WITH NOTES였다(Blocker·Major 0). Minor 2와 Nit 3을 커밋 0ba15c4에서 고쳤다(같은 런타임 비교 한정, H3 표현 통일, 요약 192개 모집단과 판정자 계열 범위, JPEG 수락 여부, 영문 초록 구문). 남은 Minor 1은 본문이 약 1,600자 늘어난 점이며, 8면 영향은 D02 조판에서 확인한다.
- R08 재실행 0–6단계는 격리 worktree에서 모두 종료 0이었다(evidence check 통과). R02 생성물 24개 중 23개가 바이트 일치했다. slots-exp2-heldout.json 1개는 OCR 자료가 없어 생성하지 않았다(다운로드 금지). 이 재실행은 claude-sonnet-5-5가 맡았다.
- 프로젝트 게이트 7종(npm ci·build·test·typecheck·smoke:mcp·validate:plugin·benchmark)은 모두 종료 0이었다. 테스트는 4,562개 통과, 5개 건너뜀이다. 빌드로 생긴 bin 변경은 LF로 맞추면 커밋본과 같아 되돌렸다. Argon(gemini-4-argon)은 APPROVE, 지적 0이었다.
