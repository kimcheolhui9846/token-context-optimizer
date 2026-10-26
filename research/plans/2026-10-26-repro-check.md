# 결과 오프라인 재현성 점검 (2026-10-26)

- 작성: Claude Code, 2026-10-26. 기준 main `ece9ef3`
- 성격: 읽기 전용 점검. 모델을 다시 호출하지 않았다. 커밋된 결과 파일은 바꾸지 않았다
- 목적: 논문 원고가 근거로 삼는 집계·분석 파일이, 저장소에 남은 원자료와 스크립트만으로 똑같이 다시 만들어지는지 확인한다. 보충 자료의 재현 주장을 투고 전에 확인하는 것이다

## 1. 판정

- **재현 대상 24개 파일이 모두 커밋본과 바이트 단위로 같다.** 다른 파일은 없다
- bootstrap 신뢰구간도 같다. 분석 스크립트의 seed가 고정돼 있어(실험 2 `exp2-analyze.mjs:18` `20261016`, 실험 3 `session-analyze.mjs:17` `20261015`) 다시 돌려도 같은 값이 나온다
- 입력 쪽도 재현된다. 세션·family·slot 매니페스트를 다시 만들었더니 커밋본과 같았고, 매니페스트에는 생성한 이미지의 SHA-256이 들어 있으므로(§3), 매니페스트가 같다는 것은 이미지 바이트도 같다는 뜻이다

## 2. 방법

- 임시 worktree(`claude/repro-check`, main `ece9ef3`)에서 돌렸다. 스크립트는 `research/out/` 아래에 쓰고, 이 폴더는 git이 무시한다. 생성 스크립트는 같은 `out/` 자리에 쓰므로, 집계 점검을 먼저 끝내고 그 결과를 옮긴 뒤 생성 점검을 했다
- `figure-data.mjs`는 추적되는 `figures/data/`에 직접 쓴다. worktree에서 돌리고 비교한 뒤 되돌렸다
- 각 결과 폴더의 원자료(`config.json`, 응답·호출 기록, 세션 결과)를 스크립트가 읽는 자리(`out/…/runs/<run-id>`, `out/session-runs/<run-id>`)에 복사했다. 그다음 결과 README의 재현 절 순서대로 집계·분석 스크립트를 돌렸다
- 비교는 `git cat-file -p HEAD:<경로>`로 꺼낸 커밋 blob과 `cmp`로 했다
  - 작업 사본과 비교하지 않은 이유: 이 PC는 `core.autocrlf=true`라 작업 사본의 줄바꿈이 blob과 다를 수 있다. 처음에 작업 사본과 비교했을 때 18개가 모두 다르게 나왔지만, 줄 끝 CR을 무시하면 차이가 0줄이었다
- 환경: Windows 11, Node v24.18.0, sharp 0.35.4(`research/package.json` 고정 버전)

## 3. 결과

| 실험 | 스크립트 | 비교한 파일 | 결과 |
|---|---|---|---|
| 실험 1 (RQ1 회계) | `rq1-summarize.mjs --run-id rq1-sweep-001` | `summary.json`, `summary.md` | 2/2 같음 |
| 실험 2 held-out, GPT-4o·Haiku | `summarize.mjs`, `exp2-analyze.mjs` (`--set exp2-heldout`) | 모델마다 `summary.json`, `summary.md`, `graded.jsonl`, `exp2-analysis.json`, `exp2-analysis.md` | 10/10 같음 |
| 실험 3 held-out, GPT-4o·Haiku | `session-summarize.mjs`, `session-analyze.mjs` | 모델마다 `summary.json`, `summary.md`, `analysis.json`, `analysis.md` | 8/8 같음 |
| 그림 데이터 | `figure-data.mjs` | `figures/data/heldout-sessions.json` | 1/1 같음 |
| 실험 3 입력 | `sessions.mjs --split heldout` | `sessions-heldout.json` (SHA-256 필드 72개, 이미지 48장) | 같음 |
| 실험 2 입력 | `generate.mjs`, `variants.mjs` (`--set exp2-heldout`) | `families-exp2-heldout.json` (SHA-256 필드 36개, 이미지 36장), `slots-exp2-heldout.json` (SHA-256 필드 720개, PNG 참조 432개) | 같음 |

- 합계: 집계·분석 21개, 입력 매니페스트 3개, 모두 같다
- 원고와의 연결: 원고 수치는 위 파일에서 나온다. 원고 값과 이 파일들의 대조는 투고 전 점검(PR #64 `2026-10-25-presubmit-check.md` §2)에서 했고 불일치가 0건이었다. 두 점검을 합치면 **원자료 → 집계 파일 → 원고 수치**가 이어진다

## 4. 확인하지 않은 것

- 모델 호출 단계(`run.mjs`, `session-harness.mjs`, `rq1-sweep.mjs`)는 다시 돌리지 않았다. API 비용이 들고, 공급자 응답이 결정적이지 않다. 원고도 이 단계의 재현을 주장하지 않는다
- 그림 PNG·PDF(`make_figures.py`, `exp2_figures.py`)는 다시 그리지 않았다. matplotlib 판에 따라 바이트가 달라지므로 비교 의미가 작다. 그림에 들어가는 데이터는 위에서 확인했다
- 실험 2 calibration, 실험 3 calibration·dev, 발췌 벤치는 대상이 아니다. 원고 결과 절은 held-out과 실험 1, 발췌 벤치 수치 하나(20/24 → 24/24)를 쓴다. 발췌 벤치는 MCP 서버를 띄워야 해서 이번 점검 범위 밖이다
- 다른 OS·Node 판에서의 재현은 확인하지 않았다

## 5. 덧붙일 것 (선택)
- 보충 자료 README에 "모델 호출 없이 집계를 다시 만드는 절차"를 이 메모 §2처럼 적어 두면 심사자가 바로 따라 할 수 있다. 지금 결과 README의 재현 절에는 호출 단계까지 함께 있어, 호출 없이 집계만 다시 하려면 원자료를 어디에 복사해야 하는지 나와 있지 않다
- 이 정리는 보충 자료 주소(W-7)를 정할 때 같이 하기를 권한다

## 6. 교차 확인
- `gemini-4-argon` 1차: REQUEST CHANGES, [Minor] 1건. §3 표의 해시 개수가 이미지 개수로 읽혔다. SHA-256 필드 수와 이미지 수를 나눠 적었다
- 확인 불가로 남긴 항목(커밋, worktree, PR #64 대조, 다른 스크립트 이름, W-7)은 Claude가 저장소에서 확인했다
