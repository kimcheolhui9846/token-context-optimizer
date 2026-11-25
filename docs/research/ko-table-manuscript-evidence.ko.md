# 한국어 표 후속 실험이 뒷받침하는 원고 문장

D02 심사본의 초록과 실험 결과는 현행 표현을 유지한다. 한국어 합성 표에서 새로 확인한 것은 **같은 행의 두 값이 어느 열에 속하는지 알려 주는 머리글의 표시 여부**다. 이 관찰을 원고에 반영한다면 6쪽 Ⅶ장 ‘논의와 한계’가 적절하다. 아래 쪽수는 최종 PDF 기준이며, 원문 링크는 이에 대응하는 공개 초안에 고정했다. [D02 조판 기록][d02]

| PDF 위치와 원문 발췌 | 대조한 근거와 해석의 한계 | 편집 권고 |
|---|---|---|
| 1쪽 국문·영문 초록. “두 공급자 모두 정확도의 비열등성은 입증되지 않았다” · “accuracy non-inferiority was not established for either provider” [국문][abstract-ko] · [영문][abstract-en] | 원래 비교는 영역 선택 뒤 필요 시 원본을 재요청한 조건과 배정 원본 조건의 모델 응답을 대상으로 했다. 한국어 표 재생은 같은 이미지의 다른 표시 방식을 비교했다. [실험 2 결과][exp2] · [재생 설계][replay] | 두 초록의 비열등성 문구와 토큰 절감률의 귀속을 유지한다. |
| 1쪽 Ⅰ장. “질문에 맞춘 축소가 답을 결정하는 증거를 지울 수 있다.” [원문][intro] | W4가 행 범위를 좁힌 합성 표에서는 목표 값과 같은 행의 경쟁 값이 함께 남았지만, 두 열의 제목이 잘렸다. 원고의 위험을 보여 주는 구체적인 사례이며, 관찰한 변환은 행 자르기다. [W4 결과][w4] | 서론을 유지한다. 이 사례를 인용할 때는 ‘잘린 표에서 열 제목이 사라졌다’로 변환과 손실을 특정한다. |
| 2쪽 Ⅰ장. “이 실험은 연구용 OCR 선택기 경로를 평가했으며 제품 이미지 도구를 평가하지 않았다.” [원문][product] | W5는 연구용 선택기의 고정 예측과 원본 픽셀을 사용해 표시 이미지를 다시 구성했다. 이 비교로 제품의 자동 선택이나 배포 환경에서의 동작을 판정할 수 없다. [재생 설계][replay] | 연구와 제품의 구분을 유지한다. W5를 제품에 기본 적용한 기능으로 소개할 근거는 없다. |
| 3쪽 Ⅲ장. “선택기는 질문과 배정된 픽셀의 OCR 신호만 사용한다.” [원문][method] | W4에서는 선택한 열이 정답 열과 일치해도 출력에 머리글이 빠졌다. W5에서는 같은 예측을 고정한 채 머리글과 행을 다시 표시했다. 목표 열 선택, 출력의 단서 보존, 독자의 응답은 서로 다른 단계다. [선택과 표시][w4] · [W5 결과][w5] | 기존 실험의 방법을 유지한다. W5는 후속 실험의 표시 방법으로 기술한다. |
| 4쪽 Ⅲ장·Ⅴ장. “원본 보존·경로 안전성·manifest 완전성은 모델 정확도와 별도로 확인한다.” · “두 공급자 모두 H1은 지지되지 않았다.” [측정][measures] · [결과][hypothesis] | W5가 머리글 띠를 포함하면서 W4보다 화면에 표시한 면적이 늘었다. 이 실험의 면적 단위는 원본 페이지 대비 픽셀 면적이다. 모델 응답이나 공급자 청구량은 재측정하지 않았다. [면적 정의][area] · [실험 2 결과][exp2] | 픽셀 면적을 토큰이나 가격으로 환산하지 않는다. 기존 정확도 결과와 그림을 유지한다. |
| 6쪽 Ⅶ장. “합성 이미지와 고정 대본은 실제 문서 다양성과 자율 에이전트 행동을 대표하지 않는다.” [원문][discussion] | W5는 W4에서 머리글이 사라진 동일한 쪽을 재생했다. 각 열의 제목과 그 값이 같은 가로 위치에 표시됐지만, 해당 사례는 정상 머리글과 같은 줄 정답에 집중됐다. 독자가 질문한 열을 골랐는지는 픽셀 검증으로 알 수 없다. [W5 결과][w5] · [적용 범위][limits] | 이 문장 뒤가 아래 권장 문안의 삽입 위치다. |
| 7쪽 Ⅷ장. “모델 정확도·비용·속도는 다시 측정하지 않아” [원문][conclusion] | 기존 결론은 연구 시점의 모델 결과와 현재 제품의 결정적 출력을 구분한다. 후속 파일럿은 실제 독자가 열과 값을 함께 맞히는 절차를 마련했다. 공개 모의 응답은 채점 절차를 확인하는 자료다. [판독 절차][protocol] · [공개 자료 설명][pilot] | 결론을 유지한다. 사람 판독은 자료가 확보된 뒤 독자 수, 문항 배정, 난이도 차이와 함께 별도로 해석한다. |

## Ⅶ장에 넣을 수 있는 문안

> 한국어 합성 표에서 행을 잘라 표시하자 같은 행의 두 값은 남았지만 어느 열의 값인지 알려 주는 머리글이 사라진 사례가 있었다. 같은 표와 선택 결과에 원본 머리글을 함께 표시하자 두 열의 제목과 값이 각각 같은 가로 위치에 나타났다. 이 재생에서는 사람이 질문한 열과 값을 정확히 고르는지 측정하지 않았다.

위 문안의 앞 문장은 W4를 적용한 사례, 다음 문장은 같은 사례에 대한 W5 재생을 가리킨다. 심사본에 채택할 때에는 두 결과의 공개 보충자료를 함께 인용하고 8쪽 조판을 다시 확인한다. [W4 결과][w4] · [W5 결과][w5]

[d02]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/d02-ieie-typesetting/summary.json
[abstract-ko]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L7
[abstract-en]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L13
[intro]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L21
[product]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L23
[method]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L69
[measures]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L96
[hypothesis]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L120
[discussion]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L178
[conclusion]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/docs/research/image-first-paper-draft.ko.md#L188
[exp2]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/0fb30531aabaa9f55b8c9fdc34ee9d03042936c1/research/results/exp2-heldout/README.md
[w4]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/4320271738c8be56556fb09bf56511368d49ba9e/research/results/ko-header-column/RESULTS.md#L27-L37
[replay]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/20148237d9c9ac91f06f149d73da05f41b94e314/research/results/ko-header-strip/RESULTS.md#L3-L5
[w5]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/20148237d9c9ac91f06f149d73da05f41b94e314/research/results/ko-header-strip/RESULTS.md#L7-L14
[area]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/20148237d9c9ac91f06f149d73da05f41b94e314/research/results/ko-header-strip/RESULTS.md#L181-L204
[limits]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/20148237d9c9ac91f06f149d73da05f41b94e314/research/results/ko-header-strip/RESULTS.md#L256-L262
[protocol]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/2efecd8544cab261f56bc68b204bdb5cd44a5fb3/research/plans/2026-11-25-ko-blind-reader-protocol.md#L7-L13
[pilot]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/2efecd8544cab261f56bc68b204bdb5cd44a5fb3/research/results/ko-blind-reader/README.md#L3-L15
