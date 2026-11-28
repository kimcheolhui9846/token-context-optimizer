# ko-header-strip — W5 재생 재현 안내

- 프로토콜: `research/plans/2026-11-25-ko-header-strip-protocol.md`
- 등록값: `research/tools/ko-header-strip/registered.json`, 검산 명세: `research/tools/ko-header-strip/RECOUNT_SPEC.md`
- 결과와 해석: 같은 폴더의 `RESULTS.md`

## 0. 원칙

- **새 출력은 모두 저장소 밖 작업 폴더 `$W/out` 아래에 쓴다.** 조립·검증·채점·그림·비교·검산 명령은 출력 대상이 이미 있으면 거부한다. 이 안내의 어떤 명령도 파일을 지우거나 게시된 파일을 덮어쓰지 않는다. 각 절 끝에서 `git status --porcelain`이 빈 출력인지 확인한다.
- 입력은 #153 PR head `4320271738c8be56556fb09bf56511368d49ba9e`의 Git 객체(예측, 자료 manifest, 원본 PNG tree, 채점 측 design/gold/render, #153 score)다. 작업 트리에 복사하지 않고 `git cat-file`로 읽으며 `registered.json`의 blob·SHA-256과 대조한다.
- 조립(`build`)은 허용 목록(예측, freeze, 자료 manifest, 원본 PNG)만 읽는다. gold·design·render·#153 score는 채점(`score`)만 읽는다.
- 로컬 CPU만 쓴다. OCR·모델 호출·네트워크 측정 없음(1절의 clone·fetch·`npm ci`만 네트워크).
- 셸은 bash(Linux·macOS·Windows Git Bash). 위에서부터 같은 셸에서 차례로 실행한다.
- 핀: Node ≥ 22(기록 v24.18.0), 연구 lockfile의 sharp 0.35.4(libvips 8.18.6), Python 3.12, Pillow 12.3.0(`research/tools/d03/requirements.txt`와 같은 핀).

## 1. 준비 (네트워크 사용, 측정 아님)

```sh
W="${TMPDIR:-/tmp}/khs-repro-$(date +%Y%m%d%H%M%S)"
mkdir "$W"                                          # 이미 있으면 실패: 멈추고 다른 이름을 쓴다
W="$(cd "$W" && (pwd -W 2>/dev/null || pwd))"     # Git Bash에서는 C:/... 형식
mkdir "$W/out"

git clone https://github.com/kimcheolhui9846/token-context-optimizer.git "$W/repo"
cd "$W/repo"
git fetch origin pull/154/head:khs-pr154 pull/153/head:khc-pr153
git checkout khs-pr154                              # merge 뒤라면 main을 써도 된다
git cat-file -t 4320271738c8be56556fb09bf56511368d49ba9e   # commit

cd research
npm ci --ignore-scripts                             # 연구 lockfile 그대로
node -p "require('sharp').versions.sharp + ' ' + require('sharp').versions.vips"   # 0.35.4 8.18.6
python -c "import PIL; print(PIL.__version__)"      # 12.3.0 (없으면: python -m pip install pillow==12.3.0 를 venv에서)
git status --porcelain                              # 빈 출력
```

## 2. 시험

```sh
node --test test/ko-header-strip.test.mjs                                  # pass 12, fail 0
python -m unittest discover -s tools/ko-header-strip -p test_recount.py    # Ran 8 tests ... OK
```

## 3. 조립 A/B, 게시본 대조, 경로 1 검증

```sh
node src/ko-header-strip-build.mjs --out "$W/out/build-a"
node src/ko-header-strip-build.mjs --out "$W/out/build-b"
# done: 144 rows {"w4_not_applied":122,"two_bands":20,"merged":2} coords 057df7e86537 manifest e19c05a2d44b
node src/ko-header-strip-compare.mjs --a "$W/out/build-a" --b "$W/out/build-b" --out "$W/out/ab-build.json"   # identical true, files 435

for f in coords.jsonl manifest.json inputs.json; do
  cmp -s "$W/out/build-a/$f" results/ko-header-strip/build-a/$f && echo "same $f" || echo "DIFF $f"; done
n=0; for f in results/ko-header-strip/build-a/w5/*.png; do
  cmp -s "$f" "$W/out/build-a/w5/$(basename "$f")" && n=$((n+1)) || echo "DIFF $f"; done; echo "same w5 $n"   # same w5 144

node src/ko-header-strip-verify.mjs --build "$W/out/build-a" --out "$W/out/verify-a.json"
# {"ok":true,"counts":{"coordsRows":144,"w1":144,"w4":144,"w5":144,"w1FilesChecked":144,"w4FilesChecked":144,"w5KeptEqualW1":122},"problems":0}
node src/ko-header-strip-verify.mjs --build results/ko-header-strip/build-a --out "$W/out/verify-pub.json" --w5-only   # ok true (W1/W4는 픽셀 해시만)
cmp -s "$W/out/verify-a.json" results/ko-header-strip/logs/verify-a.json && echo "same verify-a.json"
git status --porcelain                              # 빈 출력
```

