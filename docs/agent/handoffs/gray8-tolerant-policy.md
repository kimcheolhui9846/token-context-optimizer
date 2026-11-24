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
