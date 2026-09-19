# HANDOFF

## Task 19 — 논문 우선 이미지 연구 초안과 실험 설계 (2026-09-19)

### 1. 작업 개요
- 사용자 요구: 논문 작성과 플러그인 개발 병행, 충돌하면 논문 우선. 앞선 이미지 우선·승인 후 영상 확장 방향 유지.
- 이번 전달 범위: 한국어 논문 초안, 검증된 1차 문헌 표, 이미지 실험 프로토콜과 최소 플러그인 개발 연결표, 문서 탐색/핸드오프 정리.
- 제외: 실행 코드/의존성 변경, 영상 구현, 실제 모델 실험·과금·데이터셋 업로드, 실험 결과/우월성 주장, PR merge.
- 기준: `origin/main` / `4e9b7c562b7f08fc24e79e615f68b467cbf8eeda`, 원격 fetch 후 확인. 전용 브랜치 `codex/task-19-image-paper-first`, 이 분리 worktree 사용.
- 기존 Task 18 브랜치의 HANDOFF.md 및 paired-success 미완료 소스/테스트는 보존. 미완료 Task 18을 이번 작업에 포함하지 않는다.
- 이 루트 HANDOFF가 첫 작업 문서. 이전 이력: [기존 핸드오프](docs/agent/HANDOFF.md).

### 2. 계획 / 수용 기준
- [x] 적용 지침/실제 저장소/기존 연구 상태 확인 및 Git 격리.
- [x] 별도 native `gpt-6-astra` 초기 계획 검토 PASS WITH NOTES. 현재 런타임은 UTF-8 텍스트 처리이며 이미지 backend 없음.
- [x] 1차 문헌의 제목/연도/URL/지원 주장/전이 한계 확인. 3편은 공식 초록 검색 색인만 확인한 한계 명시.
- [x] Luna 초안 작성 후 usage limit으로 중단; 지정된 대체 GPT-5.5가 3문서 보완 및 실제 완료 응답. 구현 상태·제안 방법·미측정 결과 분리.
- [x] 이미지 원본 family 분할, arm 통제, 변환 설정, fallback, 채점/실패 분모, paired 분석, 실제 usage와 bytes 구별, pilot/확증 실험 gate 정의.
- [x] 각 개발 항목을 논문 증거 요구와 연결. 영상은 후속 범위.
- [ ] 문서 링크/주장/범위 검증 및 프로젝트 gate, Draft PR, post-PR 재검증, Astra 최종 리뷰.

### 3–4. 변경 및 결정
- 논문에 필요한 연구 질문과 실험 설계를 우선 고정하고 기능 개발은 후속 사용자 승인 Task에서 수행한다.
- 기존 텍스트 연구 자료는 삭제하지 않고 별도 과거 연구로 연결. 텍스트 테스트/benchmark/mock 결과를 이미지 효과로 전용하지 않는다.
- 제출처/마감일 질문은 대기 중이며 미지정이면 한국어 연구용 Markdown 초안을 기본으로 한다.
- RED: 순수 문서 작성이므로 코드 failing test는 해당 없음. 위 수용 기준과 근거/링크 검증을 편집 전 정의했다.

### 5–6. 검증 및 오류 기록
- 격리 worktree 생성 첫 시도는 ref lock 권한 오류; 동일 명령의 승인된 escalation으로 성공.
- 초기 targeted baseline `npm.cmd test -- --run tests/research-dataset.test.ts`: 30 PASS / 9 skipped / suite FAIL. 격리 worktree에 local node_modules/typescript/bin/tsc가 없어 CLI suite 준비 실패. 원본 코드 오류로 단정하지 않는다. lockfile 기반 의존성 설치 후 재실행 예정.
- `npm.cmd ci --ignore-scripts`로 lockfile 의존성 설치 후 동일 targeted baseline 39/39 PASS. 코드/lockfile 변경 없음. 초기 실패 원인 확인 및 환경 복구 완료. 문서/프로젝트 최종 결과는 후속 기록한다.

### 7. 교차 검토
- Astra: 실제 native `gpt-6-astra` 호출 및 응답 확인. 초기 범위 검토 PASS WITH NOTES; 외부 제공자 리뷰가 아님.
- Claude Opus 5: 초기 비민감 계획 검토를 정확한 `claude-opus-5`로 요청했으나 조직이 Claude Code 구독 접근을 비활성화했다는 오류로 실패. 실제 모델 사용 목록은 비어 있음; 다른 버전/API 키/유료 접근으로 대체하지 않음. 첫 CLI 시도는 variadic MCP 옵션이 prompt를 소비하여 모델 호출 전 실패했고 인자 경계를 수정하여 위 접근 오류를 확인.
- Gemini: launcher 있음, GEMINI_API_KEY/GOOGLE_API_KEY 환경값 존재 여부만 확인하여 둘 다 없음. 무료 API 모델/quota 미확립으로 검토 미수행; 유료 fallback 없음.
- Copilot: launcher 실행 결과 `Cannot find GitHub Copilot CLI`; 검토 미수행.
- 민감 정보/전체 저장소/전역 설정을 외부 검토에 보내지 않는다.

