# 새 합성 문서에서 자르기 여백 0 대 4 비교

- Tier E. 기준 `origin/main` `0fb3053`(번들 blob `85b8049`, 선택기 blob `b3b4965`). 2026-11-24
- Orca Task `task_38ea388f9a97`. 연구 담당 Claude Code(Opus 5.5), PM Codex(Astra)
- 범위: 별도 브랜치 `claude/fresh-crop-padding`와 Draft PR까지. 로컬 실행, 실험 API 비용 0원
  - 범위 밖: 외부 OCR·모델, 신규 의존성, 연구 외부 송신, 제품·원고·WBS·기존 연구 파일 변경, 제품 기본값 결정, Ready, merge
- #144는 읽기 전용 참고. 병합하거나 그 위에 쌓지 않는다
- 프로토콜: [research/plans/2026-11-24-fresh-crop-padding-protocol.md](../../../research/plans/2026-11-24-fresh-crop-padding-protocol.md)

## 계획

1. 프로토콜·핸드오프 커밋, push, Draft PR(렌더·OCR·측정 전)
2. 시험 RED(손계산 좌표·모의 응답) → 생성기·수집기·실행기·채점기 GREEN
3. 두 번 생성·렌더, 입력 품질·중복 점검, 입력 동결 커밋
4. 실행 A·B(오프라인 가드), 동결, 채점, A·B 비교, Python 독립 검산
5. 결과표, 게이트 7종, 독립 Opus 마일스톤 검토, Argon 발췌 대조, `fix(review)` 반영
6. PM에 최신 head, 실험 수치, 제한 보고

## 역할과 소유 경로

| 역할 | 주체 | 파일 |
|---|---|---|
| 연구 작성·실행·채점 | Claude Code 메인(Opus 5.5) | `research/plans/*fresh-crop-padding*`, `research/src/fcp-*`, `research/test/fcp*`, `research/results/fresh-crop-padding/**`, 이 파일 |
| 독립 검산기 작성 | 별도 하위 에이전트(채점기 코드 비공개, 명세만 받음) | `research/tools/fcp-recount.py` |
| 계획 검토 | Claude Code `harness-opus-review`(`claude-opus-5-5`) | PM 요청서 단계에서 완료(1차 CHANGES REQUIRED, 재검토 PASS WITH NOTES) |
| 마일스톤 검토 | 독립 Opus 5.5 | 기록만 |
| 최종 판정 | PM Astra | |

다음은 읽기만 한다: 제품, 기존 연구 파일(R09, #141), #144, 원고, WBS.

## 진행

- [x] 프로토콜·핸드오프 커밋 `a9f2320`, Draft PR [#145](https://github.com/kimcheolhui9846/token-context-optimizer/pull/145)
- [x] 시험 RED `3d4e706`(`ERR_MODULE_NOT_FOUND`) → 하네스 `86f67aa`(27/27). 더미 페이지 스모크로 배선 확인
- [x] 두 번 생성 일치(55개 파일), 렌더 실패 0, 중복 0(R09 52장 대조), 입력 동결 커밋
- [x] 실행 A·B `8ead3e9`: 매치 36, 주 지표 p0 35/36 → p4 35/36(효과 없음), 매치 면적 +0.89%p. B는 A와 결정적 필드 모두 동일. 가드 차단 0
- [x] Python 독립 검산(하위 에이전트, 명세만) 2,042건 불일치 0, 변조 2건 검출
- [x] 게이트 7종 종료 0, 연구 테스트 160/160, Argon APPROVE
- [x] 독립 Opus 마일스톤 검토 PASS WITH NOTES(Blocker·Major 0). Minor 2·Nit 1·Note 반영(`fix(review)`)
- [ ] PM 판정
