# 한국어 표에서 열 제목을 잃은 일곱 문항

공개 모의 자료를 사용한 비눈가림 AI 시연의 사후 사례 분석이다. 분석 대상은 이미 제출된 18개 응답이다. 그중 열과 값을 모두 판단할 수 없다고 응답한 일곱 위치를 고정한 뒤, 같은 원본을 네 화면으로 대조했다. 독자에게 실제로 제시한 화면은 문항당 하나다. **사람의 판독 성능은 측정하지 않았다.**

일곱 문항 모두 배정 화면에 행 이름과 두 값은 온전히 보이고 두 열의 제목은 보이지 않았다. 그중 다섯 문항은 행을 좁게 자른 W4 화면이었다. 같은 원본에서 W5로 머리글과 본문을 함께 표시하면 두 제목이 돌아왔다. 다른 두 문항은 W1에 배정됐고, W5도 머리글이 잘린 W1 화면을 그대로 반환했다. [네 화면 나란히 보기](gallery/index.html)

## 문항별 대조

‘보임’은 두 열 제목에 해당하는 원본 글자 픽셀이 모두 남았다는 뜻이다. ‘없음’은 두 제목의 글자 픽셀이 하나도 남지 않았다는 뜻이다. 셀을 누르면 해당 방식의 원래 크기 이미지를 볼 수 있다.

| 문항 | 질문한 열 / 다른 열 | 배정 | 원본 | W1 | W4 | W5 |
|---:|---|---|---|---|---|---|
| 1 | 점등 시각 / 소등 시각 | W4 | [보임](gallery/images/01-source.png) | [보임](gallery/images/01-w1.png) | [없음](gallery/images/01-w4.png) | [보임](gallery/images/01-w5.png) |
| 2 | 번역 분량 / 원문 분량 | W4 | [보임](gallery/images/02-source.png) | [보임](gallery/images/02-w1.png) | [없음](gallery/images/02-w4.png) | [보임](gallery/images/02-w5.png) |
| 7 | 퇴근 시각 / 출근 시각 | W1 | [보임](gallery/images/07-source.png) | [없음](gallery/images/07-w1.png) | [없음](gallery/images/07-w4.png) | [없음](gallery/images/07-w5.png) |
| 8 | 환승 시각 / 승차 시각 | W4 | [보임](gallery/images/08-source.png) | [보임](gallery/images/08-w1.png) | [없음](gallery/images/08-w4.png) | [보임](gallery/images/08-w5.png) |
| 10 | 본문 분량 / 서문 분량 | W4 | [보임](gallery/images/10-source.png) | [보임](gallery/images/10-w1.png) | [없음](gallery/images/10-w4.png) | [보임](gallery/images/10-w5.png) |
| 14 | 폐문 시각 / 개문 시각 | W1 | [보임](gallery/images/14-source.png) | [없음](gallery/images/14-w1.png) | [없음](gallery/images/14-w4.png) | [없음](gallery/images/14-w5.png) |
| 17 | 초대 인원 / 확정 인원 | W4 | [보임](gallery/images/17-source.png) | [보임](gallery/images/17-w1.png) | [없음](gallery/images/17-w4.png) | [보임](gallery/images/17-w5.png) |

**W4에서 제목이 사라진 다섯 문항.** 1·2·8·10·17번의 W1에는 두 제목이 있었다. W4는 질문한 행을 남겼지만 제목 행을 잘랐다. 예를 들어 10번 W4에는 71쪽과 69쪽이 모두 보였다. W5에서는 ‘본문 분량’과 ‘서문 분량’이 원래의 좌우 위치에 함께 표시됐다. 다섯 건 모두 W5가 실제로 머리글 띠와 본문 띠를 조립했고 출력 픽셀은 W1과도 달랐다.

