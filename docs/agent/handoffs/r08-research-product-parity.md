# R08 연구 버전과 최신 제품의 결정적 비교

- Tier E. 2026-11-22 사용자 착수 승인. 기준 main `c201b69cd606838f371049df1b3d8f85481be825`, 브랜치 `claude/r08-research-product-parity`, Draft PR #136.
- 결과 문서: [docs/research/r08-research-product-parity.md](../../research/r08-research-product-parity.md). 근거: [research/results/r08-parity/](../../../research/results/r08-parity/).
- 새 모델 호출 0건, 지출 US$0. 제품 코드, 기존 실험 결과, 논문 본문, 의존성은 바꾸지 않았다. 검증용 설치는 이 worktree에서 기존 잠금 파일로만 했다.

## 결과

- **번들 4종:** exp3 `30b76db8…`, pre002 `1267f3de…`, post002 `98c707da…`, latest `6265b9b4…`. 모두 `git cat-file blob`으로 꺼낸 원시 바이트이며 PM 선확인 값과 같다. 재빌드한 latest 번들의 원시 바이트는 추적 blob과 같다.
- **텍스트(`query_artifact`, 실험 3 로그 문항 297키, 채점 231):**
  - 번들마다 2회 새 프로세스로 돌렸고, 키별 정규화 해시가 297/297 같았다.
  - exp3 → latest는 286키가 같고 첫 발췌는 297키 모두 같다. 다른 11키는 entity 동점 질의이며, 두 번째 동점 발췌가 추가됐다(Task 39 변경).
  - 저장된 excerpt-bench-001·002 행 297개는 재실행과 값 불일치가 0이다.
  - held-out entity의 hit 20/24와 hitAny 24/24는 서로 다른 지표다. 최신 제품의 첫 발췌 기준은 여전히 20/24다.
- **JPEG(실험 2):**
  - 해시가 일치한 458개(648슬롯)는 최신 진입점의 기본 strict에서 458/458 거부된다(`unsupported_jpeg_profile`).
  - 같은 458개가 tolerant opt-in에서는 458/458 통과하고, APP0만 넣은 대조는 strict에서 458/458 통과한다.
  - 2026-11-02 기록과 파일별 11열이 458/458 같다. 진입점 결과와 내부 validator 결과도 458/458 일치한다. 기존 fixture 63개도 63/63 일치한다.
  - D 재요청 중 JPEG 13건(GPT-4o 5, Haiku 8)은 모두 같은 해시 집합 안에 있다.
  - RQ1 7개는 원본이 없어 설정 대조만 했고, 분모에서 뺐다.
- **판단:** 제품 수정이 필요한 발견은 없다. 연구 경로 JPEG를 제품에 넣으려면 tolerant opt-in이 필요하다는 점을 D01·재현 패키지에 적으면 된다. 연구 시점의 Node 버전은 미상이다. 결과는 Node v24.18.0 / win32-x64 한 환경에서 같은 조건으로 비교한 것이다.

## 추가한 코드

- `research/src/r08-excerpt-capture.mjs`, `r08-excerpt-parity.mjs`: 원시 응답 수집과 키 조인 비교.
- `research/src/r08-jpeg-entry.mjs`, `r08-jpeg-parity.mjs`: 제품 진입점 호출과 validator·과거 기록 대조.
- `research/src/r08-parity-config.mjs`(설정·커밋 기준 파일 생성), `r08-evidence.mjs`(근거 폴더 생성).
- 테스트 `research/test/r08-*.test.mjs`(29개).
- 종료 코드:
  - 1: 구조 실패. 중복·누락·초과 키, 번들·로그·슬롯 해시 불일치, 수집–벤치 불일치, 캡처 재사용, 반복 ID가 [1, 2]가 아님, 저장 행 대조 역할 부재·미조인 행
  - 2: 검토가 필요한 항목이 있음(보류 키, 저장 행 불일치, 미재현, 열 차이, 진입점 불일치)

## 검토와 검증

- 분담:
  - 초안: harness-sonnet-worker(실행 모델 `claude-sonnet-5-5`)가 근거 폴더 README를 썼다. 작성자가 수치를 원자료와 대조했고, 추출 방식과 해시 기준 두 문장을 보탰다.
  - Argon(`gemini-4-argon`): b239363을 대상으로 REQUEST CHANGES를 냈다. Major 1은 검토 필요 항목에도 종료 코드가 0이라는 지적이다. Minor 2는 저장 행의 단방향 비교와 JPEG 열의 비교 범위다. 세 지적을 모두 직접 확인한 뒤 채택했다.
  - 독립 검토 `claude-opus-5-5`: 1차 판정은 CHANGES REQUIRED였다.
    - Major 1: 위 Argon 지적과 같은 내용에 진입점 메타 대조와 반복 재사용 감지를 더했다.
    - Minor 5: 핸드오프 누락, 001 시점 번들, 열 범위, 게이트 증거의 head와 종료 코드, 폐기한 첫 진입점 실행.
    - Nit 2.
    - 수치 대조는 모두 PASS였다. 지적은 `fix(review)` 커밋 5490001에서 고쳤다.
  - 재점검(`claude-opus-5-5`, head 5490001): **PASS WITH NOTES**. 지적 1·3·4·5·6과 Nit 7·8을 해소했다. 지적 2는 이 문서를 커밋해 해소했다.
  - 새 Nit 3건(테스트 개수 22→24, JPEG 비교기의 종료 1 목록 설명, `--dist`가 없을 때 fixture 대조가 실제로 수행되지 않는 문제)은 마지막 커밋에서 고쳤다. `--dist`는 이제 필수 인자다.
  - Note: exp3 참고 역할은 호출 누락·중복이 있어도 실패로 잡지 않는다. 참고 행이므로 그대로 둔다.
  - Nit 수정 뒤 연구 테스트 73/73을 다시 확인했다. JPEG 비교기를 다시 실행한 결과(종료 0)는 v4 보고서와 같았다.
