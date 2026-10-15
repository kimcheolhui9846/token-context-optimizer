# s-1: Task 33 probe 출력의 독립 decode (sharp)

- 실행: 2026-10-15, Claude Code. 명령: `node src/s1-sharp-decode.mjs --probe-root ../../task-33-transform-probe`
- 대상: Task 33 probe(PR #34) 출력 JPEG 40개(jpeg-js 0.4.4 encoder, q50 24셀·q75 16셀)
  - 증거 JSON SHA-256 `f2ad655e…6912d`, runId `2026-10-14T14-53-45-225Z-eb741875`
  - probe worktree는 읽기만 했다.
- 독립 decoder: sharp 0.35.4(libvips 8.18.6, 내장 mozjpeg `0826579`)
  - jpeg-js와 코드를 공유하지 않는다.
- 원자료: `results.json`(셀별 통계, 환경), `table.md`(셀별 표)

## 질문

Task 33 메모 §8의 한계: "validator와 재디코더가 jpeg-js를 공유하므로 독립 codec 검증이 아니다."
jpeg-js가 만든 출력을 다른 구현의 decoder가 같은 이미지로 읽는가?

## 결과

| 항목 | 결과 |
|---|---|
| 파일 SHA가 증거 JSON과 일치 | 40/40 |
| sharp(`failOn: "error"`) decode 성공 | 40/40 |
| 치수가 셀 치수와 일치(sharp, jpeg-js 둘 다) | 40/40 |
| 입력 패턴 재생성 RGB 해시가 증거와 일치 | 40/40 |
| sharp 대 jpeg-js decode 차이(채널값) | 최대 3, 평균 ≤ 0.55, 완전 동일 3셀 |
| 원본 대비 PSNR, q50 | sharp 21.0–52.9 dB, jpeg-js 21.0–49.9 dB |
| 원본 대비 PSNR, q75 | sharp 24.4–52.9 dB, jpeg-js 24.4–52.9 dB |
| 큰 셀(긴 변 ≥ 1024, 16셀)에서 두 decoder의 PSNR 차 | 최대 0.014 dB |

- PSNR 범위가 넓은 것은 입력 패턴 차이(평탄, 경계, 잡음)와 셀 크기 때문이다. 원본과 같아 PSNR을 정의할 수 없는 셀이 품질마다 1개씩 있다(1×1 평탄).
- 두 decoder의 차이는 역DCT와 색 변환의 반올림 차이 수준이다. 최대 3 단위다.

## 해석

- jpeg-js 출력은 독립 구현(mozjpeg)에서도 오류 없이, 같은 치수로, 사실상 같은 pixel로 읽힌다.
- Task 33 메모 §8의 "공유 codec" 한계는 **decode 쪽에서** 해소된다. 이번 40개 출력과 이번 두 decoder 범위에 한한다.
- 남는 한계
  - encoder는 jpeg-js 하나다. sharp encoder 출력과의 bytes·화질 비교는 하지 않았다. DQT 일치만 PR #34 리뷰에서 관측했다.
  - q50 → decode → q75 연쇄는 검사하지 않았다.
  - 모델 정확도와 청구 토큰 영향은 이 검사의 범위가 아니다.
  - 공급자(OpenAI, Anthropic) 서버의 decoder는 알 수 없다.

## 후속

- Task 33 메모 §8과 논문 재현성 절에 이 결과를 인용한다. 인용은 Codex 문서 Task 범위이고, 시점은 사용자가 정한다.
