# 6.12 결과의 논문 반영 점검 (2026-11-02, Claude)

- 대상: `docs/research/image-first-paper-draft.ko.md`(main `410cd2f`), 교수님 송부본 `논문초안_교수님송부_2026-10-28.pdf`(같은 문장 확인)
- 6.12 범위: PNG tolerant(6.12a), JPEG tolerant `jpeg-ycbcr8-tolerant-v1`(6.12c, PR #84 `8a149b0`), 문서 정리(6.10, PR #87)
- 이 문서는 점검 결과와 수정 제안만 담는다. 원고는 바꾸지 않았다. 수정은 교차 검토와 사용자 승인 뒤에 따로 반영한다

## 1. 결론

원고에서 6.12와 맞닿는 문장은 하나다. §3.2의 "목표 프로필 `jpeg-ycbcr8-baseline-444-v1`의 실제 encoder 적합성은 검증되지 않았다"(원고 69행)이다. 이제 이 문장은 검증할 수 있고, 검증 결과는 **"충족하지 않음"**이다.

- 실험 2 held-out이 보낸 JPEG 458개(648 slot)를 연구 코드로 다시 만들었다. **458개 모두 기록된 SHA-256과 바이트까지 같았다.** 따라서 아래 판정은 실제로 전송한 바이트에 대한 것이다
- 제품 strict 검증기(`validateJpeg`)는 458개를 **모두** `unsupported_jpeg_profile`로 거부했다
- 원인은 하나다. sharp 0.35.4/libvips 8.18.6 출력에는 **APP0 JFIF 세그먼트가 없다.** strict 프로필은 SOI 바로 뒤에 APP0 JFIF를 요구한다(`src/core/jpeg-validation.ts:38-41`). 같은 바이트의 SOI 뒤에 JFIF 1.01 APP0 하나만 넣으면 458개 모두 strict를 통과했다. 그 밖의 형식(4:4:4, baseline, 단일 scan)은 프로필과 맞는다
- 6.12c에서 추가된 opt-in tolerant 검증기(`validateJpegTolerant`)는 458개 모두 통과했다. 결과는 `baseline`, `1x1,1x1,1x1`이고 무시한 세그먼트는 없다
- **실험 결과에는 영향이 없다.** 목표 프로필은 프로토콜에서 "목표이지 적합성 주장이 아님(미검증)"으로 적혀 있었다(`docs/research/image-first-evaluation-protocol.md:104,152-153`). 연구 경로는 제품 검증기를 거치지 않고 공급자에 바로 보냈다. 그래서 전송 바이트와 정확도·토큰 결과는 바뀌지 않는다. 이 일은 프로토콜 이탈이 아니고, 미검증 항목의 사후 확인이다

## 2. 측정

- 스크립트: `research/src/p612-encoder-profile-probe.mjs <빌드된 checkout>` (API 호출 없음, 읽기 전용)
  - 실험 2: `slots-exp2-heldout.json`의 JPEG slot을 고유 해시 단위로 묶었다. family SVG → clean PNG(`generate.mjs`와 같은 방식) → 조건 변형(`transforms.mjs` `CONDITIONS`) → arm 변환(`armTransform`, `cropTransform`, crop 좌표는 slot `ops`에서 읽음) 순서다. 재현 해시가 기록과 같은 파일만 판정에 쓴다
  - RQ1: JPEG q75 재전송 7장을 `rq1-sweep.mjs`의 `makeImage`와 같은 방식으로 다시 만든다. 당시 파일은 보존되지 않았으므로(`research/results/rq1-sweep-001/README.md:12`), 바이트가 아니라 encoder 설정을 확인하는 것이다
  - 대조: APP0가 없는 파일마다 SOI 뒤에 JFIF 1.01 APP0만 넣고 strict를 다시 돌린다
- 결과: `research/results/p612/2026-11-02.json`. 두 번 실행해 바이트까지 같은 결과를 확인했다(결과 JSON에 시간 값이 없다)
- 제품 빌드: main `410cd2f`(`src/core/jpeg-validation.ts` LF SHA-256 `78e5b1a9…`), Node v24.18.0

| 대상 | 파일 | 바이트 재현 | APP0 | strict | APP0 넣은 뒤 strict | tolerant |
|---|---:|---:|---|---|---|---|
| 실험 2 전체 프레임(B, C·D 미선택) | 144 | 144 | 없음 | 거부 144 | 통과 144 | 통과 144 |
| 실험 2 창 crop(C·D 선택) | 98 | 98 | 없음 | 거부 98 | 통과 98 | 통과 98 |
| 실험 2 oracle crop(E) | 144 | 144 | 없음 | 거부 144 | 통과 144 | 통과 144 |
| 실험 2 조건 변형(A, jpeg-only·combined) | 72 | 72 | 없음 | 거부 72 | 통과 72 | 통과 72 |
| **실험 2 합계** | **458**(648 slot) | **458** | 없음 | 거부 458 | 통과 458 | 통과 458 |
| RQ1 재전송(재생성) | 7 | 해당 없음 | 없음 | 거부 7 | 거부 7(4:2:0) | 통과 7(`2x2,1x1,1x1`) |

- RQ1은 chroma 옵션이 없어 4:2:0이다(N-15). 그래서 APP0를 넣어도 strict 밖이다. 원고는 RQ1 JPEG의 프로필을 주장하지 않으므로 고칠 문장은 없다
- 실험 3의 썸네일·crop도 같은 sharp 옵션(`research/src/session-harness.mjs:172`, `session-anthropic.mjs:100`)이라 APP0가 없을 것으로 본다. 다만 전송 바이트의 해시가 기록되지 않아 검증하지 않았다. 원고는 실험 3 JPEG의 프로필을 주장하지 않는다
- 제품 jpeg-js probe(Task 33)는 APP0를 쓰고 strict를 통과했다(`docs/research/evidence/task-33/README.md:55`). 6.5 측정은 sharp 출력에 APP0를 직접 넣었다. 둘 다 이번 결과와 맞는다. 원고 71행의 "제품 probe의 확인을 연구 encoder의 출력 적합성으로 옮기지 않는다"는 이번 결과로 근거가 생겼다

## 3. 원고 점검 표

| 위치 | 현재 문장(요지) | 6.12 뒤 판단 | 제안 |
|---|---|---|---|
| I장 25행 | 입력 검증·해시·치수 추적(M1a), 프로필과 한계는 [입력 계약]에 기록 | 프로필 목록을 입력 계약에 맡긴다. 입력 계약은 6.12c·6.10에서 네 프로필로 갱신됐다 | 그대로 |
| I장 23행, §3.1 63행 | 제품 `crop_image_artifact`는 평가 대상 아님 | 6.12 뒤에도 같다 | 그대로 |
| §3.2 69행 | 목표 프로필 444-v1의 실제 encoder 적합성은 검증되지 않았다 | **검증됨, 충족하지 않음(APP0 없음)** | **P-1** |
| §3.2 71행 | 제품 probe 확인을 연구 encoder 적합성으로 옮기지 않는다 | 맞는 문장이고, 이제 근거가 있다 | 그대로(P-1과 함께 읽힘) |
| IV장 83행 | JPEG q75 재전송 7쌍 토큰 동일 | 프로필 주장 없음 | 그대로 |
| VII장 한계 | 프로필 언급 없음 | 해당 없음 | 그대로 |

## 4. 수정 제안

### P-1 (원고 §3.2, 69행) — 권장

현재:

> 목표 프로필 `jpeg-ycbcr8-baseline-444-v1`의 실제 encoder 적합성은 검증되지 않았다.

제안:

> 연구 encoder 출력은 4:4:4 baseline이지만 APP0 JFIF가 없어 목표 프로필 `jpeg-ycbcr8-baseline-444-v1`을 충족하지 않았다. 목표 프로필은 실행 조건이 아니었고 연구 경로는 제품 검증기를 거치지 않았으므로 전송 바이트와 결과는 바뀌지 않는다. 실험 2가 전송한 JPEG 458개는 이후 추가된 opt-in 프로필 `jpeg-ycbcr8-tolerant-v1`을 모두 통과했다. [출처: `research/results/p612/2026-11-02.json`]

- 분량: 한 문장(약 60자)이 세 문장(약 230자)으로 늘어 IEIE 2단 기준 약 2줄이 는다. 8면 목표가 빠듯하면 셋째 문장(tolerant 통과)은 빼도 된다. 앞의 두 문장이 사실 정정의 핵심이다
- 영문 초록에는 해당 문장이 없다

### P-2 (프로토콜 문서) — 선택

`docs/research/image-first-evaluation-protocol.md:100-104,152-153`은 사전 등록 문서다. 본문은 바꾸지 않는다. 고친다면 끝에 날짜를 붙인 사후 확인 한 단락만 더한다("2026-11-02 사후 확인: 목표 프로필 미충족, 원인 APP0, 결과 영향 없음, 출처"). 결정 메모(`image-protocol-decision-memo.md:130,147`)의 `[검증 필요]`는 당시 기록이므로 그대로 둔다

### P-3 (송부본) — 다음 송부 때

교수님 송부본 PDF(2026-10-28)에도 69행과 같은 문장이 있다. P-1이 승인되면 다음 hwp 조판 때 반영한다. 이미 보낸 송부본을 따로 정정할 정도의 사안은 아니다(결과 수치와 결론이 바뀌지 않음)

## 5. 제품 쪽 참고 (원고 밖)

- 이번 결과로 "sharp 기본 출력 JPEG는 strict 프로필로 index할 수 없다"는 사용 사례가 확인됐다. 입력 계약은 이미 strict 조건으로 APP0 JFIF를 적고 있다. 제품 동작을 바꿀 필요는 없다. tolerant를 쓰면 받는다
- 문서에 예시 한 줄("APP0가 없는 JPEG(예: sharp/libvips 기본 출력)는 strict에서 `unsupported_jpeg_profile`, tolerant에서는 수용")을 더할지는 Codex 6.4 위생 작업 때 함께 판단할 수 있다. 이번 PR 범위는 아니다

## 6. 교차 확인

- Argon(gemini-4-argon, 2026-11-02): APPROVE, 지적 0. 원고 전문·송부본 PDF·결정 메모 등 번들 밖 파일은 확인 불가로 표시했다. 그 부분은 Claude가 직접 확인했다(원고 전체에서 프로필·JPEG 언급 grep, PDF 텍스트에서 같은 문장 확인). 결과: `codex_review/argon/2026-11-02_612-paper-reflection-result.md`
- Codex: (교차 검토 뒤 적는다)