**W1에 이미 제목이 없던 두 문항.** 7번 ‘퇴근 시각’과 14번 ‘폐문 시각’의 원본 제목은 세로 좌표 113부터 136 직전까지에 있었다. 최초 창 W0의 윗변은 각각 278과 190이었다. W1이 이 창을 유지했고 W4의 좁히기 규칙은 적용되지 않았다. 따라서 W5도 머리글을 붙이지 않았다. 각각 W1·W4·W5의 크기와 픽셀이 동일하다. 이 두 건에서는 W4 단계만 고쳐서는 제목이 나타나지 않는다.

## 전체 배정 화면에서의 대조

| 제출 응답 | 문항 | 두 제목 모두 온전히 보임 | 두 제목 모두 없음 | 두 값과 행 이름 모두 온전히 보임 |
|---|---:|---:|---:|---:|
| 판단 불가 | 7 | 0 | 7 | 7 |
| 열과 값을 선택함 | 11 | 11 | 0 | 11 |

판단 불가 7건의 배정은 W1 두 건·W4 다섯 건이고, 나머지 11건은 W1 네 건·W4 한 건·W5 여섯 건이다. 나머지 11건은 무작위 대조군이 아니다. 각 위치의 답은 한 번만 받았다. 다른 방식으로 보여 줬을 때 AI가 답을 바꿨을지는 알 수 없다. 관리자 자료 열람 여부는 ‘예’였고 이전에 본 개별 정답이나 배정 내용의 범위는 확인할 수 없다. 위 표는 공개 모의 응답에서 함께 관찰된 현상을 기술한다. 같은 독립 문서에 대한 반복 시행이나 사용자 대상 정확도 비교로 해석할 수 없다. 논문에 사람 성적으로 인용하거나 제품 기본값의 근거로 사용하지 않는다.

## 검산과 재현

위치와 방법은 공개 모의 판독지와 키에 연결했다. 최초 응답과 18개 위치, 일곱 건의 선정 목록은 분석 코드보다 먼저 고정했다. 이 기록은 사후 선정을 변경하지 않았는지 확인하는 용도다. [선정 기록](selection.json) · [공개 시연 응답](mock-ai-response.json)

각 화면에서 행 이름, 두 제목, 두 값의 원본 잉크 상자를 조사했다. 회색값 255보다 어두운 원본 픽셀 중 몇 개가 남는지 세되, 서로 겹친 조각은 한 번만 센다. W5의 장식 구분선은 글자로 세지 않는다. 독립 검산도 같은 원본 좌표와 잉크 상자를 사용하고 픽셀을 세는 경로를 별도로 구현했다. 좌표 주석 자체의 정확성까지 독립적으로 검증한 것은 아니다. 파일 형식과 해시는 별도로 확인한다. 판독지에 내장된 PNG와 빌드 PNG의 파일 바이트는 18건 모두 달랐으나, 실제 배정 화면의 크기와 디코딩한 회색 픽셀은 18건 모두 일치했다. [문항별 기계 판정](audit.json) · [원본 모의 자료 재생성 안내](../../../../research/results/ko-blind-reader/README.md)

저장소 루트에서 실행한다. `$mockWork`는 위 안내로 재생성한 공개 모의 디렉터리이고, `$out`은 새 출력 디렉터리다. Python 3.12와 Pillow 12.3.0을 사용했다.

```powershell
$auditDir = 'docs/research/evidence/ko-mock-abstention-audit'
$out = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $out | Out-Null
$env:KO_AUDIT_PUBLIC_MOCK = (Resolve-Path $mockWork).Path
python -m unittest discover -s $auditDir -p test_audit.py
python "$auditDir/audit.py" --mock-work $mockWork --output "$out/audit.json"
python "$auditDir/build_gallery.py" --mock-work $mockWork --audit "$out/audit.json" --out "$out/gallery"
```

후속 검증 후보는 W4가 적용되지 않은 경우에도 최초 창 위쪽의 머리글을 찾을 수 있는지 확인하는 것이다. 같은 행의 다른 값이 추가로 노출되거나 표시 영역이 얼마나 늘어나는지도 새 자료에서 함께 비교해야 한다.
