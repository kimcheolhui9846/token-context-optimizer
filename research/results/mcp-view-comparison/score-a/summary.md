# 제품 MCP 보기 비교: 집계

- 기준 41fc769. 키 576개(셀 12개 × 48). 기하적 포함만 잰다. 판독성·정답률은 미측정
- 셀마다 분모 48. 실패 행도 분모에 남는다

| 표현 | 프로필 | 보기 | 수락 | 성공 | 실패(코드) | 반환 종류 | 포함 complete/partial/평가불가 | tools/call | 파일 읽기 | 예정 원본 | 폴백 원본 | 참조 검증 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| original | strict | original | 0/48 | 0/48 | 48 (unsupported_png_profile 48) | none 48 | 0/0/48 | 48 | 0 | 0 | 0 | 0 |
| original | strict | overview | 0/48 | 0/48 | 48 (unsupported_png_profile 48) | none 48 | 0/0/48 | 48 | 0 | 0 | 0 | 0 |
| original | strict | region | 0/48 | 0/48 | 48 (unsupported_png_profile 48) | none 48 | 0/0/48 | 48 | 0 | 0 | 0 | 0 |
| original | tolerant | original | 0/48 | 0/48 | 48 (unsupported_png_profile 48) | none 48 | 0/0/48 | 48 | 0 | 0 | 0 | 0 |
| original | tolerant | overview | 0/48 | 0/48 | 48 (unsupported_png_profile 48) | none 48 | 0/0/48 | 48 | 0 | 0 | 0 | 0 |
| original | tolerant | region | 0/48 | 0/48 | 48 (unsupported_png_profile 48) | none 48 | 0/0/48 | 48 | 0 | 0 | 0 | 0 |
| rgb | strict | original | 48/48 | 48/48 | 0 (-) | original_verified 48 | 48/0/0 | 96 | 48 | 48 | 0 | 48 |
| rgb | strict | overview | 48/48 | 48/48 | 0 (-) | overview_jpeg 48 | 48/0/0 | 96 | 0 | 0 | 0 | 0 |
| rgb | strict | region | 48/48 | 48/48 | 0 (-) | original_verified 12, crop_jpeg 36 | 47/1/0 | 144 | 12 | 0 | 12 | 12 |
| rgb | tolerant | original | 48/48 | 48/48 | 0 (-) | original_verified 48 | 48/0/0 | 96 | 48 | 48 | 0 | 48 |
| rgb | tolerant | overview | 48/48 | 48/48 | 0 (-) | overview_jpeg 48 | 48/0/0 | 96 | 0 | 0 | 0 | 0 |
| rgb | tolerant | region | 48/48 | 48/48 | 0 (-) | original_verified 12, crop_jpeg 36 | 47/1/0 | 144 | 12 | 0 | 12 | 12 |

## 언어 × 앵커 (각 12)

| 셀 | en·code | ko·code | en·nl | ko·nl | 짝 both/EN만/KO만/neither |
|---|---|---|---|---|---|
| original|strict|original | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/0/24 |
| original|strict|overview | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/0/24 |
| original|strict|region | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/0/24 |
| original|tolerant|original | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/0/24 |
| original|tolerant|overview | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/0/24 |
| original|tolerant|region | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/12 | 0/0/0/24 |
| rgb|strict|original | 12/0/0 | 12/0/0 | 12/0/0 | 12/0/0 | 24/0/0/0 |
| rgb|strict|overview | 12/0/0 | 12/0/0 | 12/0/0 | 12/0/0 | 24/0/0/0 |
| rgb|strict|region | 12/0/0 | 11/1/0 | 12/0/0 | 12/0/0 | 23/1/0/0 |
| rgb|tolerant|original | 12/0/0 | 12/0/0 | 12/0/0 | 12/0/0 | 24/0/0/0 |
| rgb|tolerant|overview | 12/0/0 | 12/0/0 | 12/0/0 | 12/0/0 | 24/0/0/0 |
| rgb|tolerant|region | 12/0/0 | 11/1/0 | 12/0/0 | 12/0/0 | 23/1/0/0 |

칸 값은 complete/partial/평가불가다.

## 부분 누락 행

- `rgb|strict|region|status-cards-code-s1-ko`: 빠진 항목 r3v, 면적비 0.109802
- `rgb|tolerant|region|status-cards-code-s1-ko`: 빠진 항목 r3v, 면적비 0.109802

## 셀 호출

| 셀 | initialize | MCP 요청/응답 | 알림 | tools/list | tools/call | 종료 |
|---|---|---|---|---|---|---|
| original|strict|original | ok | 50/50 | 1 | 1 | 48 | 0/- |
| original|strict|overview | ok | 50/50 | 1 | 1 | 48 | 0/- |
| original|strict|region | ok | 50/50 | 1 | 1 | 48 | 0/- |
| original|tolerant|original | ok | 50/50 | 1 | 1 | 48 | 0/- |
| original|tolerant|overview | ok | 50/50 | 1 | 1 | 48 | 0/- |
| original|tolerant|region | ok | 50/50 | 1 | 1 | 48 | 0/- |
| rgb|strict|original | ok | 98/98 | 1 | 1 | 96 | 0/- |
| rgb|strict|overview | ok | 98/98 | 1 | 1 | 96 | 0/- |
| rgb|strict|region | ok | 146/146 | 1 | 1 | 144 | 0/- |
| rgb|tolerant|original | ok | 98/98 | 1 | 1 | 96 | 0/- |
| rgb|tolerant|overview | ok | 98/98 | 1 | 1 | 96 | 0/- |
| rgb|tolerant|region | ok | 146/146 | 1 | 1 | 144 | 0/- |
