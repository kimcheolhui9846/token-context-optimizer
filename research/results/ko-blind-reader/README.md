# ko-blind-reader 공개 결과

한국어 표 1인 눈가림 판독 파일럿(Phase A, Tier E)의 공개 증거다. 프로토콜은 `research/plans/2026-11-25-ko-blind-reader-protocol.md`, 등록값은 `research/tools/ko-blind-reader/registered.json`이다.

| 경로 | 내용 |
|---|---|
| `logs/red-before-impl.txt` | 등록 커밋에서 구현 전 시험이 실패한 기록 |
| `logs/red-scorer-milestone.txt` | Opus 마일스톤 검토(130be80) 반영 전 채점기 시험이 실패한 기록 |
| `gate/gate.json` | 이전 기하·픽셀 관문: #153 예측 144/144, #154 W1·W4·W5 각 144/144, coords 바이트 일치 |
| `mock/` | **공개 모의 시드(mock)** 전체 실행: 생성·렌더·OCR·예측·세 방식 빌드 기록, 모의 판독지 `packet/start.html`, 모의 키, QA, 모의 약속값(`commitments.json`, 등록된 공개 모의 시드에서 만든 공개 salt)과 답 없는 패킷 기록(`admin/packet-record.json`), 합성 응답 4종(정상·혼합·중단·관찰자료 열람 표시 yes)의 고정·채점·재계산, 표준 출력 누출 검사(`mock-run.json`, `stdout.jsonl`), `SHA256SUMS` |
| `mock-browser/` | 모의 판독지 실브라우저 시험 기록과 그때 내려받은 중간 저장·최종 응답, 채점·재계산 |
| `real-commitments.json` | 실제 시드·배정·판독지·키의 salt(256비트) 약속값만. 실제 자료는 로컬 관리자 폴더에만 있다 |

모의 결과는 실제 판독지·정답·점수와 무관하다. 실제 응답은 이 저장소에 들어오지 않는다.

## 채점기 무결성 범위

| 검사 | 해시 범위 |
|---|---|
| `packetFile.sha256` | 고정 `packet/start.html`의 **파일 원시 바이트** SHA-256(독자 판독지와 같은 바이트) |
| `packetHash` | 판독지 안 payload `{format, packetId, practice, items}`의 **정규 JSON** SHA-256(공개 규칙) |
| `kbr-packet`·`kbr-key` 약속값 | SHA-256(salt ‖ 라벨 ‖ 0x00 ‖ **파일 원시 바이트**), 출처는 공개 커밋 `9371820`의 `real-commitments.json` |
| 응답 `responseSha256` | 고정된 응답 파일의 원시 바이트 |
| 응답 `digest` | `digest`를 뺀 응답의 정규 JSON. 우발적 손상을 찾는 **자체 일관성 검사**일 뿐이며 누구나 다시 계산할 수 있어 위·변조 증거가 아니다 |

채점 순서: 패킷 기록·고정 판독지·`kbr-packet` 확인 → 응답 검증(키 없이) → 처음 통과한 응답을 no-clobber로 고정 → `kbr-key` 확인과 키 구조 검사 → 채점. 같은 파일을 다시 넣으면 같은 결과를 복구하고, 다른 응답은 `lock_different`로 거부한다.

## LF/CRLF 체크아웃과 원시 해시

`ocr/guard-summary.json`의 `researchLockSha256`은 체크아웃된 `research/package-lock.json`의 **원시 바이트** 해시다. 고정 blob `6b103b97`은 LF로 저장되어 있어 `core.autocrlf=false` 체크아웃은 LF `df4a66b3…6fe1e`(등록 핀), `core.autocrlf=true` 체크아웃은 CRLF `863462f3…0f7534`를 기록한다. 커밋된 모의 증거는 CRLF 체크아웃에서 만들었다. `researchLockBlob`(줄 끝과 무관한 Git blob id)은 두 경우 같다.

`src/ko-blind-reader-repro.mjs`는 `mock/SHA256SUMS`의 모든 파일을 해시로 비교한다. 예외는 둘뿐이다: `stdout.jsonl`(실행 기계의 절대 경로, 개수만 셈)과 위 필드(고정 blob에서 다시 계산한 LF·CRLF 값 중 하나여야 하고 다른 필드는 모두 같아야 함). 출력의 `code`는 `lock_<기대 쪽>_<재현 쪽>_checkout_<현재 체크아웃>`으로 양쪽의 원시 출처를 숨기지 않고 보이며, 재현 쪽이 현재 체크아웃의 원시 바이트와 맞지 않으면 실패한다.

## 재현 (research/에서)

```
git fetch origin pull/147/head pull/150/head pull/151/head pull/152/head pull/153/head pull/154/head
npm ci --ignore-scripts
# .cache/ko-ocr-factorial/{eng,kor}.traineddata: registered.json fixed.ocr.langFiles의 크기·SHA-256
node --test "test/**/*.test.mjs"                                    # research 전체
KBR_FONT=C:/Windows/Fonts/NotoSansKR-VF.ttf python -m unittest discover -s tools/ko-blind-reader -p test_generate.py
node src/ko-blind-reader-pipeline.mjs gate --out <새 폴더>            # gate/gate.json과 바이트 동일
node src/ko-blind-reader-run.mjs mock --work <새 폴더>
node src/ko-blind-reader-repro.mjs --expected results/ko-blind-reader/mock --work <새 폴더>   # ok:true
```
