# ko-blind-reader 공개 결과

한국어 표 1인 눈가림 판독 파일럿(Phase A, Tier E)의 공개 증거다. 프로토콜은 `research/plans/2026-11-25-ko-blind-reader-protocol.md`, 등록값은 `research/tools/ko-blind-reader/registered.json`이다.

| 경로 | 내용 |
|---|---|
| `logs/red-before-impl.txt` | 등록 커밋에서 구현 전 시험이 실패한 기록 |
| `gate/gate.json` | 이전 기하·픽셀 관문: #153 예측 144/144, #154 W1·W4·W5 각 144/144, coords 바이트 일치 |
| `mock/` | **공개 모의 시드(mock)** 전체 실행: 생성·렌더·OCR·예측·세 방식 빌드 기록, 모의 판독지 `packet/start.html`, 모의 키, QA, 합성 응답 3종의 고정·채점·재계산, 표준 출력 누출 검사(`mock-run.json`, `stdout.jsonl`), `SHA256SUMS` |
| `mock-browser/` | 모의 판독지 실브라우저 시험 기록과 그때 내려받은 중간 저장·최종 응답, 채점·재계산 |
| `real-commitments.json` | 실제 시드·배정·판독지·키의 salt(256비트) 약속값만. 실제 자료는 로컬 관리자 폴더에만 있다 |

모의 결과는 실제 판독지·정답·점수와 무관하다. 실제 응답은 이 저장소에 들어오지 않는다.

## 재현 (research/에서)

```
git fetch origin pull/147/head pull/150/head pull/151/head pull/152/head pull/153/head pull/154/head
npm ci --ignore-scripts
# .cache/ko-ocr-factorial/{eng,kor}.traineddata: registered.json fixed.ocr.langFiles의 크기·SHA-256
node --test test/ko-blind-reader.test.mjs
KBR_FONT=C:/Windows/Fonts/NotoSansKR-VF.ttf python -m unittest discover -s tools/ko-blind-reader -p test_generate.py
node src/ko-blind-reader-pipeline.mjs gate --out <새 폴더>            # gate/gate.json과 바이트 동일
node src/ko-blind-reader-run.mjs mock --work <새 폴더>                 # mock/SHA256SUMS의 파일과 동일(stdout.jsonl은 경로 포함이라 제외)
```
