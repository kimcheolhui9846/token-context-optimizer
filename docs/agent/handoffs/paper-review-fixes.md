# 논문 초안 지적 수정 (paper-review-fixes)

- 작업자: Claude Code (claude-opus-5-5), 2026-11-13
- 요청: `codex_review/review_2026-11-13_paper-fixes-request.md`(Orca task_766b57708a89). 근거 리뷰 `review_2026-11-11_paper-draft-astra.md` P1–P3와 추가 보완 1–5
- 브랜치: `claude/paper-review-fixes`, base origin/main `5d668f9`. Tier E(보고 수치·그림 포함). 새 실험·API 호출 없음
- 승인 범위: 커밋 → push → Draft PR. Ready·merge·교수님 송부·공개·새 비용 실험은 미승인

## 1. 소유 파일

| 파일 | 변경 |
|---|---|
| `docs/research/image-first-paper-draft.ko.md` | P1–P3, 추가 지적 문장·표 |
| `research/figures/exp2_figures.py` | x축 문구, 라벨 위치만. 데이터·bootstrap 코드 불변 |
| `research/figures/exp2/{heldout,calibration-v2}/fig5_*` | 생성기로 재생성 |
| `research/figures/make_figures.py`, `fig2_heldout_*` | 그림3 라벨 겹침이 확인될 때만 라벨 위치 수정·재생성 |
| `research/figures/exp2/README.md` | 그림 설명 문안의 "호출당" 단위 |
| `research/results/paper-review-fixes/` | 새 재검증 스크립트·결과(JSON)·README |

원자료(`results/*/calls.jsonl`, `graded.jsonl`, 결과 JSON), 사전 등록, 채점 함수, 기존 분석 결과, 실험 조건은 바꾸지 않는다. 제품 `src/`, `scripts/`, `package*`, 루트 README는 다른 worker 소유다.

## 2. 원자료 사전 확인 (2026-11-13, 이 worktree)

- 실험3 출력 한도(`research/src/session-harness.mjs:28-29,80,211`, `session-anthropic.mjs:20,52,134`, 두 `config.json`)
  - GPT-4o: 응답·도구 왕복·자동 원본 호출 모두 `max_tokens` 60, compact 요약 400
  - Haiku: S0·S1·S4 응답 60, S2·S3의 모든 응답 호출 512, compact 요약 400
  - 도구 왕복 최대 3회(4번째 호출은 `tool_choice` none). 두 공급자 같음
- 종료 사유(유효 attempt만, 결과 파일의 `attemptId`로 선택)
  - Haiku 1589호출: S1 compact 24/48 `max_tokens`(턴3 뒤 9, 턴6 뒤 15), S3 compact 1/48(턴6 뒤), S1 응답 2/192(턴4)
  - GPT-4o 유효 1453호출(전체 1460, 중단된 시도 1개의 호출 7건 제외. 리뷰의 "시도 7건"은 호출 7건이다): `finishReason`·`stopReason` 필드 없음
  - 대리 관측: GPT-4o compact 96건의 완료 토큰 최대 213 < 400. 한도에 닿은 요약은 없다. 응답 호출 중 완료 토큰이 60인 것은 S2 18, S3 22건이며 종료 사유는 판정할 수 없다
- **리뷰와 다른 점:** 리뷰 P1은 "저장된 결과파일에는 요약문이 없다"고 적었다. 실제로는 두 공급자의 S1·S3 결과 파일 `turns[].summary`에 요약문 96건씩이 저장돼 있다. 원고에는 "요약문은 저장돼 있으나 정답 소실 대조는 하지 않았다"로 쓴다
- 실행 순서: 하네스가 세션 바깥 루프·조건 안쪽 루프다(`session-harness.mjs` 실행부). `calls.jsonl` 순서도 두 공급자 24세션 모두 S0→S1→S2→S3→S4다
- 실험2 D의 x좌표: GPT-4o 91438/144=634.986, Haiku 110139/144=764.854. 재요청 11·16회라 호출 수는 155·160이다. 그림 x는 질의(행)당 합산 값이다
- 비용(세션 평균, `summary.json`): GPT-4o 캐시 S0 0.0517752, S1 0.0294384, S2 0.0470404, S3 0.0499388(S0 대비 3.55% → 3.5%). Haiku S3 캐시 0.0553304(S0 대비 −272.8%)
- 선택기: 실험2 C·D와 실험3 S2·S3 모두 `selectWindow`(`selector.mjs:81-112`). 신뢰도 임계값은 없고 OCR confidence는 동점 처리에만 쓴다
- 제출 파일: 메인 checkout `paper/`에는 참고문헌 PDF 63개와 README만 있고 HWP·제출 PDF가 없다. 최종 2단 제출본 검증은 NOT RUN이다

