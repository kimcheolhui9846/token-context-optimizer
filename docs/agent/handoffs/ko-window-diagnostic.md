# 인계: ko-window-diagnostic (#148 후속 Tier E 회고 진단)

- 날짜: 2026-11-24 · 작업자: Claude Code(Opus 5.5, 구현) · 계획·최종 확인: Codex(Astra) · 마일스톤·최종 독립 검토: Opus(PM 지정)
- 브랜치 `claude/ko-window-diagnostic`, Draft PR #149 → main. 기준 main `0fb30531`. #148(`2ab9ed1`)은 병합하지 않고 Git 객체로만 읽었다.
- 상태: 구현·결과·자기 검증 완료. 독립 Opus 마일스톤 검토(claude-opus-5-5) PASS WITH NOTES(blocker 0, major 0, minor 2, note 3). minor 1(RESULTS 6절의 두 문제 중첩 서술)은 `fix(review)` 커밋으로 고쳤고 검증 표에 Python/JS의 band 검산 범위를 적었다. minor 2(intake 3쪽 트리거 role)는 PM이 원본·페이지별 자료에서 모두 header이고 선택 줄에 header·value 두 종류가 있음을 확인해 해소했다. PM은 제출 head `b46eb62`에서 9개 파일 원바이트 동일, 제품 4639 통과/5 건너뜀, Opus의 JS 18·Python 13 자체 실행을 확인했다. Astra 최종 확인 대기. Ready·병합은 하지 않았다.

## 커밋

| 커밋 | 내용 |
|---|---|
| `401bb72` | 사전등록: 프로토콜, 원본 pin, 코호트, 결과 스키마, 테스트(새 페이지별 판정 전) |
| `66a029e` | RED 기록(구현 파일 없음으로 두 테스트 모음 실패) |
| `0943bf8` | 규칙·실행기·A/B 비교·Python 검산·변조 점검 구현. 등록 뒤 테스트 변경 3가지(픽스처 K1 점수 2곳, 오류 형식 단언 강화, 공백 문자 표기)는 커밋 메시지에 적었다. 판정 규칙 변경 없음 |
| `bab47f5` | 실행 A·B 결과, A/B 비교, 검산, 변조 점검 |
| (이 커밋) | RESULTS.md, README.md, 제품 검증 기록, 이 인계서 |

## 결과 요약

- 일차 20쪽: 선택 줄에 목표 표지 단서 15쪽(모두 앵커만 포함, 값은 창 오른쪽 밖: slip 10쪽 207–278px, intake 5쪽 3–121px), 머리글·항목명 줄 선택 5쪽(값만 포함 3, 둘 다 빠짐 2, 모두 repair). 판정 유보 0.
- 대조 4쪽: 모두 표지 단서 줄, 둘 다 포함.
- 머리글 선택 5쪽 모두 목표 표지 줄이 더 낮은 K1 점수(1–2 대 3)로 다른 줄에 있었다.
- 단어 단위 중복·경계·미배정·빈 단어 0. intake 선택 줄은 두 레코드에 걸치는 혼합 줄이어서 창 폭과 줄 병합의 기여는 분리하지 못했다.
- 후속 우선순위: (1) 표지 줄에서 같은 행의 값까지 닿는 창 규칙(15/20), (2) 머리글·항목명 키 충돌 완화(5/20, repair에 몰림), (3) intake 줄 병합 분리 진단(선택). 모두 새 자료 사전등록이 필요한 가설이다.

## 검증

- `node --test test/ko-window-diagnostic.test.mjs` 18/18, `python -m unittest tools/ko-window-diagnostic/test_recount.py` 13/13.
- 실행 A·B 각각: 원본 pin·freeze·manifest 일치, 저장 K1 = 고정 `k1Select` 재계산 24/24, 등록 검산 15/3/2/4 일치. A/B 바이트 동일. Python 검산 A·B 각 42필드 × 24쪽과 summary 전체 일치. 변조 5종 A·B 모두 거부.
- 제품 검증(저장소 루트): `npm ci --ignore-scripts`, `build`, `test`(60 파일, 4639 통과·5 건너뜀), `typecheck`, `smoke:mcp`, `validate:plugin`, `benchmark` 모두 종료 0. 빌드 뒤 `bin/` 번들은 같은 blob(줄 끝만 다름)이라 그 파일만 되돌렸다. 알려진 main 실패는 재현되지 않았다.

## 하지 않은 것과 이유

- WBS 갱신, 공유 루트 인계서, 제품 코드, 논문: 과제 지시로 범위 밖.
- Argon 교차 확인: 과제 지시(외부 문서 전송 금지)로 실행하지 않았다. "Argon 불가: 외부 전송 금지 지시".
- 새 OCR·추론·GPU·외부 실험 API: 범위 밖, 실행하지 않았다(비용 0원).

## 다음 작업

- PM: Astra 최종 확인(독립 Opus 마일스톤 검토는 완료, 위 상태 참조).
- 사용자: Ready·병합 승인, 후속 연구 후보 선택.
