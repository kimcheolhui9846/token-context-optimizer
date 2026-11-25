# 인계서 — ko-header-strip-replay (#153 고정 자료 W5 재생, Tier E)

- 과제: Orca task_add5ecc8be49, 요청서 `codex_review/codex_paste_2026-11-25_ko-header-strip-replay.md`(메인 checkout, 최종 독립 검토 보완 포함).
- 브랜치 `claude/ko-header-strip-replay`, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`, Draft PR #154.
- 프로토콜 `research/plans/2026-11-25-ko-header-strip-protocol.md`, 등록값 `research/tools/ko-header-strip/registered.json`, 검산 명세 `research/tools/ko-header-strip/RECOUNT_SPEC.md`, 결과 `research/results/ko-header-strip/RESULTS.md`, 재현 `research/results/ko-header-strip/README.md`.
- 역할: Claude Code Opus 5.5(연구 작성자, 추가 작업자·하위 에이전트 없음). Codex Astra(PM)가 별도 Opus 검토, 원자료 픽셀 대조, 최종 판정을 맡는다.

## 결과 요약

- 사전등록 판정 **pass**(C1–C4). W4 적용 고정 22쪽: 두 띠 20 + 병합 2, 네 항목(목표·경쟁 머리글, 목표·경쟁 값) full 22/22, W4 새 E1 22건 → W5 0, J4 22 → J5 유지 22/22, 다른 레코드 값 재노출 0. 미적용 122쪽은 W5 = W1(치수·픽셀 해시). L5 0/136.
- 면적(원본 페이지 대비 평균 감소 %p): 144쪽 W4 5.01 → W5 원본 4.47(표시 4.37), 22쪽 32.80 → 29.29(표시 28.58), W4 대비 증가 0.54(144) / 3.51(22). 표시 면적이 W1보다 큰 쪽 0.
- 결론은 "이 144쪽 재생에서 W4의 기하적 표시 손실을 없앴다"까지다. 질의응답 정확도·판독성은 재지 않았다.

## 바로 열리는 예시 (원해상도)

- `research/results/ko-header-strip/figures/p003-{page,w1,w4,w5,compare}.png`(정상 L), `p050-*`(좌우 짝 R), `p031-*`(공란), `p067-*`(중복), `p070-*`(K1 실패). 표는 `RESULTS.md` 4절.
- W5 144장: `research/results/ko-header-strip/build-a/w5/p###.png`. 좌표·출처: `build-a/coords.jsonl`, 해시: `build-a/manifest.json`, 읽은 입력: `build-a/inputs.json`.
- 연구자 육안 점검: p003 W5에서 "철수 시각" 아래 19:20, "리허설 시각" 아래 14:40. p050은 열이 바뀌어 "철수 시각" 아래 19:20. 기계 판정(네 항목 full, 표제 출력 [373,6,465,29) / [633,6,725,29))과 맞다. 구분선이 원본 괘선(y 150)과 붙어 두 줄처럼 보이는 것을 관찰했다(판정 무관).

## 시각 기록 (UTC, KST = +9)

| 사건 | 출처 | 시각(UTC) |
|---|---|---|
| 등록 커밋 `a74d266` | Git | 2026-11-25 03:59:16 |
| 등록 push | reflog | 03:59:19 |
| Draft PR #154 생성, `isDraft: true`, head `a74d266` | GitHub | 03:59:30 |
| RED 기록 `8740fde` | Git | 03:59:46 |
| 구현 `3a5b5db`, 조립 코드 수정 `5e9f682`, 검산기 tree 수정 `bd08dda` | Git | 04:09:37 / 04:09:57 / 04:11:49 |
| 조립 A 실행 시작(코드 `5e9f682`) | 셸 | 04:10:02 |
| 조립 동결 `2790824` | Git | 04:12:28 |
| 동결 push | reflog | 04:12:31 |
| 최초 채점 시작 | 채점기 | 04:12:37.787 |
| 검산기 수정 `8d8a9e5`(변조 처리), 결과 커밋 `312e185` | Git / reflog push | 04:18:08, 04:18:09 / push 04:18:11 |
| README 수정 `9123065`(첫 새 클론 재현에서 발견) | Git / reflog push | 04:20:23 / push 04:20:26 |

## 검증

| 항목 | 결과 |
|---|---|
| JS 시험 / Python 시험 | 12/12, 8/8 (등록 후 시험·예제 변경 없음) |
| 조립 A/B | 435 파일 바이트 동일 |
| JS 경로 1 / Python 경로 2 | 144쪽 좌표·W1·W4·W5 픽셀 일치 / 불일치 0, 점수·요약·표 일치(A·B) |
| #153 참조 재현 | W1/W4 엄격·면적·노출·others·J4·읽기 사건 144쪽 일치 |
| 변조 17종 | 모두 기대 범주로 거부, 메타데이터만 바꾼 PNG는 `metadata_only` |
| 새 원격 클론 README 6블록 전체 | `9123065`에서 모든 기대값, clean tree |
| 연구 전체 | `node --test test/*.test.mjs` 145/145, Python `tools/d03`·`tools/ko-header-strip` OK |
| 제품 7단계(새 클론) | `npm ci --ignore-scripts`, build, test(4639 pass, 5 skip), typecheck, smoke:mcp, validate:plugin, benchmark 모두 종료 0. 빌드 뒤 `bin/token-context-optimizer.mjs`가 줄 끝(autocrlf)만 달라 수정됨으로 표시, 내용 diff 없음. 빌드 전 상태는 깨끗했다 |
| Argon | **불가:** 과제가 데이터 외부 전송을 금함(BAZE/Argon 호출 안 함) |
| WBS | 과제 지시로 갱신하지 않음 |

## 최초 채점 뒤 바뀐 것 (출력 불변)

- `recount.py`: 변조 입력이 채점 중 예외를 내면 `input_damaged` 실패로 기록, PNG 청크 분류 기준을 조립기의 표준 집합(IHDR, pHYs, IDAT, IEND)으로. sharp가 `pHYs`(1000 × 1000/m)를 쓰는 것을 이때 확인했다.
- README: sharp 버전 확인 명령, 재채점 요약 비교에서 `buildCommit`도 제외.
- 조립·채점 코드와 `build-a`·`score-a`는 동결 후 바뀌지 않았다.

## 한계와 남은 일

- 검산 저자 = 구현자(같은 세션). 결과를 아는 재생, 12원본 짝지은 설계(22쪽은 11원본), 기하 ≠ 판독.
- PM: 별도 Opus 검토, 원자료·실제 PNG 대조, 최종 판정. 사용자: Ready·merge·제품 적용 결정. 이 PR은 Draft로 둔다.
- 임시 출력(작성자 환경): 스크래치 `khs-run1/`(조립 A/B·채점 A/B 원본), `tmp-repro/`·`tmp-repro2/`(새 클론 재현 두 번). 지우지 않았다.
