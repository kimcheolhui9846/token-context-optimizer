# 8비트 회색조 PNG tolerant 구현 핸드오프

- Task: `gray8-tolerant-implementation` (Orca task `task_6458c211ec1e`)
- 브랜치: `claude/gray8-tolerant-implementation`, 기준 main `e46f75ecc47e7be54af83c244cc4f888d4b3345e`
- 근거: 승인된 결정안 `docs/superpowers/plans/2026-11-24-gray8-tolerant-policy.md` §4–9 (#142), 2026-11-24 사용자 승인 구현 요청서
- 역할: Codex Astra = PM·최종 판정, Claude Code(Opus 5.5) = 개발 책임자(코어·MCP·커밋·push), 문서 초안은 Sonnet 하위 작업자 가능, 마일스톤 검토는 별도 Opus 5.5 세션
- 범위: Tier C 제품 코드·테스트·문서, Draft PR까지. 설치·배포·버전 변경·논문·WBS·연구 결과 수정은 범위 밖

## 0. 착수 전 확인

- 독립 Opus 계획 검토: 요청서에 기록된 대로 `harness-opus-review`(반환 모델 `claude-opus-5-5`) 1차 CHANGES REQUIRED → 수정 계획 PASS(blocker 0·major 0·minor 0·note 2). 별도 파일은 `codex_review/`에서 찾지 못했고 요청서 본문을 근거로 삼는다. 두 note(32종 수락/33종 거부, 색 관리 밝기 차이 문서화)는 인수 기준에 넣는다
- R7 기대표 `sssk/.artifacts/gray8-tolerant-implementation/r7-expectations.json` SHA-256 `ac96696a…f313` 일치 확인(작업 시작 시 `sha256sum`)
- R7 입력 `mcp-view-comparison/research/out/mvc-pmfix/prep/input/images/original` 48장 존재 확인

## 1. 구현 계획 (파일 소유)

| 영역 | 파일 | 변경 |
|---|---|---|
| 코어·타입 | `src/core/types.ts` | 다섯 번째 레코드 변형 `png-gray8-tolerant-v1`, `channels: 1`, `alpha: "none"`, `ignoredChunks` |
| | `src/core/image-artifacts.ts` | tolerant IHDR에서 color type 0 허용(치수 검사 뒤, 비트깊이 8만), 레코드 생성, `isTolerantProfile`, `validateForRecord`(프로필로 먼저 분기), `recordMetadataMatches`(밀집 배열 기준 대조) |
| | `src/core/image-crop.ts` | 부분 crop에서 g → (g,g,g,255) 작업 버퍼 |
| | `src/core/image-overview.ts` | 1채널 면적 평균, 현행 반올림식, 출력 (v,v,v,255) |
| MCP | `src/server/index.ts` | `imageOutputSchema` 다섯 번째 객체 추가(기존 네 객체 불변), 세 도구 설명 |
| 문서 | `docs/image-artifacts.md`, `skills/optimize-context/SKILL.md`, `README.md`의 지원 목록 | 새 프로필, 추가 스키마, 색 관리 무시와 밝기 차이 |
| 번들 | `bin/token-context-optimizer.mjs` | `npm run build` 산출물 1회 |

## 2. 판정 매핑 (P/N/R → 증거)

작성 중. 구현·검증 후 실제 테스트 이름과 결과로 채운다.

## 3. 검증 기록

작성 중.

## 4. 남은 위험

작성 중.
