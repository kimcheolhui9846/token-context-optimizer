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

진단 코드는 기준 main `0fb3053`에는 없다. 진단 버전(병합 전에는 PR #146 head, 병합 뒤에는 그 병합 커밋)을 체크아웃하고, FCP 원본이 든 PR #145 head 객체도 함께 받아야 한다. 아래 블록은 Git Bash(Windows)와 POSIX 셸에서 그대로 실행된다.

```sh
git clone https://github.com/kimcheolhui9846/token-context-optimizer.git && cd token-context-optimizer
# FCP 원본(708d994…)과 진단 버전을 이름 있는 ref로 받는다. #145는 체크아웃하지 않는다.
git fetch origin pull/145/head:refs/remotes/origin/pr-145 pull/146/head:refs/remotes/origin/pr-146
git checkout --detach origin/pr-146           # 진단 버전. 병합 뒤에는 그 병합 커밋을 체크아웃해도 된다
test -f research/src/ko-anchor-diagnostic.mjs && echo "diagnostic code present"
git cat-file -t 708d9946ae091180a1b716baadfdd73fcfe5a19b                                                        # commit
git rev-parse 708d9946ae091180a1b716baadfdd73fcfe5a19b:research/results/fresh-crop-padding/run-a/caller.jsonl   # d657d59d7124f68743a1e54a7eb7c62f521dbc21
git rev-parse 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1:research/results/r09-bilingual/heldout/run-a/raw.jsonl   # 876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318
cd research && npm ci --ignore-scripts        # 선택기 모듈의 import 의존성(sharp, tesseract.js). OCR은 실행하지 않는다
```

측정(오프라인 가드 필수). `--out`은 아직 없는 경로여야 하므로 새 임시 폴더 아래의 하위 경로를 쓴다. `pwd -W`는 Git Bash에서 드라이브 경로(`D:/...`)를 주고, 다른 셸에서는 `pwd`로 대신한다.

```sh
GUARD="$(cd tools/d03/guard && (pwd -W 2>/dev/null || pwd))/node-netguard.cjs"
OUT="$(mktemp -d)/run"
NODE_OPTIONS="--require=$GUARD" node src/ko-anchor-diagnostic.mjs --out "$OUT"
NODE_OPTIONS="--require=$GUARD" node src/ko-anchor-diagnostic.mjs --verify results/ko-anchor-diagnostic
for f in sources.json replay.jsonl collect.jsonl pinned.json score.jsonl summary.json; do cmp "$OUT/$f" "results/ko-anchor-diagnostic/$f" && echo "same $f"; done
```

종료 동작:

- `--out` 정상 완료: 종료 코드 0, 6개 파일(`sources.json`, `replay.jsonl`, `collect.jsonl`, `pinned.json`, `score.jsonl`, `summary.json`).
- `--out`에서 원본 검증(§4.1)이나 기준 재생(§4.2)의 중단 규칙에 걸림: `sources.json`과 `stop.json` 두 파일만 쓰고 종료 코드 2. 채점하지 않는다.
- 실행 전제 오류(가드 없음, 출력 경로가 이미 있음, 선택기 blob 불일치, 필요한 Git 객체 없음 등): 결과 파일을 쓰기 전에 예외로 끝난다(0이 아닌 종료 코드). 예: #145 객체가 없으면 `git fetch origin pull/145/head` 안내가 나온다.
- `--verify <폴더>`: 모든 출력 파일을 메모리에서 다시 계산해 바이트 단위로 비교한다. 같으면 0, 다르면 1.

독립 검산과 시험(`research/`에서):

```sh
python tools/ko-anchor-diagnostic/recount.py --results results/ko-anchor-diagnostic --repo ..
python tools/ko-anchor-diagnostic/recount.py --results "$OUT" --repo ..
python -m unittest discover -s tools/ko-anchor-diagnostic -p "test_recount.py"
node --test test/ko-anchor-diagnostic.test.mjs
```

## 이번 실행 기록

- 2026-11-24, Windows 11, Node v24.18.0, Python 3.12.10. 코드 커밋 `66c9a25`.
- 새 폴더 두 곳에 실행: 6개 파일 모두 바이트 동일. 오프라인 가드 로그: 가드 적재 2회, 차단 0회.
- `pinned.json`: `replay.jsonl` `9510835d4120cf181e3b879bf965446f6b01f8248102e55623f8a02c3b110204`, `collect.jsonl` `76f552569216e80e576f8c9770f04f26ec0f3500b93dfbdd5486428cd203c719`.
- 연구 API 호출 0회, 비용 0원.
