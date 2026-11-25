# 인계 · 한국어 표 1인 눈가림 판독 파일럿 (Phase A)

- 과제: Orca task_a2eeb4541f2c, Tier E. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`, 브랜치 `claude/ko-blind-reader-pilot`, Draft PR #155.
- 프로토콜: `research/plans/2026-11-25-ko-blind-reader-protocol.md`, 등록값 `research/tools/ko-blind-reader/registered.json`.
- 상태: **실제 판독지 준비 완료.** 실제 응답 0건, 미측정. 독자 판독지 `D:/orca/participant-packets/ko-blind-reader-pilot/start.html`, 관리자 폴더 `D:/orca/local-research-admin/ko-blind-reader-pilot/`(실행 전 두 폴더 모두 없었다).

## 진행 기록

| 단계 | 상태 | 근거 |
|---|---|---|
| 등록(프로토콜·등록값·RED 시험·인계서) | 완료 | `ec43ea4` |
| RED 기록 | 완료 | `430a5e9`, `research/results/ko-blind-reader/logs/red-before-impl.txt` |
| 구현·GREEN | 완료 | JS 22/22, Python 14/14 |
| 모의 전체 실행 | 완료 | `results/ko-blind-reader/mock/` (`mock-run.json` pass, stdout 15줄 누출 0·출력 정책 위반 0) |
| 실브라우저(모의 판독지) | 완료 | `results/ko-blind-reader/mock-browser/browser-test.json` |
| 관문 144/144 | 완료 | `results/ko-blind-reader/gate/gate.json` (예측 144, W1·W4·W5 144, coords 바이트 일치) |
| 실제 시드·배정 약속값 | 완료 | `fe490e4` (OCR 전 push), 계획 검사 0건 |
| 실제 생성·QA·판독지·키 약속값 | 완료 | `9371820`: OCR 18/18행·기술 오류 0·오프라인 가드 차단 0, QA 통과(방식 PNG 54장 형식·크기·독립 재조립 픽셀 일치, 누출 0), 판독지 템플릿 부분이 모의 판독지와 바이트 동일, 독자 폴더 파일 1개·SHA-256 일치, 약속값 4/4 로컬 재계산 일치 |
| 새 클론 재현·연구·제품 검증 | 완료 | 원격 새 클론(`8f11e90`): JS 23/23, Python 14/14, gate.json 바이트 동일, 모의 증거 37/37 SHA-256 일치. 제품 `npm ci`·build·test(4639 통과, 5 건너뜀)·typecheck·smoke:mcp·validate:plugin·benchmark 모두 종료 코드 0. build가 줄 끝만 바꾼 `bin/token-context-optimizer.mjs`는 빌드 전 깨끗했으므로 그 파일만 되돌림 |

## 구성

- `research/src/ko-blind-reader-lib.mjs`: 정규화, 정규 JSON, 순수 SHA-256, 판독지 상태 기계(판독지에 소스 그대로 삽입), 응답 검증·채점·점수표, 순서·균형 검사, 누출 검사, 출력 제한(`safeLine`), 약속값.
- `research/src/ko-blind-reader-fixed.mjs`: #153·#154 고정 blob을 Git 객체에서 읽어 blob id·SHA-256 대조 뒤 캐시에서 import.
- `research/src/ko-blind-reader-pipeline.mjs`: gate / render / ocr(#153 OCR 함수 3개 소스 동일성 검사, 오프라인 가드 필수) / predict / build / packet / qa / commit / install-admin / reader-verify.
- `research/src/ko-blind-reader-run.mjs`: `mock`, `real-prepare`(시드·생성·배정 약속값, OCR 전), `real-finish`(OCR→판독지→QA→독자 폴더→채점기 설치→판독지·키 약속값).
- `research/src/ko-blind-reader-score.mjs`: 관리자 폴더용 채점기(제출 고정). `research/tools/ko-blind-reader/recount.py`: 독립 재계산.
- `research/tools/ko-blind-reader/generate.py`(생성), `reader.html`(판독지 템플릿).

## 등록 뒤 바뀐 점 (의미 변화 없음, 기술 수정)

1. **등록 시험 값 정정:** 상태 기계 시험의 중단 뒤 미도달 수 `16` → `17`. 등록 규칙(현재 문항과 이후 문항은 notReached)과 같은 시험 파일의 채점 시험(17)이 모두 17이고, 16은 규칙 문구를 고치기 전 값이었다.
2. **판독지 PNG:** 고정 #154 인코더 출력에는 `pHYs` 청크가 있다. 등록 QA(판독지 데이터 URI는 IHDR/IDAT/IEND만)를 지키려고 판독지에 넣을 때만 임계 청크만 남긴다(픽셀·IDAT 바이트 동일). 빌드 산출물 QA는 `pHYs`만 허용하고 text/time/exif 등은 거부한다.
3. **누출 검사 정규식:** `URL.createObjectURL(`을 CSS `url(`로 오탐해 `\burl\(`로 좁혔다. 시험 추가.
4. **카나리:** 등록된 연습 문항 상수(값 11:40 등)는 템플릿·페이로드의 공개 고정 문자열이라 카나리에서 뺐다. 템플릿 부분은 모의 판독지와 바이트 동일성을 따로 검사한다.
5. **보조 지표 `unknownAny`(열 또는 값 판단 불가)** 를 JS 점수·점수표·재계산에 넣었다(프로토콜 6.2 보조 지표).
6. **새 클론 재현에서 발견:** autocrlf 체크아웃의 `src/*.mjs` CRLF가 판독지에 삽입되는 함수 소스에 섞여 클론의 모의 판독지가 달랐다. 삽입 소스를 LF로 정규화하고 시험을 추가했다(`8f11e90`). 실제 판독지는 LF 원본으로 만들어졌고 템플릿 부분이 모의 판독지와 바이트 동일하다(재생성 없음).
7. 실브라우저 시험은 Playwright MCP가 `file:` URL을 막아 모의 판독지 폴더만 127.0.0.1로 내보내 열었다. 페이지 자체의 네트워크 요청은 문서 로드 외 0건.

## 비밀 처리

- 실제 시드·배정·문항·정답·이미지·키·점수는 Git·채팅·PR에 없다. 공개 증거는 256비트 salt 약속값(`results/ko-blind-reader/real-commitments.json`)뿐이다.
- 실제 단계 출력은 개수·통과 여부·SHA-256만이다. 하위 프로세스 출력은 관리자 폴더 로그에만 둔다.

## 제한점

- 독자 1명, 방식마다 6문항. 건수만 보고하며 유의성·일반화·W5 채택 판정은 없다. 독자는 방법을 아는 운영자다.
- 실제 판독지는 입력·노출 없이 구조만 확인했다(템플릿 부분 바이트 동일, 페이로드 18문항·해시, 누출 검사). 대화형 시험은 모의 판독지에서만 했다.
- 실제 단계 출력 중 방식 출력 PNG 수(54)가 드러났다. 세 방식에 공통인 상위 결과(미표시 0)이며 방식별 적용 수·가시성은 아니다.
- 연습 문항 값(11:40 등)은 생성 범위 안의 등록 상수라 실제 문항 값과 우연히 같을 수 있다(공개 고정 문자열, 정답 단서 아님).
