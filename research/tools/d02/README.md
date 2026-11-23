# D02 IEIE 조판 도구

원고 Markdown에서 대한전자공학회 정규논문 양식 HWP와 PDF를 만들고 PDF를 검증하는 최소 도구다. 결과 보고는 [D02 보고서](../../plans/2026-11-23-d02-ieie-typesetting.md)에 있다.

| 파일 | 하는 일 |
|---|---|
| `md_to_blocks.py` | 원고 → 블록 JSON과 변환 로그. 출처 메모 제거, 저장소 링크를 보충 자료 인용으로, 참고문헌 첫 인용 순서 재번호, 장·절 번호 변환, 영문 캡션 결합. 선택 인자 `edits.json`은 조판본 전용 문장 편집을 적용하고 전후를 로그에 남긴다 |
| `build_hwpx.py` | 양식 HWPX 폴더 + 블록 JSON → HWPX. 양식 안내문·예시·저자 칸·약력 쪽 제거, 짝수 쪽 머리말 유지, 문서 요약 정보 비움, 표·그림·참고문헌 생성. 선택 인자 `layout.json`은 배치(그림 1 고정 위치, 그림을 앞 문단 앞에 두기, 캡션 묶음, 참고문헌 URL 줄바꿈 허용)를 정한다 |
| `verify_pdf.py` | PDF → 쪽 렌더, `pages.csv`, `citations.csv`, `claims.csv`, `numbers.csv`, `summary.json`. 내부 경로 누출, 그림·글 겹침, 캡션 분리도 센다 |

```text
python md_to_blocks.py <manuscript.md> <captions_en.json> <blocks.json> <convert_log.json> [edits.json]
python build_hwpx.py <template_hwpx_dir> <blocks.json> <repo_root> <out.hwpx> <build_log.json> - [layout.json]
python verify_pdf.py <paper.pdf> <blocks.json> <claims.json> <out_dir>      # PyMuPDF 필요
```

- 양식 HWPX 폴더는 학회 양식 HWP를 한글에서 HWPX로 저장해 푼 것이다. HWPX → HWP → PDF 변환은 한글(HWPFrame.HwpObject COM)로 한다. 양식 파일, 영문 캡션, 문장 편집 목록, 심사본과 한글 자동화 스크립트는 저장소에 넣지 않는다.
- 한글은 파일 접근 보안 대화상자를 인스턴스마다 띄울 수 있다. 사용자가 처리하며 도구가 보안 설정을 바꾸지 않는다.
