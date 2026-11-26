# 구분선을 옮겼을 때 한국어 표의 두 제목 창이 보존한 근거

**별관 숫자를 심은 유효 배치 6개 중 2개에서 기존 OCR 선택기가 제목 복원을 적용했다.** 두 배치는 모두 ‘유약 시험편 소성’ 표였다. 숫자 89를 제목 사이에 두거나 표 오른쪽에 두었을 때, 전체 폭으로 복원하면 숫자 잉크 277픽셀 중 143픽셀이 새로 보였다. 두 제목 창은 두 배치 모두에서 이 잉크를 0픽셀로 줄이고, 두 열 제목과 대상 행 이름, 대상 값과 비교 값을 전부 보존했다.

| 원본과 별관 값 | 이동 후 무첨가 대조에서 복원 | 이동 후 별관 배치에서 복원 | 숫자 잉크 픽셀 (W5 → 전체 폭 → 두 창) |
|---|---|---|---|
| 장구 가죽 손질 · 87 | 적용 | 0/2 | 두 배치 모두 0 → 0 → 0 |
| 유약 시험편 소성 · 89 | 적용 | 2/2 | 두 배치 모두 0 → 143 → 0 |
| 유성우 개수 기록 · 91 | 적용 | 0/2 | 두 배치 모두 0 → 0 → 0 |

각 원본에 기존·이동 구분선과 무첨가·제목 사이·오른쪽 배치를 조합해 6장씩 만들었다. 기존 연구에서 구분선과 숫자 잉크가 겹쳤던 6개 배치는 원래 위치 그대로 비교 자료에 남겼다. 숫자의 위치를 고정한 채 선만 6픽셀 아래로 옮기자 6개 모두 기존 잉크와 겹친 픽셀이 0개였다. [사전등록](../../plans/2026-11-26-ko-header-rule-pairs.md) · [배치와 기하 검산](roster.json)

### 구분선 이동과 복원 여부

9쌍 중 5쌍은 앞뒤 모두 적용, 4쌍은 앞뒤 모두 거절이었다. 적용에서 거절, 거절에서 적용으로 바뀐 쌍은 각각 0개였다. 거절된 이동 배치 4장은 OCR에서 복원할 제목 행을 확정하지 못해 기존 W5 화면을 유지했다. 이동 조건 9장 중 실제 적용된 5장에서 두 창 때문에 완전하던 단서가 잘리거나 다른 숫자가 추가로 보인 사례는 0개였다. 기존 선 비교군에서도 적용된 5장 중 0개였다. 별관 이름의 새 노출도 두 방식 모두 0이었다. [18장 개별 측정과 판정](results.json)

사전등록 판정은 **한 원본의 두 배치에서 보호 효과 관측**이다. 다섯 단서의 보존은 이미지 픽셀로 측정했다. 이 결과로 사람의 정답률이나 새로운 양식에서의 성능을 추정할 수 없다. 제품 기본값과 논문 심사본은 유지한다.

| 확인할 화면 | 원본 | 기존 W5 | 전체 폭 | 두 제목 창 |
|---|---|---|---|---|
| 이동 선·제목 사이 89 | [원본 PNG](input/render/images/q054cef2b.png) | [W5](displays/q054cef2b/w5.png) | [전체 폭](displays/q054cef2b/full.png) | [두 창](displays/q054cef2b/two.png) |
| 이동 선·오른쪽 89 | [원본 PNG](input/render/images/qbeb222c6.png) | [W5](displays/qbeb222c6/w5.png) | [전체 폭](displays/qbeb222c6/full.png) | [두 창](displays/qbeb222c6/two.png) |

### 재현

사전등록과 실행 코드를 `d3ab52e0d17a30147932748fe9c03c808a6e16c5`에서 고정하고 Draft를 연 뒤 18장에 로컬 CPU OCR을 실행했다. 기존 선 9장의 실제 복원 판정과 표시 27개가 이전 연구와 일치했다. 별도 출력 경로로 두 번 실행한 결과 공개 PNG·JSON·JSONL 82개(1,005,712바이트)가 모두 바이트 단위로 같았다. 독립 검산기는 원본 좌표와 공개 이미지를 이용해 표시 54개를 다시 구성하고 잉크를 세었다. [엔진·언어 파일·오프라인 검증 기록](ocr/guard-summary.json)

저장소 루트에서 공개 결과를 확인한다.

```sh
python -B research/tools/ko-header-rule-pairs/verify.py research/results/ko-header-rule-pairs
python -B -m unittest discover -s research/experiments/ko-header-rule-pairs -p "test_*.py"
```

전체 재실행에는 [고정 입력 목록](../../tools/ko-blind-reader/registered.json)의 글꼴, 로컬 eng/kor 언어 파일, Git 커밋과 연구 의존성이 필요하다. 실행할 때마다 새 출력 디렉터리를 사용한다.

```sh
git fetch origin pull/147/head pull/150/head pull/151/head pull/152/head pull/153/head pull/154/head
npm --prefix research ci --ignore-scripts
python -B research/experiments/ko-header-rule-pairs/run_pairs.py --lock d3ab52e0d17a30147932748fe9c03c808a6e16c5 --font "C:/Windows/Fonts/NotoSansKR-VF.ttf" --out .artifacts/rule-pairs-fresh
```
