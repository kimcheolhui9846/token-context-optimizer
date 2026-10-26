# 영문 제목·요약·그림표 설명 교정 제안 (2026-10-26)

- 작성: Claude Code, 2026-10-26
- 대상
  - `docs/research/image-first-paper-draft.ko.md` L3(영문 제목), L13(English Abstract), L15(Keywords). 이 PR head `28a71dc` 기준
  - `research/plans/2026-10-21-ieie-captions.md` §2의 영문 설명 7개
- 성격: 읽기 전용 제안. 원고와 설명안은 고치지 않았다. 반영 여부는 사용자가 정한다
- 기준
  - IEIE 규정 6: 영문은 sentence case(문장 첫 글자만 대문자, 고유명사 예외). 규정 5: 제목·요약·그림표 설명 영문 병기(`2026-10-15-ieie-journal-format.md` §1)
  - 영문 용어는 설명안 §3 용어표를 따른다(source-preserving retrieval, simulated compaction, late recall, provider-billed tokens)
  - **수치와 주장 강도는 바꾸지 않는다.** 부정적 결과(비열등성 미입증, Haiku 개선 미지지, Haiku 비용 증가)의 표현을 약하게 만들지 않는다

## 1. 판정

- 문법 오류는 없다. 뜻이 갈리거나 어색한 곳이 요약에 4곳, 설명에 2곳 있다(권장 E-1–E-6)
- 선택 사항 3건(E-7–E-9)
- 고치지 않기를 권하는 것: 제목, Keywords, "experiment 1–3" 소문자(규정 6 sentence case와 맞는다), 용어표의 네 용어

## 2. 권장

| ID | 위치 | 지금 | 제안 | 이유 |
|---|---|---|---|---|
| E-1 | 요약 셋째 문장 | In experiment 1, GPT-4o billed image tokens at detail high matched the public accounting rule in 66/66 cases. | In experiment 1, the image tokens billed by GPT-4o with detail set to high matched the published accounting rule in all 66 cases. | "GPT-4o billed"가 동사(GPT-4o가 청구했다)로도 읽힌다. "detail high"는 API 매개변수라 그대로는 어색하다. "public rule"보다 "published rule"이 국문 "공개 회계식"에 가깝다 |
| E-2 | 요약 넷째 문장 | region selection plus requery of the original (D) reduced input tokens relative to the assigned original (A) by 23.0% for GPT-4o and 43.8% for Haiku 4.5 | region selection with on-demand re-request of the original (arm D) reduced input tokens by 23.0% for GPT-4o and 43.8% for Haiku 4.5 relative to the assigned original (arm A) | "requery"는 사전에 없는 말이다. 국문 "원본 재요청"에 맞춘다. (D)·(A)가 arm 기호임을 밝힌다. 비교 대상을 수치 뒤로 옮겨 문장이 덜 꼬인다 |
| E-3 | 요약 여섯째 문장 앞부분 | non-inferiority against keeping all context was likewise not established | non-inferiority relative to retaining the full context was likewise not established | "against keeping all context"는 구어체다. 본문의 S0(전체 유지)와 같은 뜻으로 맞춘다 |
| E-4 | 요약 여섯째 문장 뒷부분 | GPT-4o’s list-price saving fell to 9.1% after prompt caching, while Haiku cost increased. | the saving for GPT-4o fell from its list-price value to 9.1% once prompt caching was accounted for, and the cost for Haiku 4.5 increased. | "after prompt caching"은 캐시를 켠 뒤 절감이 줄었다는 인과로 읽힐 수 있다. 국문은 "캐시를 반영하면"(계산 기준)이다. "Haiku cost"는 모델 이름이 빠졌다. 굽은 따옴표(’)도 함께 없어진다. 정가 기준 절감이라는 정보(list-price)는 남긴다 |
| E-5 | 요약 끝 문장 | The findings are limited to these providers and conditions. | The findings are limited to the two providers and the experimental conditions. | P-2로 국문을 "두 공급자와 실험 조건에 한정된다"로 줄였다. 영문을 국문에 맞춘다 |
| E-6 | 표 3 설명 | Haiku H4 holds formally, but S2 costs more than S0. Saving rates are computed from unrounded mean session costs | For Haiku 4.5, H4 holds formally, but S2 costs more than S0. Savings are computed from unrounded mean session costs | "Haiku H4"는 가설 이름처럼 읽힌다. "saving rates"는 어색하고 "savings"로 충분하다 |

- E-1–E-5를 다 반영해도 요약 길이는 거의 같다(약 +10단어). 조판 3회차 기준 분량 영향은 없다고 본다(영문 요약 1–2줄 안쪽)

## 3. 선택

| ID | 위치 | 제안 | 이유 |
|---|---|---|---|
| E-7 | 요약·국문 요약 첫 언급 | "Haiku 4.5" → 첫 언급만 "Claude Haiku 4.5" | 고유명사 전체 이름이다. 그림 범례는 이미 "Claude Haiku 4.5"다. 국문 요약에도 같게 적용한다 |
| E-8 | 그림 3·4 설명 | "on 24 held-out sessions" → "over the 24 held-out sessions" | 집계 범위를 나타내는 전치사로 더 자연스럽다 |
| E-9 | 요약 다섯째 문장 | "rose from 13.9% with simulated compaction alone to 81.9% with source-preserving retrieval plus compaction" → "with source-preserving retrieval combined with compaction" | "plus"는 구어체다. 다만 지금도 틀리지 않았다 |

## 4. 고치지 않는 것

- 제목: sentence case이고 콜론 뒤 소문자도 규정 6에 맞는다. 국문 제목과 뜻이 같다
- Keywords: 조판 변환 규칙 R-K가 각 키워드 첫 글자를 대문자로 바꾼다(양식 지시). 원고 Markdown은 그대로 둔다
- "experiment 1–3": sentence case에서 소문자가 맞다. 본문 국문은 "실험 1–3"이다
- "non-inferiority … was not established": 통계 해석상 필요한 표현이다. "not shown"이나 "failed"로 바꾸지 않는다. 비열등성 미입증과 열등 입증을 구분하는 원고 의도를 지킨다
- 표 1·2, 그림 1·2 설명: 고칠 곳이 없다

## 5. 반영할 경우
- 원고 L13과 설명안 §2(표 3, 그림 3·4)를 같은 커밋에서 고친다. 국문 쪽은 E-7만 해당한다
- 수치는 바뀌지 않는다. 다음 조판 회차에서 분량을 다시 잰다

## 6. 교차 확인
- `gemini-4-argon`: APPROVE, 지적 0건. 제안문이 문법에 맞고 국문 뜻을 따르며, 수치와 부정적 결과의 강도를 바꾸지 않는다고 확인했다. 놓친 영문 오류도 없다고 보았다

## 7. 반영 (2026-10-26 사용자 결정: E-1–E-6 반영, E-7–E-9는 반영하지 않음)
- E-1–E-5: 원고 L13 English Abstract를 §2 제안문대로 고쳤다
- E-6: 설명안 `2026-10-21-ieie-captions.md` 표 3 영문 설명을 고쳤다
- 국문은 바뀌지 않았다. 수치도 그대로다
- 다음 조판 회차에 분량을 다시 잰다
- 반영본 교차 확인: `gemini-4-argon` APPROVE, 지적 0건. E-1–E-6만 정확히 반영됐고 수치가 그대로라고 확인했다
