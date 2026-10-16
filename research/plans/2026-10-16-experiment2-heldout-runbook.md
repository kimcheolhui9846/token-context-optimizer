# 실험 2 held-out 실행·보고 절차 (runbook)

- 작성: Claude Code, 2026-10-16
- 목적: PR #40(Task 34) merge 뒤 held-out을 실행해, 같은 날 사전 등록 판정·결과 README·그림까지 끝낸다.
- 근거: 사전 등록 개정 1(`2026-10-16-experiment2-preregistration-draft.md` §8)

## 0. 실행 전 확인

1. `gh pr view 40 --json state`가 `MERGED`인지 확인한다(실행 조건).
2. 하네스·분석이 동결 커밋 `dbf4f6b` 이후 바뀌지 않았는지 확인한다.
   ```
   git diff dbf4f6b -- research/src/run.mjs research/src/summarize.mjs research/src/exp2-analyze.mjs research/src/variants.mjs research/src/env.mjs
   ```
3. 생성물 해시를 확인한다.
   - `out/exp2-heldout/slots.json` = `36ae3dec…`
   - `families.json` = `71e2648f…`
4. dry-run으로 비용 상한을 확인한다(GPT-4o $1.68, Haiku $0.83 근처).

## 1. 실행

```
node src/run.mjs --set exp2-heldout --run-id exp2-held-gpt4o
node src/run.mjs --set exp2-heldout --provider anthropic --run-id exp2-held-haiku
```

- 실패 slot이 남으면 같은 run-id로 이어 실행한다(지문 검사). 이어 실행 뒤에도 실패로 남은 slot은 오답으로 센다. 원인은 README에 적는다.
- 사전 등록에 없는 이어 실행·재시도는 하지 않는다.

## 2. 집계·판정

```
node src/summarize.mjs --set exp2-heldout --run-id exp2-held-gpt4o
node src/exp2-analyze.mjs --set exp2-heldout --run-id exp2-held-gpt4o
(haiku 동일)
```

- 판정은 `exp2-analysis.md`의 H1만 한다. H2·H3·Dp는 기술 통계로만 보고한다.
- not_started가 0인지 확인한다. 0이 아니면 완료 연구로 보고하지 않는다.

## 3. 결과 폴더와 README

- `results/exp2-heldout/{gpt4o,haiku}/`에 실행 폴더를 복사한다. `slots.json`과 `families.json` 사본도 넣는다.
- README 구성(실험 3 held-out README와 같은 틀)
  1. 실행 정보: 날짜, 모델, 호출 수(기본 720 + 재요청), 비용, 실패, 사전 등록·동결 커밋, 생성물 해시
  2. 가설 판정 표: H1(두 공급자), H2·H3 기술 통계
  3. arm별 정확도·입력 토큰·비용 표, 조건별 표, 재요청률(전체·조건별)
  4. 탐색: Dp, 레이아웃(base·v2), 영역, 작은 글자, GPT-4o UNREADABLE 수(사전 등록 관찰 항목)
  5. 이탈: 사전 등록과 다른 점이 있으면 전부 적는다
  6. 한계
     - 합성 이미지
     - 선택기는 연구 코드(제품은 호출자 영역, 선택기 결정 메모)
     - v2 레이아웃은 실험 3에서 노출됨
     - content-match 채점
- 수치 문장은 원자료로 대조한다. 실험 3에서 "답이 모두 같다"를 잘못 쓴 일이 있었다. 문장마다 grep 또는 node로 확인한다.

## 4. 그림

```
python figures/exp2_figures.py --gpt4o results/exp2-heldout/gpt4o --haiku results/exp2-heldout/haiku --tag heldout
```

- 라벨 겹침만 눈으로 확인하고 고친다.

## 5. 후속

- PR #37에 커밋·push한다. 그 뒤 Codex 교차 검토를 요청한다(요청서는 이때 쓴다).
- 결과를 논문에 반영하는 일은 별도 Codex 문서 Task로 한다. Task 38에 RQ2를 더할지 새 Task로 할지는 사용자가 정한다.
