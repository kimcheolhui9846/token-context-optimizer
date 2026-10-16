# 플러그인 스킬의 compact 연동 규칙 설계 (근거 포함)

- 작성: Claude Code, 2026-10-16. 상태: **초안, 사용자 확인 뒤 Codex Task 40으로 요청**
- 목적
  - 사용자 원래 목표("compact·superpowers와 함께 토큰을 절감하는 플러그인") 중 compact 쪽이 제품에 비어 있다.
  - 현재 `skills/optimize-context/SKILL.md`(main)에는 Superpowers 연동 절만 있고, compact 규칙은 없다.
  - 논문 A안 핵심 주장("compact 보완")과 기여 C2("규칙을 가진 플러그인")를 제품 문서와 맞춘다.
- 범위: 스킬 문서(SKILL.md) 규칙만 다룬다. 코드 변경은 없다. 관련 코드 개선은 Task 36(crop + overview)과 Task 39(동점 일치)에서 따로 한다.

## 1. 근거 요약

| # | 관찰 | 수치 | 출처 | 근거 수준 |
|---|---|---|---|---|
| E1 | compact만 하면 늦은 회상을 잃고, 원본 참조와 재조회로 되찾는다(GPT-4o) | 늦은 회상 S1 14% → S3 82% | `results/s3-heldout/README.md` §1(H2·H3) | 사전 등록 held-out |
| E2 | 같은 회복이 Haiku에서는 없다 | S1 72% → S3 74%(H3 지지 안 됨) | 같음 | 사전 등록 held-out |
| E3 | compact 뒤 원본이 없으면 모델이 판독 불가라고 답한다 | GPT-4o S1 UNREADABLE 108회 | `results/s3-heldout/gpt4o/summary.json` | held-out 기술 |
| E4 | 그러나 잘린 이미지가 근거를 놓친 경우에는 판독 불가라고 하지 않는다 | GPT-4o: C 오답 12건 중 UNREADABLE 0건 | PR #37 `results/exp2-cal-gpt4o/README.md` | calibration(탐색) |
| E5 | 기록 편집(이미지 비우기, compact)은 프롬프트 캐시 접두부를 깬다 | 캐시 토큰 S0 18,773 대 S2 2,645 / 절감 정가 −28.5% 대 캐시 −9.1% | `results/s3-dev-002/README.md`, `results/s3-heldout/README.md` §1 H4 | 개발 + held-out |
| E6 | 일괄 비우기의 캐시 효과는 따로 떼어 재지 않았다 | 캐시 기준 절감 −15% → −12%(썸네일 추가와 함께 바뀜) | `results/s3-cal-002/README.md` | calibration(분리 안 됨) |
| E7 | crop과 함께 저해상도 전체 썸네일을 주면 전체 이미지 질문의 조용한 오답이 줄었다 | 늦은 회상 67% → 89% | 같음 | calibration(탐색) |
| E8 | 식별자만으로 질의하면 같은 식별자가 든 다른 줄이 나온다 | 질문 문장 질의 99/99 대 식별자 질의 27/33 | `results/excerpt-bench-001/README.md` | 결정적 벤치 |
| E9 | 플러그인을 쓰면 compact가 필요해지는 시점이 늦어진다 | 4,000토큰 초과 턴: GPT-4o S0 112/192 대 S2 0 / Haiku 160 대 52 | `results/s3-heldout/*/summary.json` | held-out 기술 |
| E10 | 짧은 세션과 프롬프트 캐시에서는 도구 왕복 비용이 절감을 넘을 수 있다 | Haiku S2 입력 토큰 56,696 대 S0 46,143, 호출 18.5 대 8.0 | `results/s3-heldout/README.md` §2 | 사전 등록 held-out |
| E11 | compact 요약에 artifact id 목록을 넣으라고 지시했다 | 실험 3 `COMPACT_PLUGIN` 프롬프트 | `src/session-harness.mjs` | 설계(실험에 쓴 규칙) |

## 2. 규칙 문안 초안 (SKILL.md에 넣을 영어 문안)

"## Compaction Integration" 절을 새로 만든다. 문안은 Codex가 다듬되, 근거보다 강한 표현으로 바꾸지 않는다.

1. **Index before you need to compact.** When a large log, document scan or screenshot arrives, index it (`index_artifact` / `index_image_artifact`) and keep its artifact id and title in the conversation. Answer from excerpts instead of keeping the full payload in context. *(E9)*
2. **Keep artifact ids through compaction.** When compacting (manual `/compact`, automatic compaction, or a summary handoff), instruct the summary to list every artifact id and what it contains, so the artifacts can be queried again. Example instruction: "List every artifact id mentioned so the artifacts can be queried again." *(E11, E1)*
3. **Re-query after compaction for exact values.** After a compaction, do not answer exact values (numbers, codes, ids, times, table cells) from the summary. Query the artifact again by id. *(E1, E3)*
4. **Drop tool-returned images in batches, not every turn.** Removing earlier tool results from the history invalidates the provider's prompt-cache prefix. If you prune tool images, do it at compaction points and keep a text reference (artifact id, crop region) in their place. Do not expect the full list-price saving when prompt caching is active. *(E5, E6: the batch effect was not measured on its own.)*
5. **Do not rely on the model to report an unreadable crop.** A crop that misses the target often yields a confident wrong value, not "unreadable". When the crop text does not visibly contain the asked field, or the question is about the whole image (largest, count, layout), look at an overview or the original. *(E4, E7)*
6. **Write excerpt queries with context words.** Query with the field name and the identifier ("posted invoice INV-123 batch"), not the identifier alone. If the excerpt does not contain the field you asked for, re-query or read the source. *(E8. Until Task 39 lands, the server returns one excerpt per query.)*
7. **Skip the tools for small artifacts and short sessions.** Each tool round resends the history. For artifacts that fit comfortably and sessions that will not reach compaction, reading directly can cost less, especially with prompt caching. Effects differ by provider. *(E10, E2)*

- 기존 "Stop Conditions" 절과 함께 쓴다. 충돌하는 문장은 없다.
- 이미지 규칙 5는 Task 36(`crop_image_artifact`, overview 옵션)이 들어오기 전까지 "원본 보기"로만 안내한다. overview 문구는 Task 36 merge 뒤에 바꾼다.

## 3. 쓰지 않을 표현

- "compact를 대체한다" 또는 "정확도를 유지한다"(H1 기각, Haiku 결과)
- 절감률 수치를 일반 사실처럼 쓰기. 스킬에는 수치를 넣지 않고, 근거는 연구 문서 링크로 둔다.
- 특정 제품(Claude Code, Codex)의 compact 동작에 대한 단정. 실험의 compact는 공개 규칙을 재현한 모사다.

## 4. 사용자 결정 항목

| # | 항목 | 권장 |
|---|---|---|
| K1 | 위 7개 규칙을 SKILL.md에 넣는다 | 넣는다 |
| K2 | 근거 수준이 탐색인 규칙(4·5)도 넣는가 | 넣되 "측정되지 않음" 단서를 문서 각주 대신 연구 문서 링크로 둔다 |
| K3 | 순서 | Task 36 뒤, Task 39 앞. 규칙 5·6이 두 Task와 맞물리므로 Task 36 직후가 맞다. 문서 등급이라 짧다 |
