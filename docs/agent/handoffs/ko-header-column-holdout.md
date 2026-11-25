# 인계: ko-header-column-holdout (OCR 열 머리글과 질문 필드의 연결로 W2 적용 여부를 정하는 W4, 새 한국어 12원본 × 12변형)

- 날짜: 2026-11-25 · Task: Orca task_4f9ac9363341 · Tier E · #152 후속(사용자 승인)
- 작업자: Claude Code(Opus 5.5, 연구 작성자이자 구현자). 독립 Python 검산기도 같은 작성자가 썼다.
- 최종 판정: Codex Astra(PM, 최초 계획자)와 PM이 배정한 별도 Opus(원자료 재계산).
- 브랜치 `claude/ko-header-column-holdout`, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. #147·#150·#151·#152는 Git 객체로만 읽는다.
- 문서 위치:
  - 프로토콜: `research/plans/2026-11-25-ko-header-column-protocol.md`
  - 검산 명세: `research/tools/ko-header-column/RECOUNT_SPEC.md`
  - 손계산: `research/tools/ko-header-column/example/example.json`
  - 등록 설계: `research/tools/ko-header-column/design.py`, `registered/`

## 상태

사전등록 단계. 새 자료 렌더, OCR, 채점은 아직 하지 않았다. 이후 단계마다 이 파일을 갱신한다.

## 외부 교차 확인

Argon 미실행: 과제가 사설 자료의 외부 전송을 금지한다(요청서). 독립 검토는 PM 배정 Opus가 맡는다.