- 프로젝트 게이트(작성자 환경, head `549000157c4141eba38cd43d386f43a7a97935e7`, 시작 시 작업 트리 깨끗). 그 뒤 커밋은 연구 비교기의 인자 검사·주석과 문서만 바꿨고 제품 코드는 그대로다:
  - npm ci 0, build 0, test 0(58파일, 4,562 통과·5 건너뜀·실패 0), typecheck 0, smoke:mcp 0, validate:plugin 0, benchmark 0(`dirty: false`, passed).
  - 연구 테스트 4파일 73/73 통과.
  - 이번에는 타이밍 의존 실패(image-source-race)가 나오지 않았다. R06 때 기록된 기준선 실패와는 별개의 실행 결과다.
- 빌드는 `bin/` 작업 사본을 CRLF로 다시 써서 수정됨으로 표시한다. 원시 SHA-256이 추적 blob과 같아 그 파일만 되돌렸다.

## PM 최종 대조(ba924a0) 후 정정

- PM 판정 CHANGES REQUIRED(Major 2, Minor 1). 지적은 다음 세 가지였다.
  - 반복 ID [1,1]과 존재하지 않는 저장 행 대조 역할이 통과한다.
  - §5의 설정 파일을 만드는 방법이 없다.
  - 표현이 실제 비교 기준과 맞지 않는다(`layout` 제외 기준, 231/297 분모).
- 정정 커밋: 5942b25(비교기·설정/근거 스크립트·문서), ff6f949(새 checkout 근거), 그 뒤 재점검 Minor 반영 커밋.
- 반복 ID는 계획값 [1, 2]로 고정했다. 저장 행 대조는 역할 존재와 `joinedRows`(분모) = 저장 행 수를 요구한다.
- 정상 실험 영향 대조: 기존 실행 자료에 새 비교기를 적용하면 v4 보고서와 `joinedRows` 297 ×4만 다르다.
- 새 checkout 재실행
  - 문서 §5 코드 블록을 그대로 추출해 5942b25의 새 detached worktree와 빈 scratch에서 실행했다. 0이 아닌 종료는 없었고, 두 비교기 모두 failures·attention이 0건이다.
  - 6단계 출력을 커밋된 근거로 바꿨다(ff6f949).
  - 직전 커밋본과 비교하면 키별 근거는 바이트가 같다. 요약은 schema, `joinedRows`, 진입점 파일 이름, 절대 경로가 든 원시 캡처 해시만 다르다.
- 재점검(`claude-opus-5-5`, ba924a0..ff6f949): **PASS WITH NOTES**.
  - PM 지적 3건 해소. 커밋된 근거와 새 checkout 출력이 바이트 단위로 같음을 확인했다.
  - 새 Minor 1건(설정 `reps`를 손으로 바꾸면 우회됨)은 마지막 커밋에서 고쳤다. `reps`를 [1, 2]로 고정하고 다른 값은 실패로 처리한다.
  - Note: research 잠금 파일 설치 시 audit high 1건은 기존 잠금 파일에서 나온 것이다.
- **게이트 결과 구분**
  - PM 실행(ba924a0, 기본 `npm test`): `policy-redos-group3.test.ts` 2건이 5초 제한을 넘어 실패했다(4,560 통과·2 실패·5 건너뜀).
  - 작성자 실행(ff6f949, 기본 제한시간 그대로): 7개 게이트 모두 종료 0이고 4,562 통과·5 건너뜀·실패 0, 연구 테스트 76/76이다.
  - 작성자 최종 실행(68adab9, 기본 제한시간 그대로, 시작·끝 작업 트리 깨끗): npm ci 0, build 0(재빌드 번들 원시 SHA-256 `6265b9b4…`), test 0(58파일, 4,562 통과·5 건너뜀·실패 0), typecheck 0, smoke:mcp 0, validate:plugin 0, benchmark 0(dirty false, passed), 연구 테스트 4파일 78/78이다. 이 커밋 뒤에는 이 핸드오프 문서만 바뀌었다.
  - c201b69 이후 `src`·`tests` 변경은 0이다. 해당 실패는 R08과 무관한 타이밍 변동으로 보이며, 원인은 확인하지 못했다. 시간 제한은 바꾸지 않았다.

## 다음

- PM 최종 검토. Ready, merge, 다음 Task 착수는 사용자 승인 단계다.
- 원시 응답, 번들, 이미지, 게이트 로그는 작성자 로컬 scratch에만 있다. 그 SHA-256은 요약 JSON의 `rawSha256`에 있다.
