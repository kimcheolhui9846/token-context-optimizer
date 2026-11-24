# ko-window-diagnostic: 자료와 재현

프로토콜: [`research/plans/2026-11-24-ko-window-diagnostic-protocol.md`](../../plans/2026-11-24-ko-window-diagnostic-protocol.md). 결과: [`RESULTS.md`](RESULTS.md)

## 폴더

| 경로 | 내용 | 결정적 |
|---|---|---|
| `source-pins.json` | #148 원본 15개와 #147 고정 K1 라이브러리의 커밋·경로·blob·SHA-256·크기 | 예 |
| `cohort.json` | 등록 코호트 24쪽(id, 문서 종류, 양식, role, 기존 strict·evidence) | 예 |
| `run-{a,b}/pages.jsonl` | 페이지별 판정 24행(스키마: 프로토콜 7절) | 예 |
| `run-{a,b}/summary.json` | 입력 해시, 분모, 교차표, 양식·문서 종류별 분모 | 예 |
| `ab-compare.json` | 실행 A/B 페이지 키·값 양방향 비교와 summary 비교 | 예 |
| `recount-{a,b}.json` | 독립 Python 검산(원본 Git 객체에서 다시 계산, JS 결과와 전 필드 비교) | 예 |
| `mutation-{a,b}.json` | 주변합을 바꾸지 않는 페이지별 변조 5종을 검산이 거부하는지 | 예 |
| `logs/` | RED 기록, 공식 실행 기록, 제품 검증 기록 | 아니오 |

`pages.jsonl` 필드 중 `otherLineCue`는 선택 줄이 아닌 다른 OCR 줄에 확실한 표지 단서가 있는지다(선택 줄 분류와 무관하게 기록). summary의 `otherLineCue` 집계는 선택 줄에 단서가 없는 페이지만 센다. 좌표는 원본 페이지 픽셀이며 반올림하지 않았다.

## 재현

POSIX 셸(Git Bash 또는 bash). Node 22 이상, Python 3.12 표준 라이브러리만 쓴다. npm 패키지, OCR 언어 파일, 네트워크 측정은 필요 없다.

```sh
W="$(mktemp -d)" && cd "$W"
git clone https://github.com/kimcheolhui9846/token-context-optimizer.git repo && cd repo
git fetch origin pull/149/head:refs/remotes/origin/pr149 pull/148/head pull/147/head   # 객체만 받는다. #148을 병합하지 않는다
git checkout --detach origin/pr149                                                    # 또는 결과 커밋 SHA
git cat-file -t 2ab9ed149896cc06cec387826ab99fa5bac77cda                              # commit (#148 원본)
git cat-file -t c0c2f5dd4178df3e02595176525cf88b2eaf68c2                              # commit (#147 K1 정의)
git rev-parse 2ab9ed149896cc06cec387826ab99fa5bac77cda:research/results/ko-ocr-holdout/run-a/predictions.jsonl   # 320cce68…, 나머지는 source-pins.json
cd research
node --test test/ko-window-diagnostic.test.mjs                                        # 18 pass
python -m unittest tools/ko-window-diagnostic/test_recount.py                         # 13 OK
R=results/ko-window-diagnostic; O="$W/out"; mkdir "$O"
node src/ko-window-diagnostic-run.mjs --run a --out "$O/run-a"
node src/ko-window-diagnostic-run.mjs --run b --out "$O/run-b"
node src/ko-window-diagnostic-compare.mjs --a "$O/run-a" --b "$O/run-b" --out "$O/ab-compare.json"   # reproduced: true
for X in a b; do
  python tools/ko-window-diagnostic/recount.py --run $X --pages "$O/run-$X/pages.jsonl" --summary "$O/run-$X/summary.json" --out "$O/recount-$X.json"   # ok: true, 종료 0
  python tools/ko-window-diagnostic/mutation_check.py --run $X --dir "$O/run-$X" --work "$O/mut-$X" --out "$O/mutation-$X.json"                       # allPassed: true
  for f in pages.jsonl summary.json; do cmp "$O/run-$X/$f" "$R/run-$X/$f" && echo "same run-$X/$f"; done
done
for f in ab-compare.json recount-a.json recount-b.json mutation-a.json mutation-b.json; do cmp "$O/$f" "$R/$f" && echo "same $f"; done
```

- 실행기와 검산은 모두 원본을 작업 폴더가 아니라 `git cat-file`로 읽고 blob id·SHA-256·크기를 고정값과 대조한다. 하나라도 다르면 결과를 쓰지 않고 실패한다.
- K1 재계산은 고정 #147 라이브러리 blob을 Git 무시 경로 `research/.cache/ko-window-diagnostic/`에 그대로 꺼내 쓴다.
- 결과 파일은 LF로 고정했다(`.gitattributes`). Windows 작업 사본에서도 `cmp`가 같아야 한다.
