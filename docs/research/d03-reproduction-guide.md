# D03 재현 패키지 실행 안내

로컬 검토용 재현 패키지(압축 파일 `d03-repro.zip`, 풀면 `d03-repro/` 폴더)의 사용 설명이다. 독자는 이 저장소와 Git 이력 없이 패키지만 받은 사람이다. 이 문서는 패키지의 `README.ko.md`에 대응한다. 판정 규칙의 원문은 `docs/research/d03-reproduction-rules.md`이며 패키지에는 `RULES.ko.md`로 들어간다.

## 1. 목적과 범위

- 논문 원고(Git blob `c22a37b89b083c445f7ba483868aabe7041ddc02`, `docs/research/image-first-paper-draft.ko.md`)의 표 1–3과 그림 1–4를 기록된 원자료에서 다시 만들고 원고와 대조한다. (`docs/research/d03-reproduction-rules.md:3,7-17`)
- 새 모델 호출과 과금은 없다.
- 범위 밖: R09 외적 타당도 확장 자료와 일반화 주장. R09는 조건대기이며 선택·비선택이 확정되지 않았다. (`docs/research/d01-claim-alignment.md:5`)
- 이 대조는 원고 수치와 그림이 기록된 원자료에서 다시 나오는지만 본다. 정성 판단 자체의 타당성은 다시 평가하지 않는다. (`docs/research/d03-reproduction-rules.md:37`)

## 2. 대상 7항목

| ID | 원고 위치 | 재생성 경로 |
|---|---|---|
| T1 | 표 1 (정성 문헌 비교) | 고정 사양 `table1-spec.json`에서 표를 다시 만들고 인용 대응을 확인 |
| T2 | 표 2 (실험 2 가설) | `summarize.mjs` → `exp2-analyze.mjs`(seed 20261016) |
| T3 | 표 3 (실험 3 가설과 비용 패널) | `session-summarize.mjs` → `session-analyze.mjs`(seed 20261015) |
| F1 | 그림 1 `fig1_rq1_billed_tokens` | `make_figures.py`의 `fig1_rq1` |
| F2 | 그림 2 `exp2/heldout/fig5_exp2_accuracy_vs_tokens` | 재생성한 `graded.jsonl` → `exp2_figures.py` |
| F3 | 그림 3 `fig2_heldout_accuracy_vs_tokens` | `figure-data.mjs` → `make_figures.py`의 `fig2_accuracy_tokens` |
| F4 | 그림 4 `fig3_heldout_late_recall` | 같은 데이터 → `fig3_late_recall` |

(근거: `docs/research/d03-reproduction-rules.md:7-15`)

그림 번호는 원고의 링크 순서이며 파일 이름의 번호와 다르다. (`docs/research/d03-reproduction-rules.md:17`)

## 3. 요구 환경

| 항목 | 요구 | 작성자 재현 환경 |
|---|---|---|
| 운영체제 | Windows, macOS, Linux | 작성자 기록은 Windows 한 가지이며 다른 OS 검증은 확인 불가 |
| Node.js | 22 이상 | v24.18.0 |
| Python | 3.12 | 3.12.10 |
| Python 패키지 | 패키지의 `requirements.txt`(matplotlib 3.11.1, numpy 2.5.1과 의존 패키지 고정 버전) | 같음 |
| 그림 글꼴 | matplotlib에 포함된 DejaVu Sans | 같음 |

- npm 설치는 필요 없다. 재생성 스크립트는 Node 내장 모듈만 쓴다.
- 원 실험 시점의 Node·Python 버전과 원래 그림을 만든 시점의 OS·폰트 렌더러는 기록이 없으면 미상이며 이번 재현 환경과 구분한다. (`docs/research/d03-reproduction-rules.md:95`)

## 4. 단계 A: 최초 의존성 설치

이 단계만 네트워크를 쓴다. 허용된 사전 준비다.

```text
python -m venv <venv폴더>
<venv의 python> -m pip install --require-hashes -r d03-repro/requirements-win-cp312.lock
```

- 해시 잠금 파일 `requirements-win-cp312.lock`은 Windows x64·CPython 3.12용 PyPI wheel의 SHA-256을 담는다(2026-11-23 확인). 이 조합에서 쓴다.
- 다른 OS·Python에서는 버전만 고정한 `requirements.txt`를 쓴다: `<venv의 python> -m pip install -r d03-repro/requirements.txt`. 이 경우 wheel 해시는 검증되지 않는다.
- venv의 python은 Windows에서 `<venv>\Scripts\python.exe`, 그 외 `<venv>/bin/python`이다.

## 5. 단계 B: 오프라인 재생성과 대조

네트워크를 차단한 상태에서 실행한다. 출력 폴더는 아직 없는 새 폴더여야 한다.

