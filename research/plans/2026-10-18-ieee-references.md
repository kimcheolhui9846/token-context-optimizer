# 참고문헌 IEEE 정리본 (조판 입력)

- 작성: Claude Code, 2026-10-18. 상태: **초안(Draft PR, Codex 교차 검토 전)**
- 기준: main `f4fa22c`의 `docs/research/image-first-paper-draft.ko.md` 참고문헌 [1]–[24](PR #41 merge본). 번호와 순서는 원고와 같다.
- 목적: hwp 조판 때 그대로 붙여 넣을 영문 IEEE식 목록이다. PR #41 리뷰 m-2(참고문헌 형식 혼재)의 조판 입력이다.
- **이 문서는 논문 원고를 고치지 않는다.** 원고 반영은 Task 38(문서) 또는 조판 단계에서 한다. Task 38이 새 참고문헌을 추가하면 번호가 바뀌므로, 반영 직전에 이 목록의 번호를 다시 맞춘다.
- 형식 근거: [IEIE 형식 메모](./2026-10-15-ieie-journal-format.md) L23·L52(본문 인용 순서, 영문, IEEE식. 웹 자료는 IEEE 온라인 자료 형식 권장)

## 1. 정리본

[1] A. Chaturvedi, S. Bhattacharya, R. Gopalkrishnan, and P. van der Putten, "DTOC: Dynamic tool output compression for adaptive context management in AI agents," arXiv:2609.26121, 2026.

[2] X. Li, R. Ming, M. Chu, S. Shao, R. Jin, and C. Xiong, "ACM: Agentic context management for long horizon tasks," arXiv:2607.23809, 2026.

[3] M. Mathew, D. Karatzas, and C. V. Jawahar, "DocVQA: A dataset for VQA on document images," in *Proc. IEEE/CVF Winter Conf. Appl. Comput. Vis. (WACV)*, Jan. 2021, pp. 2200–2209.

[4] A. Masry, D. X. Long, J. Q. Tan, S. Joty, and E. Hoque, "ChartQA: A benchmark for question answering about charts with visual and logical reasoning," in *Findings Assoc. Comput. Linguist.: ACL 2022*, Dublin, Ireland, May 2022, pp. 2263–2279, doi: 10.18653/v1/2022.findings-acl.177.

[5] Y.-C. Hsiao, F. Zubach, G. Baechler, S. Sunkara, V. Carbune, J. Lin, M. Wang, Y. Zhu, and J. Chen, "ScreenQA: Large-scale question-answer pairs over mobile app screenshots," in *Proc. 2025 Conf. Nations Americas Chapter Assoc. Comput. Linguist.: Hum. Lang. Technol. (NAACL), Vol. 1 (Long Papers)*, Albuquerque, NM, USA, Apr. 2025, pp. 9427–9452, doi: 10.18653/v1/2025.naacl-long.477.

[6] A. Singh, V. Natarajan, M. Shah, Y. Jiang, X. Chen, D. Batra, D. Parikh, and M. Rohrbach, "Towards VQA models that can read," in *Proc. IEEE/CVF Conf. Comput. Vis. Pattern Recognit. (CVPR)*, Jun. 2019.

[7] T. Gao, S. Zhao, S. Fang, S. Zhu, and C. Ma, "QuietPrune: Query-guided early token pruning for vision-language models," in *Proc. IEEE/CVF Conf. Comput. Vis. Pattern Recognit. (CVPR)*, Jun. 2026, pp. 3553–3562.

[8] Y. Wang, H. Zhang, Q. Huang, A. Cao, G. Fang, W. Wang, X. Jin, J. Song, M. Song, and X. Wang, "Rethinking token reduction for large vision-language models," in *Proc. IEEE/CVF Conf. Comput. Vis. Pattern Recognit. (CVPR)*, Jun. 2026, pp. 24727–24737.

[9] H. Jiang, Q. Wu, C.-Y. Lin, Y. Yang, and L. Qiu, "LLMLingua: Compressing prompts for accelerated inference of large language models," arXiv:2310.05736, 2023.

[10] F. Xu, W. Shi, and E. Choi, "RECOMP: Improving retrieval-augmented LMs with compression and selective augmentation," arXiv:2310.04408, 2023.

[11] T. Lindenbauer, I. Slinko, L. Felder, E. Bogomolov, and Y. Zharov, "The complexity trap: Simple observation masking is as efficient as LLM summarization for agent context management," in *NeurIPS 2025 Workshop: Deep Learning for Code in the Agentic Era*, 2025, arXiv:2508.21433.

[12] S. Fan, M. Li, X. Ma, W. Tan, X. Huang, J. Wu, L. Zhang, S. Shang, and W. Chen, "Screenshots or tools? Eliciting tool use and managing multimodal context in hybrid GUI–MCP computer-use agents," arXiv:2608.03327v2, 2026.

[13] X. Zhou, G. Chen, Y. Xie, Z. Li, K. Zhou, S. Wang, S. Yang, Z. Tian, and R. Shao, "HiconAgent: History context-aware policy optimization for GUI agents," arXiv:2512.01763v2, 2026.

[14] OpenAI, "Images and vision," OpenAI API documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://developers.openai.com/api/docs/guides/images-vision

[15] OpenAI, "GPT-4o," OpenAI API documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://developers.openai.com/api/docs/models/gpt-4o

[16] OpenAI, "GPT-5.6 Sol," OpenAI API documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://developers.openai.com/api/docs/models/gpt-5.6-sol

[17] Anthropic, "Vision," Claude platform documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://platform.claude.com/docs/en/build-with-claude/vision

[18] Anthropic, "Vision coordinates and bounding boxes," Claude platform documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://platform.claude.com/docs/en/build-with-claude/vision-coordinates

[19] Anthropic, "Models overview," Claude platform documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://platform.claude.com/docs/en/models/overview

[20] Anthropic, "Sonnet 5.5 model overview," Claude platform documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://platform.claude.com/docs/en/models/sonnet-5-5/overview

[21] Google, "Media resolution," Gemini API documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/media-resolution

[22] Google, "Image understanding," Gemini API documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/image-understanding

[23] Google, "Pricing," Gemini API documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/pricing

[24] Google, "Gemini 3.8 Flash," Gemini API documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash

## 2. Task 38에서 추가될 후보 (번호 미정)

Task 38이 캐시 할인율 근거를 본문에 쓰면 아래 두 항목이 필요하다([Task 38 수치 대조표](./2026-10-18-task38-number-sheet.md) §4 C-1·C-2). 인용 첫 등장 위치에 따라 번호를 매긴다.

- OpenAI, "Pricing," OpenAI API documentation. Accessed: Oct. 18, 2026. [Online]. Available: https://developers.openai.com/api/docs/pricing
  - 실험 3 결과 README(`results/s3-heldout/README.md:51`)는 2026-10-15 확인을 기록했지만 URL이 없다. 2026-10-18 Claude가 이 URL에서 `gpt-4o` 행(입력 $2.50, 캐시 입력 $1.25, 출력 $10.00 / 1M)을 다시 확인했다. 확인일은 둘 중 하나로 통일한다(권장: 2026-10-18, URL과 함께 확인한 날).
- Anthropic, "Pricing," Claude platform documentation. Accessed: Oct. 18, 2026. [Online]. Available: https://platform.claude.com/docs/en/about-claude/pricing

## 3. 항목별 확인 근거

| 번호 | 바꾼 점(원고 대비) | 확인 출처(2026-10-18) |
|---|---|---|
| [1], [2], [9]–[13] | 제목을 sentence case로 바꿨다. 저자·번호·연도는 원고 그대로다 | 원고 서지(로컬 PDF 확인 기록: PR #41 핸드오프 "서지와 분량") |
| [3] | "Mathew et al." → 저자 3명, 학회 정식명, 쪽 | CVF 공식 페이지 bibtex(`Mathew_2021_WACV`). arXiv 2007.00398도 같은 저자 3명("accepted at WACV 2021") |
| [4] | 저자 5명, 쪽, DOI, 장소 | ACL Anthology bibtex(`masry-etal-2022-chartqa`) |
| [5] | 저자 9명, 쪽, DOI, 장소 | ACL Anthology bibtex(`hsiao-etal-2025-screenqa`) |
| [6] | 저자 8명, 학회 정식명 | CVF 공식 페이지 bibtex(`Singh_2019_CVPR`). **쪽 번호가 bibtex에 없어 넣지 않았다.** arXiv 1904.08920 저자 8명 일치 |
| [7] | 저자 5명, 쪽 | CVF 공식 페이지 bibtex(`Gao_2026_CVPR`) |
| [8] | 저자 10명, 쪽. 원고의 "MetaCompress arXiv:2603.21701v1" 병기를 뺐다 | CVF 공식 페이지 bibtex(`Wang_2026_CVPR`). arXiv 2603.21701v1의 제목·저자 10명이 CVF와 같다. 같은 논문이므로 학회판 하나만 쓴다 |
| [14]–[24] | Markdown 링크를 IEEE 온라인 자료 형식으로 바꿨다. 확인일은 `Accessed: Oct. 7, 2026.`을 `[Online]. Available:` 앞에 두는 형식으로 통일했다(PR #43 리뷰 Nit). 날짜는 원고 그대로이고 다시 조회하지 않았다 | 원고 서지, IEEE Reference Guide |

- CVF 페이지는 일반 HTTP 요청에 403을 돌려준다. 이번에는 브라우저(Playwright)로 열어 페이지의 bibtex 블록을 그대로 읽었다. 기존 출처 기록(`docs/research/image-first-sources.md`)의 "직접 접근 403, 검색 색인 확인"보다 한 단계 직접적인 확인이다.
- 교차 검토 상태(PR #43, Codex): [3]·[6]·[7]·[8]의 학회판 쪽·DOI와 [7]의 저자는 Codex가 독립 확인하지 못했다(CVF 직접 요청 403, 연결된 브라우저 없음). 위 근거는 Claude의 브라우저 열람 한 번뿐이다. 투고 전 CVF 페이지나 학회 PDF로 한 번 더 직접 확인한다.
- [6] 쪽 번호 후보: CVF 검색 색인에 8317–8326이 있다(Codex 보고). 2026-10-19 Claude의 직접 요청도 403이라 확인하지 못했다. 본문 페이지나 학회 PDF에서 직접 확인하기 전에는 넣지 않는다.
- arXiv 예비 논문([1], [2], [12], [13])의 학회 게재 여부는 투고 직전에 다시 확인한다(관련 연구 메모 §4 "남은 확인").

## 4. 원고에 반영할 때의 주의

- 본문 범위 인용은 이미 "[12]–[22]" 형식이다(PR #41). 번호가 바뀌면 범위 표기도 함께 고친다.
- [8] 병기 삭제는 서지 표기만 바꾼다. 본문이 MetaCompress라는 이름을 쓰지 않는 것을 원고에서 확인한 뒤 반영한다(현재 원고 L68은 "Rethinking Token Reduction"으로 쓴다).
- 이 목록의 영문 제목 대소문자(sentence case)는 IEEE 관행이다. IEIE 예시가 title case를 요구하면 원 제목 표기로 되돌린다(형식 메모에서 확인되지 않음, 조판 때 양식 예시와 대조).