## 3. 순서

1. 이 계획 → Argon 초기 교차 확인 → 커밋 → push → Draft PR
2. RED: 재검증 스크립트가 원본 상태에서 실패해야 하는 항목을 확인한다
   - 그림2 x축 문구가 "per call"이다
   - 원고에 출력 한도·종료 분포·S3 비용·고정 순서가 없다
3. 그림: `exp2_figures.py` 문구·라벨 수정 → 두 tag 재생성 → 점·오차막대 좌표 old/new 동일(허용 0) → 라벨 상자 겹침 계산 → PNG 시각 확인
4. 원고: P2 → P3 → P1 → 채점·캐시 순서·선택기 의사코드 → 남은 작업(재현 묶음·공개 주소 TBD)
5. 검증: 재검증 스크립트 GREEN, 링크·표·수식 점검, 제어 문자 0, `git diff --check`, 범위 밖 변경 0
6. 저장소 gate는 coordinator 실행권을 받은 뒤 실행한다(초기 대형 측정은 S-10 몫)
7. Argon milestone 1회 → `codex_review/codex_paste_2026-11-13_paper-fixes.md` → WBS 변경안 보고(저장은 writer 권한 뒤) → worker_done

## 4. 지키는 선

- 토큰 한도 종료가 특정 정답 소실이나 정확도 차이를 설명한다고 쓰지 않는다
- S3 비용은 기존 자료의 기술 통계로만 쓴다. 새 가설·검정처럼 쓰지 않는다
- S3가 S0 늦은 회상 93.1%를 회복했다고 쓰지 않는다
- 순서 효과의 크기·방향을 단정하지 않는다
- 사후 재채점을 하지 않는다
- 선택기를 일반 crop 알고리즘의 우월성으로 확대하지 않는다
- 재현 묶음 DOI·공개 주소는 만들어 채우지 않고 남은 작업으로 둔다

## 5. 진행 기록

- 2026-11-13 계획 Argon 초기 확인(`codex_review/argon/2026-11-13_paper-fixes-plan-argon.md`, 실제 응답 모델 gemini-4-argon): APPROVE, 지적 0. "확인 불가" 3건(자동 원본 호출 60, 하네스 루프, `paper/` 목록)은 발췌에 없던 부분이며 primary가 코드·목록으로 직접 확인했다
- 2026-11-13 Draft PR #112 생성(첫 커밋 `e3ba275`)
- 2026-11-13 재검증 스크립트 `research/results/paper-review-fixes/verify.py`. base 임시 worktree에서 18건 중 4건 FAIL(그림 축 문구, 라벨 겹침, 원고 그림 2 단위, README 단위) → 수정 후 18/18 PASS. 결과 `verify.json`, 설명 `README.md`
- 2026-11-13 그림: `exp2_figures.py`의 x축 문구를 두 줄 질의당 단위로 바꾸고 `place_labels`(겹치면 후보 위치로 이동)를 넣었다. heldout·calibration-v2 fig5만 재생성. 점·오차막대 좌표와 캔버스 동일. fig6 PDF는 날짜만 바뀌어 되돌림. 논문 그림 3(`fig2_heldout_*`)은 라벨 겹침 0건이라 그대로 둠
- 2026-11-13 원고: 초록 국·영(S1→S3, S2 비용 구분, S0 93.1%), 3.2 선택기 의사코드, 표 2·그림 2 단위, 6.2 출력 한도·도구 왕복·실행 순서, 6.3 content-match 정의·한계, 표 3 S1·S3 비용(기술 통계), 6.4 S3 비교, VII 종료 분포·관측 공백·캐시 순서 범위, VIII 재현 묶음 남은 작업
- 리뷰 원문과 다른 사실 2건: 요약문은 결과 파일에 저장돼 있음, 중단된 것은 시도 1개의 호출 7건
- NOT RUN: 최종 2단 제출본(HWP·PDF) 검증. 메인 checkout `paper/`에 제출 파일이 없다
- 2026-11-13 Argon milestone(`codex_review/argon/2026-11-13_paper-fixes-milestone-argon.md`, 실제 응답 모델 gemini-4-argon): APPROVE, 지적 0. 확인 불가로 남긴 YESNO 집합은 `selector.mjs:79`에서 직접 확인했고 원고 출처 줄 범위에 79를 더했다
