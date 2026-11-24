# ko-anchor-diagnostic — 재현 안내

프로토콜: `research/plans/2026-11-24-ko-anchor-diagnostic-protocol.md`. 결과 해석: `RESULTS.md`.

## 파일

| 파일 | 내용 |
|---|---|
| `sources.json` | 여섯 원본의 고정 커밋·경로·blob·SHA-256·바이트 수, 선택기 blob |
| `replay.jsonl` | 96행. 실제 `selectWindow` 재생 결과와 저장 기록의 대조(`ok`, `mismatches`, `keys`, `matched`, `axisRow`, `band`) |
| `collect.jsonl` | 96행. 블라인드 수집: 질문 두 음절 목록 Q, OCR 단어 수, 한글 단어 수, 두 음절이 있는 단어(줄·단어 번호, O, box, 중심), 입력 투영 SHA-256. OCR 원문은 복제하지 않는다 |
| `pinned.json` | 채점 전에 고정한 `replay.jsonl`·`collect.jsonl` 파일 바이트 SHA-256 |
| `score.jsonl` | 24행(자료별 KO/nl 12). T, S, 분류, 안/밖 단어 수, 범용 질문 표현 겹침, 기준 키 수, 원문 대조 |
| `summary.json` | 자료별·합계 집계 |

모든 파일은 LF 텍스트이며 해시는 원시 파일 바이트 기준이다(`.gitattributes`).

## 재현 (클린 클론)

```sh
git clone https://github.com/kimcheolhui9846/token-context-optimizer.git && cd token-context-optimizer
git fetch origin pull/145/head            # FCP 원본 커밋 708d994… 객체를 얻는다
git cat-file -t 708d9946ae091180a1b716baadfdd73fcfe5a19b                                            # commit
git rev-parse 708d9946ae091180a1b716baadfdd73fcfe5a19b:research/results/fresh-crop-padding/run-a/caller.jsonl   # d657d59d…
git rev-parse 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1:research/results/r09-bilingual/heldout/run-a/raw.jsonl    # 876cdbb9…
cd research && npm ci --ignore-scripts    # 선택기 모듈의 import 의존성(sharp, tesseract.js). OCR은 실행하지 않는다
```

측정(오프라인 가드 필수, 출력 폴더는 새 경로여야 한다):

```sh
NODE_OPTIONS="--require=$(pwd)/tools/d03/guard/node-netguard.cjs" node src/ko-anchor-diagnostic.mjs --out <새 폴더>
NODE_OPTIONS="--require=$(pwd)/tools/d03/guard/node-netguard.cjs" node src/ko-anchor-diagnostic.mjs --verify results/ko-anchor-diagnostic
```

Windows Git Bash에서는 가드 경로를 `$(cd tools/d03/guard && pwd -W)/node-netguard.cjs`처럼 드라이브 경로로 준다. `--verify`는 모든 출력 파일을 다시 계산해 바이트 단위로 비교하고, 다르면 종료 코드 1이다. 중단 규칙에 걸리면 `stop.json`만 쓰고 종료 코드 2다.

독립 검산과 시험:

```sh
python tools/ko-anchor-diagnostic/recount.py --results results/ko-anchor-diagnostic --repo ..
python -m unittest discover -s tools/ko-anchor-diagnostic -p "test_recount.py"
node --test test/ko-anchor-diagnostic.test.mjs
```

## 이번 실행 기록

- 2026-11-24, Windows 11, Node v24.18.0, Python 3.12.10. 코드 커밋 `66c9a25`.
- 새 폴더 두 곳에 실행: 6개 파일 모두 바이트 동일. 오프라인 가드 로그: 가드 적재 2회, 차단 0회.
- `pinned.json`: `replay.jsonl` `9510835d4120cf181e3b879bf965446f6b01f8248102e55623f8a02c3b110204`, `collect.jsonl` `76f552569216e80e576f8c9770f04f26ec0f3500b93dfbdd5486428cd203c719`.
- 연구 API 호출 0회, 비용 0원.
