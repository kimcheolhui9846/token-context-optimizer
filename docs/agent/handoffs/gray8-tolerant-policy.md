# 8비트 회색조 PNG 입력 정책 설계 (gray8-tolerant-policy)

- Tier D 정책 제안. 작성자 Claude Code(`claude-opus-5-5`, Orca 작업자). PM은 Codex(Astra)다
- 기준: `origin/main` `7f11973cee56df8576b827aef9efbacdaffbc6a4`(#141 merge). 착수할 때 로컬 HEAD와 같음을 확인했다
- 작업트리 `gray8-tolerant-policy`, 원격 브랜치 `claude/gray8-tolerant-policy`, Draft PR
- 결정안: [`docs/superpowers/plans/2026-11-24-gray8-tolerant-policy.md`](../../superpowers/plans/2026-11-24-gray8-tolerant-policy.md)

## 목적

[#141](https://github.com/kimcheolhui9846/token-context-optimizer/pull/141)의 연구 결과([`RESULTS.md`](../../../research/results/mcp-view-comparison/RESULTS.md) §1, §5 후보 1)를 따른다. R09 원본 48장(8비트 회색조, color type 0)은 strict·tolerant 모두 `unsupported_png_profile`로 거부되었다. 이 Task는 그 입력을 받을지에 대한 **정책 제안**만 쓴다. 제품 코드는 바꾸지 않는다.

## 범위

- 이 Task에서 바꾸는 추적 파일: 이 문서와 결정안 문서, 두 개뿐이다
- 편집 금지: 제품 코드(`src/`), 테스트, 설정, 번들(`bin/`), 연구 자료와 실험 수치, 원고(`paper/`), WBS
- 구현·설치·Ready·merge는 별도 결정이다. 외부 유료 검토와 실험은 새로 호출하지 않는다
- Argon 교차 확인은 저장소 규칙상 작업마다 하지만, 이번 요청서가 "외부 유료 검토를 새로 호출하지 않는다"고 정했으므로 실행하지 않는다(Argon 불가: 요청서 금지)

## 계획

1. 현행 동작을 소스에서 직접 확인한다: `src/core/image-artifacts.ts`, `image-crop.ts`, `image-overview.ts`, `src/core/types.ts`, `src/server/index.ts`, 관련 테스트
2. 결정안을 쓴다: 권장안, 대안 평가, 반환 계약, 식별자, 재검증, 보기 경로, 구조 검사 보존, 제외 범위, 메모리, 양성·음성·회귀 판정 목록, 미측정 항목
3. 첫 커밋 뒤 Draft PR을 열고, 후속 수정도 같은 PR에 쌓는다

## 검증 (Tier D)

- 두 문서와 소스를 직접 대조한다(결정안 §2의 현행 동작 표에 적은 줄 번호가 기준 커밋과 맞는지)
- 상대 링크가 실제 파일을 가리키는지 확인한다
- `git diff --check`
- 최종 작업트리 상태, 원격 Draft 여부와 head SHA를 확인한다
- 실행하지 않는 것: `npm` 검증 7단계(제품 변경 없음), Argon, 외부 검토, 실험

## 작업 기록

- 2026-11-24 착수: `git fetch` 뒤 HEAD = `origin/main` = `7f11973`, 작업트리 깨끗, git 신원 확인
- 2026-11-24 작성자 사전 확인(일회성, 증거 파일 아님): 설치된 fast-png 8.0.0이 8비트 회색조 PNG를 `channels: 1`, `depth: 8`, `Uint8Array`(픽셀당 1바이트)로 디코드함을 node로 확인했다. 임시 스크립트는 지웠다
- 검증 결과와 PR 번호, head는 완료 보고에 적는다. 이 Task의 자체 검증은 작성자 검증이며, 독립 검토는 PM(Astra)의 최종 판정이다
- 2026-11-24 첫 제출: Draft PR #142, head `9e4ce18c4bfd0dc861c4790102b6d25b1e05127e`
- 2026-11-24 PM(Astra) 1차 판정 CHANGES REQUIRED(Major 2, Minor 3). 결정안에 다음을 반영했다. 범위는 설계 문구와 향후 판정 기준뿐이다
  - Major 1: §9 R7을 추가했다. 구현 단계에서 R09 원본 48장의 SHA를 #141 동결 원본 SHA 표(`FROZEN_INPUTS.originalSha`)와 대조하고, §4 적합성을 확인한 뒤, 패키징된 서버에서 ID별 strict·tolerant 결과를 검증한다. 자료가 없거나 SHA가 다르면 검증 미완료로 적고, 범위 밖 원본은 ID·이유를 정책 결정권자에게 돌려준다. 이 설계의 실측값이 아니다
  - Major 2: §7에 MCP `content`의 실제 JPEG 바이트로 판정하는 기준 1–4(MIME, SHA·`byteLength`, 독립 디코드 치수, R=G=B 통제본의 실제 본문과 동일)를 추가했다. 전체 영역은 이미지 본문이 없고 참조를 열어 SHA를 대조한다. P5·P6을 고치고, R5에 네 도구별 확인 표를, R8에 제품 문서·도구 설명 갱신을 넣었다. #141 실행기의 바이트 대조 위치를 참고로 적었다
  - Minor: §3 B의 "약 3배"를 비압축 샘플 기준으로 고치고, 인코딩된 파일 크기는 배수로 말할 수 없다고 적었다
  - Minor: §2를 inspect 재검증(메타데이터 대조는 tolerant에서만)과 픽셀 경로 재검증으로 나눠 적었다. §6에 바꿀 함수·필드를 지정했고, strict에는 새 요구를 만들지 않으며, N7을 회색조 레코드로 한정했다
  - Minor: P7·N4를 압축이 잘 되는 입력으로 축·총 픽셀·파일 크기 조건을 따로 어기도록 나눴다(예: 4096×4097). P2를 P2a(gAMA·pHYs·tEXt)·P2b(sRGB)·P2c(iCCP)로 나눴다
- 2026-11-24 수정본 Tier D 검증(작성자 자체 검증):
  - §2·§6·§7·§9에 적은 줄 번호를 기준 `7f11973`의 `src/core/image-artifacts.ts`, `research/src/mcp-view-comparison-{paths,lib,run}.mjs`, `docs/image-artifacts.md`, `skills/optimize-context/SKILL.md`, `src/server/index.ts`와 직접 대조했다. 첫 판에서 inspect 범위를 :91-115, 대조 줄을 :107로 적은 것을 :91-114, :106으로 바로잡았다
  - #141 실행기 `paths.mjs`에 `byteLength` 대조가 없음(검색 0건)을 확인하고, 이를 이번에 더하는 기준으로 적었다
  - 상대 링크 3개와 본문에 적은 저장소 경로 5개가 실제로 있음을 확인했다
  - `git diff --check` 종료 0, 두 문서의 제어 문자 0
  - 실행하지 않은 것: npm 7단계(제품 변경 없음), Argon·외부 검토·실험(요청서 금지), R7의 48장 재확인(구현 단계 기준이므로)