- W1·W4 PNG는 게시하지 않는다(사례 5쪽은 `figures/`). `$W/out/build-a/w1/`, `w4/`가 복원본이며 `manifest.json`의 파일·픽셀 해시와 같다.

## 4. 채점 A/B

```sh
node src/ko-header-strip-score.mjs --build results/ko-header-strip/build-a --out "$W/out/score-a"
node src/ko-header-strip-score.mjs --build "$W/out/build-b" --out "$W/out/score-b"
# done: strict W1 136 W4 136 W5 136 /144; L5 0/136; J4 22 J5 22 kept 22; reexposed 0; fixed22 E1 W5 0 fourItems 22/22; verdict pass []
for x in a b; do cmp -s "$W/out/score-$x/score.jsonl" results/ko-header-strip/score-a/score.jsonl && echo "same score-$x/score.jsonl"; done
python - "$W" <<'EOF'
import json, sys
W = sys.argv[1]
load = lambda p: json.load(open(p, encoding="utf-8"))
pub = load("results/ko-header-strip/score-a/summary.json")
for x in "ab":
    s = load(f"{W}/out/score-{x}/summary.json")
    skip = ("scoreStartedUtc", "buildCommit")
    print(x, "summary equal except start time and HEAD:", {k: v for k, v in s.items() if k not in skip} == {k: v for k, v in pub.items() if k not in skip})   # True
EOF
git status --porcelain                              # 빈 출력
```

- `summary.json`은 채점 시작 시각(`scoreStartedUtc`)과 채점 때의 HEAD(`buildCommit`, 게시본은 조립 동결 커밋 `2790824`)를 담으므로 다시 채점하면 이 두 필드만 다르다. `score-meta.json`의 `buildMatchesHead`는 채점한 조립 출력이 HEAD의 `build-a`와 같을 때 참이다(외부 `build-b`도 바이트가 같아 참).

## 5. 공개 표와 독립 검산

```sh
cp results/ko-header-strip/RESULTS.md "$W/out/RESULTS.md"
node src/ko-header-strip-report.mjs --summary "$W/out/score-a/summary.json" --results "$W/out/RESULTS.md" --write
cmp -s "$W/out/RESULTS.md" results/ko-header-strip/RESULTS.md && echo "same RESULTS.md"
node src/ko-header-strip-report.mjs --summary results/ko-header-strip/score-a/summary.json --results results/ko-header-strip/RESULTS.md   # mismatches 0

mkdir "$W/out/recount"
python tools/ko-header-strip/recount.py --build results/ko-header-strip/build-a --score results/ko-header-strip/score-a \
  --results results/ko-header-strip/RESULTS.md --out "$W/out/recount/recount-a.json"          # {"ok": true, "failed": 0, "verdict": "pass"}
python tools/ko-header-strip/recount.py --build "$W/out/build-b" --score "$W/out/score-b" \
  --results results/ko-header-strip/RESULTS.md --out "$W/out/recount/recount-b.json"          # ok true
python tools/ko-header-strip/recount.py --build results/ko-header-strip/build-a --score results/ko-header-strip/score-a \
  --results results/ko-header-strip/RESULTS.md --mutate "$W/out/recount/mutation.json"        # allRejected true, tampers 17, metadataNotPixel true
cmp -s "$W/out/recount/recount-a.json" results/ko-header-strip/recount/recount-a.json && echo "same recount-a.json"
cmp -s "$W/out/recount/mutation.json" results/ko-header-strip/recount/mutation.json && echo "same mutation.json"
git status --porcelain                              # 빈 출력
```

- `recount-b.json`은 외부 `build-b`에 W1/W4 파일이 있어 그 파일도 검사하므로 게시본 `recount-b.json`(작성자 환경의 외부 폴더)과 같은 내용이어야 한다: `cmp -s "$W/out/recount/recount-b.json" results/ko-header-strip/recount/recount-b.json`.
- 검산기는 연구 JS를 가져오지 않는다. 다만 구현자와 같은 사람이 썼다(`RESULTS.md` 7절).

## 6. 사례 그림

```sh
node src/ko-header-strip-figures.mjs --build "$W/out/build-a" --out "$W/out/figures"     # figures: 5 cases
for f in results/ko-header-strip/figures/*; do cmp -s "$f" "$W/out/figures/$(basename "$f")" || echo "DIFF $f"; done; echo figures-compared
git status --porcelain                              # 빈 출력
```

## 7. 오류 시

- 핀·해시·ID·좌표 계약이 어긋나면 `build`는 `--out` 폴더에 `stop.json`(코드·메시지)만 남기고 종료 2다. 다른 출력으로 대신하지 않는다(프로토콜 4.3).
- 실패한 출력 폴더는 지우지 말고 그대로 두고 새 `$W`로 다시 시작한다.
