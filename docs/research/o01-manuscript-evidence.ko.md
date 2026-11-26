# 심사본의 주장과 근거 대조

**편집 판단.** 두 공급자에서 단일 질의의 입력 토큰이 줄었다는 결과와 정확도 비열등성을 입증하지 못했다는 결과를 함께 유지한다. 세션의 늦은 회상 개선은 GPT-4o의 특정 두 조건 사이에서 관측됐다. 우선 고칠 곳은 4쪽 그림 2 설명과 7–8쪽 참고문헌 [7]이다. 전자는 결과를 찾는 경로가 불완전하고, 후자는 심사본에 익명 부록 주소가 남아 있지 않다.

기준은 8쪽 D02 심사본(SHA-256 `46b02b000ba667c8568888476101747316c832e0031f27e25917d502f9a5e47c`)과 [공개 원고][ms](Git blob `c22a37b89b083c445f7ba483868aabe7041ddc02`)다. 아래 쪽수는 PDF 쪽수다. 국·영문 초록의 수치, C1–C4와 RQ1–RQ3, 그림 1–4와 표 1–3, 가설별 판정, 제품 적용 범위, 제출 의존성을 골랐다. R01에서 여러 번 등장하는 같은 결과는 묶었다. D02의 기존 조판 점검 34항목과 이번 편집 대조의 단위는 다르다. [R01 근거표][r01] · [D01 정합성 검토][d01] · [D02 검증 기록][d02]

## 초록과 방법을 읽는 순서

| PDF 쪽 · 찾을 구절 | 판단과 편집에 쓸 근거 |
|---|---|
| 1 · 요약 / Abstract | **유지.** 양 언어에서 GPT-4o high 66/66, D의 입력 감소 23.0%·43.8%, 두 실험의 비열등성 미입증, GPT-4o 늦은 회상 S1 13.9%·S3 81.9%·S0 93.1%, S2의 캐시 반영 비용 절감 9.1%를 같은 조건에 연결한다. Haiku 4.5에서는 S3−S1 회상 가설이 지지되지 않았고, S2의 캐시 반영 비용이 S0보다 높았다. 아래 가설 행에 비교군·구간이 있다. [실험 1][e1] · [실험 2 GPT][e2g] · [Haiku][e2h] · [실험 3 GPT][e3g] · [Haiku][e3h] |
| 1–2 · DTOC / 표 1 / C2 | **한정.** DTOC·ACM은 텍스트 외부 보관·재조회의 선행 사례이고, ChartQA는 차트 질의응답의 사례다. 표 1은 개입 위치의 정성 비교다. 세 방법에 동일 입력을 넣은 성능 순위나 본 연구의 정확도 검증으로 인용하지 않는다. [DTOC][dtoc] · [ACM][acm] · [ChartQA][chart] · [표 재현 범위][d03] |
| 2–3 · C2 / crop_image_artifact | **한정.** 제품은 텍스트 근거 발췌, 이미지 경로·해시·치수 추적, 호출자 지정 영역 자르기와 전체 개요를 제공한다. 실험은 연구용 OCR 선택기와 원본 재요청을 사용했다. 연구 하네스의 원본 재조회·compact 모사 및 썸네일 결과를 제품의 영구 보관이나 제품 OCR 성능으로 표현하지 않는다. [제품 입력 계약][product] · [연구와 제품 대조][par] |
| 2–4 · C1 / RQ1 / 그림 1 | **유지.** 청구 이미지 토큰은 이미지 입력 시 사용량에서 텍스트만 보낸 기준량을 뺀 값이다. 66개 관측 행(고유 치수·형식 조합 63개)은 격자 49개, 경계 10개, JPEG 재전송 7개다. 그림 1은 대표 격자점 28개다. GPT-4o high는 66/66 공식 일치, 단일 이미지 요청에서 Haiku 실측은 예측보다 매번 3토큰 컸고 별도 토큰 계수값은 실측과 일치했다. 같은 치수 PNG/JPEG 7쌍에서 청구량이 같았다. Gemini 등의 문서 예제 산술은 이 실측에 넣지 않는다. crop의 질의당 사용량은 실험 2의 C·D에서 대조한다. [측정 요약][e1] · [측정 행][e1rows] |
| 2, 4–5 · RQ2 / UNREADABLE | **유지.** 시험에 남겨 둔 이미지 원본군(family) 36개 × 배정 변형 4개 = 공급자·조건당 144질의다. A는 그 질의에 배정된 변형 이미지 그대로(열화 조건이면 열화본), B는 전체 축소·재인코딩, C는 OCR 영역 선택, D는 C와 같은 방식으로 독립 첫 호출 뒤 표지가 있으면 배정 원본으로 최대 한 번 재요청한다. D가 다시 부르는 원본도 질의에 배정된 같은 변형 이미지다. E는 정답 영역을 아는 진단 조건, D′는 개정 전 탐색 규칙이다. [홀드아웃 구성][e2] · [그림 생성 정의][f2] |
| 2, 5–6 · C3 / RQ3 / 8턴 | **유지.** 공급자마다 24개 세션(기존·새 레이아웃 각 12개, 대본 세 종류)에 같은 8턴을 S0→S4 순서로 적용했다. S0 전체 유지, S1 compact 모사, S2 원본 보존 발췌, S3 발췌+compact, S4 전체 축소 유지다. 전체 정확도는 답 내용 일치, 늦은 회상은 6–8턴 내용 일치다. 모의 세션 성적을 사용자의 과제 완수율로 환산하지 않는다. [프로토콜·기록][e3] · [조건별 측정][e3g] |
| 2, 7 · C4 / 결론과 후속 연구 | **유지.** “이 실험에서 정확도 비열등성을 입증하지 못했다.” 실험 3의 Haiku S2−S0 구간 전체는 −5%p 아래였다. 이 관찰을 모든 비교에 적용하지 않는다. 절감·회상 결론에는 공급자, 조건, 단위를 붙인다. [실험 2][e2g] · [실험 3][e3h] |