### 8. 자체 리뷰 / 위험
- 위험: 개발 완성도를 논문 결과로 오인, 이미지 미지원 기능의 구현 주장, 데이터 누수, 변환 비용 누락, 영상 범위 혼입.
- 보완: 독립 문헌 검증과 Astra 실제 산출물 리뷰, 원본/source-family/usage 추적을 실험 설계에 포함.

### 9–11. 현재 상태 / 승인 / 다음 작업
- 현재 상태: 진행 중. 실제 결과 표는 작성하지 않는다.
- 다음 실제 플러그인 구현 Task와 모든 merge는 사용자 승인 전 착수하지 않는다.
- 최종 Git/PR/검증/미해결 검토 공백은 완료 시 갱신한다.

- 초기 Cross-check status: DEGRADED. 별도 Astra 검토로 보완하며 외부 제공자 성공으로 계산하지 않음.

### 중간 검증 및 문헌 기록
- 2026-09-19 pre-PR: `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS; `npm.cmd test` 570 PASS / 11 files; `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark` 모두 PASS.
- 기존 text benchmark 3 scenarios x 20 samples 통과. 이미지/hosted 실험은 NOT RUN, 이번 Task 범위 밖이며 아직 구현되지 않음.
- native Luna (`gpt-5.6-luna`, worker) 문서 작성 중. 별도 Astra 방법론 검토: 36개 family를 paired 분석 단위로 유지, guard contrast D-C, oracle 누수 차단, assigned-source 동일성, 실패/미실행 구분 권고를 전달.
- 문헌 6편: ChartQA/ScreenQA ACL 공식 초록과 MetaCompress arXiv:2603.21701v1 초록은 직접 접근. DocVQA/TextVQA/QuietPrune은 공식 CVF 초록의 검색 색인만 확인; CVF 직접 열람403으로 전체 본문 열람을 주장하지 않음. 연구자가 최초 요약에서 접근 방식을 충분히 구분하지 않아 재질의하고 문헌 표에 정정하도록 전달.
- 기존 본문 보존, 현재 README와 옛 paper/protocol 상단에 연구 방향 변경 및 과거 텍스트 연구 구분 표시.

### 재개 기록 (2026-09-19 22:13 KST)
- 사용자 재개 지시에 따라 같은 Task 19 / 브랜치 / worktree에서 계속한다. 새 Task나 중복 PR을 만들지 않는다.
- Luna 첫 작성이 usage limit으로 중단됐으나 3개 초안 파일은 보존돼 있다. 지정된 대체 모델 `gpt-5.5` worker에 이 3개 문서만 소유권을 부여하고 국소 일관성 수정/검증을 요청했다. 실제 완료 여부는 응답과 diff로 확인한다.
- 재개 targeted 검사 `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS.
- 마일스톤 외부 검토: 정확한 `claude-opus-5` 비민감 요약 검토를 다시 시도했으나 조직 구독 접근 비활성 오류, models=[]로 실제 모델 호출 미수행. Gemini 키 환경 부재 및 무료 API 미확립, Copilot launcher CLI unavailable을 재확인. Cross-check status: DEGRADED 유지.
- 빌드가 만든 bundle의 Git 정규화 diff가 없음(exit 0)을 확인하고 해당 파일만 원래 worktree 표현으로 복구했다. 문서만 전달하며 원본 Task 18 변경은 그대로 보존한다.

### 마일스톤 내용 검토와 수정
- GPT-5.5 worker 실제 완료 응답과 3개 문서 원문을 직접 확인. 범위 내 변환 순서·oracle 접근·D-C 대비·문헌 접근 방식 수정 완료.
- Astra 첫 마일스톤 판정 CHANGES REQUIRED: major 1건(clean pixels 전면 금지가 clean 조건과 충돌), minor 1건(retry를 별도 slot으로 표현해 primary 분모 모호), minor 1건(핸드오프 상태 갱신 필요).
- 동일 승인 범위에서 주 에이전트가 국소 수정: clean 조건에는 배정된 clean 입력 허용; 손상 조건의 비배정 clean counterpart는 숨김; full original/fallback은 배정된 variant로 정의. retry는 보조 attempt이며 비용/호출 수에만 추가하고 primary 720/production576 분모 및 원래 실패 판정 유지.
- 8문서 strict UTF-8/코드 fence/local link 검증 및 staged diff 검사 PASS. 원격 문헌 전체 본문 또는 실험 재현을 검증했다고 주장하지 않음.
- Astra 수정 재검토: 내용 판정 PASS WITH NOTES, 미해결 blocker/major 없음. 외부 검토 DEGRADED, 초록 수준 출처 확인, 모든 이미지 기능/결과 미구현·미측정이라는 제한 유지. Draft PR/post-PR 및 최종 transport gate는 아직 진행 예정.