```text
<venv python> d03-repro/tools/d03_repro.py all --package d03-repro --out <새 출력 폴더>
```

하위 명령을 따로 쓸 수 있다.

| 하위 명령 | 하는 일 | 인자 |
|---|---|---|
| `verify-manifest` | 패키지 파일 해시 확인 | `--package`만 |
| `guard-check` | 네트워크 차단 음성 대조(차단이 실제로 거부하는지) | `--package`, `--out` |
| `regenerate` | 생성기 실행 | `--package`, `--out` |
| `compare` | 7항목 판정 | `--package`, `--out` |

동작과 제한은 다음과 같다. (`docs/research/d03-reproduction-rules.md:80-85`)

- 출력 폴더가 이미 있으면 거부한다.
- 패키지 안에는 쓰지 않는다. 실행 전후 패키지 파일 해시를 비교한다.
- 공급자 API 키 환경변수(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` 등)는 하위 프로세스에서 제거한다.
- Node 하위 프로세스에는 fetch·TCP·UDP·DNS 차단 preload(`tools/guard/node-netguard.cjs`)를 `NODE_OPTIONS`로 적용한다.
- Python 하위 프로세스에는 `tools/guard/py/sitecustomize.py`를 `PYTHONPATH`로 적용한다.
- 차단 범위는 해당 프로세스와 하위 프로세스다. 시스템 방화벽은 바꾸지 않는다. 단계 A의 pip는 차단 밖이다.
- 빈 출력 폴더에 기준 이미지나 집계표를 복사해 성공으로 처리하지 않는다. 기준 파일은 `expected/`에만 있고 생성기 작업 폴더에 들어가지 않는다.

## 6. 결과 읽기

| 경로 | 내용 |
|---|---|
| `<out>/report.md` | 사람이 읽는 판정 보고 |
| `<out>/report.json` | 항목별 판정(MATCH / MATCH-WITHIN-TOLERANCE / MISMATCH / NOT-REPRODUCIBLE)과 세부 검사 |
| `<out>/env.json` | 실제 사용한 Node·Python·패키지 버전, 폰트 파일 |
| `<out>/logs/` | 명령별 표준출력, 종료 코드, 소요 시간 |
| `<out>/generated/` | 재생성 산출물 |

종료 코드는 다음과 같다.

| 코드 | 뜻 |
|---|---|
| 0 | 7/7 합격 |
| 1 | 판정 실패 또는 불일치 |
| 2 | 매니페스트·입력 오류 |
| 3 | 네트워크 차단 대조 실패 |

## 7. 판정 규칙 요약

원문은 패키지의 `RULES.ko.md`(저장소의 `docs/research/d03-reproduction-rules.md`)다. 아래는 요약이다.

- 판정 네 가지. (`docs/research/d03-reproduction-rules.md:19-24`)
  - MATCH: 모든 검사가 정확히 일치한다.
  - MATCH-WITHIN-TOLERANCE: 수치·구조 검사는 모두 일치하고 렌더 허용 범위 안의 차이만 있다.
  - MISMATCH: 검사 하나라도 허용 범위를 넘는다. 입력·원고·판정 기준은 고치지 않고 차이를 보고한다.
  - NOT-REPRODUCIBLE: 필요한 입력·seed·생성기가 없어 실행할 수 없다.
- 패키지 합격은 MATCH와 MATCH-WITHIN-TOLERANCE의 합이 7/7이고, 매니페스트 무결성, 빈 경로 재실행과 오프라인 검증, 공개 범위 점검이 모두 통과한 경우다. (`docs/research/d03-reproduction-rules.md:26`)
- T1: 사양과의 셀 단위 일치, 인용 번호와 참고문헌 대응, 참고문헌 작업 기록과의 문자열 일치, 표가 처음 들어간 판과의 일치. (`docs/research/d03-reproduction-rules.md:28-37`)
- T2·T3: 고정한 사양(bootstrap 10,000회, 각 seed, percentile 95%, margin −5%p)으로 재생성 JSON에서 셀 문자열을 만들어 원고 셀과 비교한다. 재생성한 분석·요약 파일의 기준 커밋 파일과의 바이트 일치는 보조 증거다. (`docs/research/d03-reproduction-rules.md:39-60`)
- F1–F4: 기초 수치(허용 오차 절댓값 1e-9), 축과 표식, 렌더 순으로 본다. (`docs/research/d03-reproduction-rules.md:62-76`)
  - 렌더가 바이트 동일이거나 해독한 RGBA 배열이 같으면 렌더 일치다.
  - 다르면 크기가 같고, 다른 픽셀 비율 0.5% 이하, 평균 절대 차이 2/255 이하이며 앞 두 단계가 모두 통과한 경우에만 허용 범위 안으로 본다.
  - 크기가 다르거나 범위를 넘으면 MISMATCH다.
  - PDF는 `/CreationDate` 등이 달라 해시 비교 대상이 아니며 해시는 기록만 한다.
- 육안 대조(독립 마일스톤 검토자의 나란히 보기)는 원 규칙의 4단계다. 실행기의 자동 판정은 1–3단계만 계산하고 `report.json`의 그림 항목에 `visual: pending-reviewer`로 남긴다. 육안 대조 결과는 검토자가 따로 기록한다.
- 확인하지 못한 값은 미상으로 적는다. (`docs/research/d03-reproduction-rules.md:93-95`)

## 8. 패키지 구성

| 경로 | 내용 |
|---|---|
| `README.ko.md` | 이 안내 |
| `METHODS.ko.md` | 방법 보충(`selectWindow` 의사코드 전문, 판정자 모델, 보존할 범위, D02 편집 대응) |
| `RULES.ko.md` | 판정 규칙 |
| `MANIFEST.json` | 파일별 SHA-256, 바이트, 역할, 원 저장소 경로와 Git blob, 권리, 배포 등급 |
| `requirements.txt` | Python 패키지 고정 버전(해시 없음, 모든 플랫폼) |
| `requirements-win-cp312.lock` | 같은 버전의 Windows x64·CPython 3.12 wheel SHA-256 잠금 |
| `tools/` | 실행기 `d03_repro.py`, 대조 `d03_checks.py`, 그림 기록 `d03_figprobe.py`, 차단 장치 `guard/` |
| `research/` | 생성기 코드와 원자료 |
| `expected/` | 고정 원고, 기준 산출물, 표 1 사양. 생성기 작업 폴더에는 들어가지 않는다 |

## 9. 자료별 공개 상태

세 등급이다: 공개 가능 / 제한 / 미확정.

| 자료 | 등급 | 근거와 조건 |
|---|---|---|
| 연구 코드(`research/src` 일부, `research/figures/*.py`, `tools/`) | 공개 가능 | 저장소 `LICENSE`(MIT License)로 이미 공개 저장소에 있다. (`LICENSE:1`) 라이선스 파일은 저작권자 이름이 있어 익명 심사용 사본에서 뺐다. 외부 배포 때 저작권 표기와 익명성의 처리는 별도 결정 대상이다 |
| 원자료(`rows.jsonl`, `responses.jsonl`, `calls.jsonl`, 세션 결과, `config.json`, 매니페스트) | 미확정 | 공개 저장소에 이미 커밋돼 있으나 공급자 모델 출력이 포함돼 있다. 외부 재배포는 공급자 이용약관 재확인 전까지 미확정이다 |
| 고정 원고(`expected/manuscript`)와 원고에서 가져온 표 1 사양·첫 판 발췌(`expected/table1-spec.json`, `expected/provenance/table1-abdaade.md`) | 제한 | 익명 심사 대상 원고다. 외부 배포를 보류한다 |
| 기준 그림·집계(`expected/`) | 공개 가능 | 공개 저장소에 있다. 단 원고와 묶은 배포는 심사 익명성 때문에 보류한다 |
| 조판본 HWP/PDF와 심사본 | 패키지에 넣지 않음 | D02 산출물은 공개 저장소에도 넣지 않았다. (`research/plans/2026-11-23-d02-ieie-typesetting.md:5`) |

외부 배포, 호스팅, DOI·URL 발급, 송부, 제출은 하지 않았다. 모두 별도 승인 대상이다.

## 10. 투고처 근거

- 대한전자공학회 투고규정 7항은 국문요약, 영문요약, 본문, 부록, 참고문헌의 순서를 정해 본문 부록을 열거한다. 공식 정규논문 양식 안내는 익명 심사를 명시한다. 이 두 자료만으로는 별도 온라인 보충 파일을 접수하는지 확인하지 못했다. 미확인으로 유지한다. (`research/plans/2026-11-23-d02-ieie-typesetting.md:12-16`)
- 출처:
  - https://www.theieie.org/download/paper_submission_guideline.pdf
  - https://www.theieie.org/board/?_0000_method=view&ncode=a008&num=4&page=1
- 확인일 2026-11-23(PM 확인). 이 문서의 작성자는 위 주소에 직접 접속하지 않았다. 위 내용은 D02 기록(`research/plans/2026-11-23-d02-ieie-typesetting.md`)과 PM 전달에 의존한다.

## 11. 승인에 관한 문장

이 안내는 새 행위(배포, 모델 호출, 과금)에 대한 승인을 만들지 않는다. 해당 행위는 그때마다 사용자의 별도 승인을 받는다.