## 결과표와 그림에서 검증한 비교

아래 두 수치는 별도 표시가 없으면 **GPT-4o, Haiku 4.5** 순서다. 정확도 차이는 퍼센트포인트(%p), 토큰·비용 절감률은 기준 조건 대비 백분율(%)이다. 구간은 95%다. 실험 2는 동일 원본군, 실험 3은 동일 세션을 짝지어 10,000회 재표집했다. 그림의 조건별 오차막대와 표의 조건 간 짝 차이 구간은 서로 다른 양을 나타낸다. [실험 2 분석][e2g] · [실험 3 분석][e3g]

| PDF 쪽 · 항목 | 수치와 비교 | 판정 및 편집 결정 |
|---|---|---|
| 4 · 표 2 H1, D−A | 입력 824→635, 1,361→765 토큰/질의(−23.0%, −43.8%). 정확도 차이 −6.9 [−15.3, +0.7], −4.2 [−13.2, +3.5] %p. | **유지.** 절감률은 반올림 전 입력 합계(각 144질의) 118,724→91,438과 195,960→110,139로 계산했다. 하한이 각각 −5%p를 밑돈다. 토큰 감소만으로 비열등성 기준을 충족할 수 없다. [GPT][e2g] · [Haiku][e2h] · [GPT 채점 행][graw] · [Haiku 채점 행][hraw] |
| 4 · 표 2 H2, D−C | +6.3 [+1.4, +12.5], +9.0 [+2.8, +16.7] %p. | **한정.** 사전등록 개정 1은 H1 결과와 독립적으로 H2·H3을 판정 없는 기술 통계로 지정했다. [개정 1 §8][amend] 정답 건수의 차이(113−104=9건, 111−98=13건)는 재요청 뒤 정답 건수와 같았다. D와 C는 각각 첫 호출을 수행한다. D의 재요청은 A 입력으로 새 호출을 하므로 A 응답 재사용은 탐색 규칙 D′에만 해당한다. [실행 코드][call] [GPT][e2g] · [Haiku][e2h] |
| 4 · 표 2 H3, C−B | −11.8 [−22.9, −2.1], −13.9 [−25.0, −3.5] %p. | **한정.** 같은 평가셋에서 두 공급자의 관측 방향을 기술한다. 모든 질의에서 영역 선택이 전체 축소보다 나쁘다고 해석하지 않는다. [GPT][e2g] · [Haiku][e2h] |
| 4–5 · 그림 2 / 재요청 | D의 총 입력은 91,438÷144와 110,139÷144다. 155·160은 API 호출 수다. 재요청은 11/144·16/144, 재요청 후 정답은 해당 사례 중 9/11·13/16이다. | **유지.** x축은 재요청을 포함한 질의당 합계의 평균이다. 재요청 뒤 정답 비율을 전체 개선율로 쓰지 않는다. [그림 집계][f2] · [GPT 결과][e2g] · [Haiku 결과][e2h] |
| 4 · 그림 2 “값은 표 2를 따른다” | 표 2에는 사전등록 짝 비교와 A·D 입력 평균이 있다. B·C·E·D′를 포함한 조건별 좌표, 개별 오차막대까지 제공하지 않는다. | **수정 제안.** 익명 보충자료 [7]에 실제 분석표를 제공하면 “조건별 정확도와 질의당 평균 총 입력 토큰은 보충자료의 실험 2 분석표에, 사전등록 짝 비교는 표 2에 제시했다”로 쓴다. 조건별 구간은 채점 행과 그림 코드에서 재현한다. 보충자료를 제공할 수 없으면 A–E·D′의 좌표를 그림 안 작은 표로 표기하고 국·영문 설명에서 그 표를 가리킨다. [GPT 좌표][e2g] · [Haiku 좌표][e2h] · [그림 코드][f2code] |
| 5–6 · 표 3 H1 / 그림 3 | S2−S0 정확도 −4.7 [−8.9, −0.5], −13.0 [−17.2, −8.3] %p. 입력 23,295 대 33,892 및 56,696 대 46,143 토큰/세션. | **유지.** 정확도 하한 >−5%p와 S2의 입력 감소가 모두 필요했다. GPT는 입력 조건만 충족했고 Haiku는 둘 다 충족하지 못했다. [GPT][e3g] · [Haiku][e3h] · [GPT 세션 평균][gavg] · [Haiku 세션 평균][havg] |
| 5–6 · 표 3 H2 / 그림 4 | 늦은 회상 S1−S0는 −79.2 [−88.9, −69.4], −20.8 [−29.2, −12.5] %p. | **유지.** 두 공급자 모두 상한 <0. 이 대본·요약 일정에서 compact 모사 단독의 늦은 회상이 전체 유지보다 낮았다. [GPT][e3g] · [Haiku][e3h] |
| 5–6 · 표 3 H3 / 그림 4 | 늦은 회상 S3−S1은 +68.1 [+58.3, +77.8], +1.4 [−15.3, +18.1] %p. GPT의 S1·S3·S0는 13.9%·81.9%·93.1%. | **한정.** 하한 >0은 GPT만 충족. GPT의 S3 점추정치는 S0보다 낮았다(59/72 대 67/72). S3−S0는 사전등록 짝 판정 대상 밖이다. Haiku에 같은 방향의 효과가 입증됐다고 쓰지 않는다. [GPT][e3g] · [Haiku][e3h] |
| 5–6 · 표 3 H4 / 비용 패널 | S0 대비 S2의 정가→캐시 반영 절감률은 28.5%→9.1%, −33.0%→−266.4%. GPT의 S3 캐시 반영 절감률은 3.5%. | **한정.** H4는 기술 비교다. 음의 절감률은 비용 증가다. 실제 사용량에 2026-10-18 확인 가격·캐시 배율을 적용한 USD/세션으로, 반올림 전 평균으로 계산했다. 현재 가격이나 서비스 청구서 총액으로 읽지 않는다. [GPT][e3g] · [Haiku][e3h] |

## 인과 해석과 재현 범위

| PDF 쪽 · 찾을 구절 | 근거 및 편집 결정 |
|---|---|
| 5–7 · 출력 상한 / 고정 순서 | **한정.** Haiku의 일반 답변 상한은 S0·S1·S4에서 60, 도구 조건 S2·S3에서 512다. 요약 상한은 400이며 Haiku S1·S3에서 각각 24/48·1/48회 상한 종료가 기록됐다. GPT-4o 일반 답변 상한은 60이다. 유효 호출 1,453건에는 종료 사유가 없고 완료 토큰이 60인 응답은 S2 18건·S3 22건이다. 이 기록으로는 답변이 잘렸는지 알 수 없다. GPT 요약의 최대 완료 토큰은 213으로 상한 400보다 낮았다. Haiku S1 일반 답변은 2/192건이 상한에서 끝났다. 절단이 정확도에 미친 영향은 별도로 식별되지 않았다. 각 조건은 같은 순서로 실행했다. 같은 시도의 이전 요청만으로 설명되지 않는 캐시 읽기가 Haiku S1 24/24·S3 5/24 시도와 GPT S1의 2턴 호출 14/24에서 관측됐다. 캐시의 출처와 순서·예산의 독립 효과는 미측정이다. [종료 사유 검산][vfix] · [순서·캐시 통제 후속 설계][r06] |
| 6 · 논의와 한계 | **한정.** 사후 감사에서 저장 응답 60/1,920개를 두 모델이 확정 정답 45개·유보 8개·유보 없는 오답 7개로 분류했다. 별도로 층화 추출한 요약 24/192개 중 직전 답변의 목표 사실 1개를 평가할 수 있던 것은 22개였고 22개 모두 보존됐다. 나머지 2개는 판정 불가다. 기록 텍스트의 육안 절단 흔적에 대한 두 모델 판정은 응답 1/60·요약 2/24건이었다. 이는 종료 원인의 판정과 구분한다. 두 모델 판정자의 응답 주분류 일치는 60/60, 요약 판정 일치는 24/24였고 사람 판정과 대조하지 않았다. 이 결과를 모든 사실의 보존율이나 사람의 늦은 회상 정확도로 인용하지 않는다. [표집·판정 근거][r03] |
| 3, 7 · JPEG / 첫 발췌 | **한정.** 연구 JPEG 고유 458개(배정 슬롯 648개)는 당시 엄격 입력에서 모두 거부되고 선택적 관용 입력에서 모두 수용됐다. 실험 1 JPEG 7개는 보존되지 않아 비교 범위 밖이다. 고정 질의 231개의 첫 발췌는 모두 같았고 식별자 동점 11개에 두 번째 발췌가 더해졌다. 홀드아웃 식별자 24개 중 근거줄을 담은 질의 수가 첫 발췌 기준 20개, 반환된 모든 발췌 중 하나 이상 기준 24개였다. 모델 정답률은 다시 측정하지 않았다. [JPEG 집계][jpeg] · [발췌 집계][excerpt] |
| 7–8 · 참고문헌 [7] / “anonymized URL to be fixed before submission” | **제출 전 수정.** [7] 설명은 7쪽에서 시작하고 8쪽에서 주소 자리표시자로 끝난다. D03은 표 3개·그림 4개를 만드는 로컬 재현 패키지다. 제출처가 익명 보충자료를 허용하면 배포 승인과 익명성·라이선스 조건을 확인한 뒤 고정 링크를 넣고 로그아웃 접근 및 페이지 나눔을 확인한다. 보충자료를 허용하지 않으면 본문에서 독자가 확인할 수 있는 근거로 [7] 인용을 조정한다. 교수 피드백 수신과 공식 송부는 별도 단계다. [재현 패키지 안내][d03] · [조판 기록][d02] |

## 원고 이후의 한국어 표 실험과 제품 시험

다음 행은 **심사본에 없는 후속 자료**다. 6–7쪽 논의에 문구를 넣을지 판단할 때만 사용한다. 후속 #160·#162는 #158의 시각 질문 표 3개를 재사용한다. #158 전체의 새 표 18개와 그중 세 표의 파생 이미지를 중복 집계하지 않는다. 같은 표에서 파생된 레이아웃·이미지·선택 사례를 독립 독자나 독립 문서 수로 합산하면 안 된다.

| 자료 | 비교 단위와 관찰 | 원고·제품에 허용되는 해석 |
|---|---|---|
| [#156 원고 대조][p156] | 한국어 표 관련 기존 근거의 편집 검토. | **유지.** 근거 위치를 알려 주는 자료이며 새 측정치는 없다. |
| [#157 모의 판독][p157] | 관리자 자료를 열람했다고 기록한 공개·비맹검 AI 모의 응답 18문항에서 불확실한 7개를 사후 선정했다. 5개에서 두 머리글이 다시 보였고 W1 배정 2개는 그대로였다. | **한정.** 사람의 판독 정확도나 전체 표의 복원율은 추정할 수 없다. |
| [#158 별도 합성 표][p158] | 새 표 18개 중 시각을 묻는 표 3개만 복원 기회였고 3개 모두 머리글이 복원됐다. 별관 기록이 있는 표 6개에서는 복원 규칙이 작동하지 않았다. | **한정.** 관측한 세 사례는 보고할 수 있다. 별관 기록이 있는 표에서의 안전성 판정은 보류한다. |
| [#160 배치 진단][p160] | 원본 표 3개에서 만든 15개 이미지 중 숫자가 제목과 같은 높이에 놓인 유효 배치 6개에서 규칙 실제 적용은 0개였다. 18픽셀 아래 배치에서 실제 OCR이 적용한 2개는 겹침 때문에 유효한 시험이 아니었다. | **보류.** 고정 배치에서의 보호 여부와 선택기의 실제 규칙 적용을 따로 적는다. 사전등록 안전성 결론은 미결이다. |
| [#162 짝 비교][p162] | 같은 원본 표 3개 × 6버전 = 18이미지·9쌍. 5쌍은 양쪽 적용, 4쌍은 양쪽 미적용. 구분선을 옮기고 별관 숫자를 심은 유효 배치 6개 중 한 원본의 2개에서 규칙이 작동했다. 기본 화면→전체 폭 띠→두 제목 창 순으로 방해 숫자 89의 잉크 277픽셀 중 0→143→0픽셀이 보였다. 다섯 정답 단서는 모두 보존됐다. | **한정.** 픽셀이 보이는 현상을 관찰했다. 숫자를 읽을 수 있는지, 실제 답변이 맞는지, 토큰이 줄었는지는 이 비교로 판단할 수 없다. |
| [#163 제품 회귀 시험][p163] | 통제한 두 입력에서 읽기 후 메타데이터 변경과 일반 읽기 실패가 각각 지정한 오류로 분류되고 저장 건수가 모두 0인지 검사했다. | **한정.** 제품의 오류 처리에 대한 시험이다. 논문 정확도·비용 근거로 인용하지 않는다. |
| [#159][p159] · [#161][p161] | 작업 종료·체크아웃 정리 절차를 기록한 관리 문서. | **제외.** 실험이나 제품 성능의 표본에 넣지 않는다. |

**논의에 넣을 수 있는 문장.** “후속 합성 한국어 표 실험에서 구분선을 6픽셀 내리고 별관 숫자를 심은 유효 배치 6개 중 한 원본에서 파생한 2개에만 복원 규칙이 적용됐다. 두 배치 모두 열 제목 부분만 복원하자 전체 폭 복원에서 보이던 별관 숫자 잉크 143픽셀이 0으로 줄었고 다섯 정답 단서가 보존됐다. 사람의 판독 정확도, 모델 답변 정확도, 토큰 사용량은 측정하지 않았다.” 심사본 수정 여부는 저자 피드백에 따른다. 이 문장은 현재 토의 후보다. [짝 비교 원자료][p162]

**피드백을 받으면 다시 열 항목.** 그림 2의 국·영문 설명과 [7]의 제공 방식을 먼저 확정한다. 인과적 회상 효과를 주장하려면 예산·순서를 통제한 비교가, 판독 개선을 주장하려면 독립 독자의 맹검 응답이 필요하다. 이러한 결과를 전제로 한 문구는 보류한다. 이 대조표는 O01의 사전 작업이며 최종 수정이나 교수 송부를 기록하지 않는다. [통제 설계][r06] · [재현 패키지][d03]

[ms]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md
[r01]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/r01-claim-evidence-map.md
[d01]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/d01-claim-alignment.md
[d02]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/d02-ieie-typesetting/summary.json
[d03]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/d03-reproduction-guide.md
[product]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/image-artifacts.md
[par]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/r08-research-product-parity.md
[e1]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/rq1-sweep-001/summary.md
[e1rows]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/rq1-sweep-001/rows.jsonl
[e2]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/exp2-heldout/README.md
[e2g]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/exp2-heldout/gpt4o/exp2-analysis.md
[e2h]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/exp2-heldout/haiku/exp2-analysis.md
[f2]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/figures/exp2/README.md
[f2code]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/figures/exp2_figures.py
[e3]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/s3-heldout/README.md
[e3g]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/s3-heldout/gpt4o/analysis.md
[e3h]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/s3-heldout/haiku/analysis.md
[vfix]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/paper-review-fixes/README.md
[r06]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/plans/2026-11-22-r06-order-cache-design.md
[r03]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/r03-error-audit/README.md
[jpeg]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/r08-parity/jpeg-summary.json
[excerpt]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/r08-parity/excerpt-summary.json
[p156]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/e43145156656ef7f090f8de3bb7c6f316bbb33ae/docs/research/ko-table-manuscript-evidence.ko.md
[p157]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/8200c01fd2bb14e8b2463bd3e4b2a418c6ed0157/docs/research/evidence/ko-mock-abstention-audit/README.md
[p158]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/221db060ecbc44ae9ff61ab5df9c0dfe73d2baf2/research/results/ko-fallback-header-holdout/measures.json
[p159]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/1a8f40d376e6a11b81ba4bc8b0e7f611753692c9/docs/agent/handoffs/task-worktree-cleanup.md
[p160]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/e1e75b79b080e615867ab8fd4089f4f419758e84/research/results/ko-header-window-safety/results.json
[p161]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/e323f96d441276f52d0529c31d5ed7a08c2b93dd/docs/agent/handoffs/task-worktree-cleanup.md
[p162]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/840e61ac3aff35c09b4e37ac53ad9e24bad9d318/research/results/ko-header-rule-pairs/results.json
[p163]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/3c32d64c86c4dd5b0fe818d51f7bb39e8094c7df/docs/agent/handoffs/image-read-error-classification.md
[dtoc]: https://arxiv.org/abs/2609.26121
[acm]: https://arxiv.org/abs/2607.23809
[chart]: https://aclanthology.org/2022.findings-acl.177/
[amend]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/plans/2026-10-16-experiment2-preregistration-draft.md
[graw]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/exp2-heldout/gpt4o/graded.jsonl
[hraw]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/exp2-heldout/haiku/graded.jsonl
[gavg]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/s3-heldout/gpt4o/summary.json
[havg]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/s3-heldout/haiku/summary.json
[call]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/src/run.mjs
