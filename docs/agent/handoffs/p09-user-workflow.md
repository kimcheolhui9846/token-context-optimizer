# P09 사용 흐름·오류·제한 설명 점검

Tier C. 기준 main `31de4ffad498bdcc7070b745cb0d75efb32577fa`. 배포되는 스킬을 포함하므로 패키지와 공개 STDIO를 함께 확인했다.

| 사용자 단계 | 확인한 동작과 근거 |
|---|---|
| 설치 | 비어 있는 임시 디렉터리에 `--target`, `--no-marketplace`로 설치하고 `verify-installed-plugin.mjs --plugin-root`를 실행했다. 런타임 4파일, 필수 도구 9개, 설치 스킬과 작업 사본 바이트 일치. 실제 호스트 활성화는 D05 대상이다. |
| 텍스트 발췌 | 허용된 경로의 3줄 UTF-8 예제를 색인했다. `query_artifact`에 Bluebird·64토큰·문맥 0줄을 입력하자 `Bluebird shipped.`와 시작·끝 2행을 반환했다. |
| 이미지 | 소유한 4×3 RGB PNG의 해시와 치수를 색인·검사했다. 4×3 overview와 호출자가 지정한 2×1 crop은 JPEG이며, 각 출력 바이트의 SHA-256이 응답과 일치했다. 영역 선택과 정확한 원문 판독은 호출자가 담당한다. 자동 OCR은 제공하지 않는다. |
| 퇴출 | `tests/artifact-store-bound.test.ts`의 작은 예산 테스트가 텍스트 LRU 퇴출을 검증한다. 기본 256 MiB는 저장된 텍스트 레코드의 추정 예산이다. 프로세스 RSS 상한은 별도로 보장하지 않는다. 이미지 메타데이터는 프로세스 메모리에 쌓이며 현재 개수·바이트 퇴출 한도가 없다. |
| 재시작 | 설치된 같은 번들을 새 프로세스로 시작했다. 이전 ID의 텍스트 query는 `Artifact not indexed: <id>`, 이미지 inspect는 `unknown_artifact_id`, crop·overview는 `artifact_not_indexed`였다. 같은 경로·바이트·이미지 프로필로 재색인하자 ID와 SHA-256이 일치하고 텍스트 조회 및 이미지 검사가 복구됐다. 원본은 승인된 작업공간에 유지한다. |

## 수정 및 검증

- 설치 스킬의 이미지 계약 링크가 가리키던 `49c6cc6` 문서에는 overview 도구와 tolerant JPEG 프로필이 없었다. 두 계약과 `## MCP crop use` 앵커가 있는 병합 커밋 `31de4ff`로 링크를 고정했다. 역사적 연구 링크는 그 연구의 기준 커밋을 가리킨다.
- README에 첫 세션의 입력·MCP 인수·기대 행 번호·복구 순서를 추가했다. P08에서 검증한 Windows x64 제품 런타임 22.0.0 및 24.18.0과 개발 환경 24.18.0을 구분했다. P09의 예제는 v24.18.0에서 실행했다.
- 설치 스킬에는 텍스트와 이미지 도구별 미등록 ID 오류를 추가했다. 설치 사본의 스킬 SHA-256은 `86d6d6dbcf0b6917f325963a826c9e53acd095b5c93434c702443862bb9c7d10`다.
- `npm run build` 성공. `npm test -- --run tests/artifact-store-bound.test.ts tests/query-artifact-mcp.test.ts --maxWorkers=1`에서 2파일·45개 통과. 작은 예산 테스트와 실제 공개 STDIO 재시작 검사를 별도로 수행했다.
- Opus 5.5가 계획을 검토해 PASS로 판정했다. Sonnet 5.5가 사용자 문구를 초안으로 작성했다. 최종 후보의 전체 게이트와 독립 판정은 이 PR 본문 및 중앙 WBS에 기록한다.
- P08에서 인계된 N-41의 원인은 미확정이다. 이미지 저장소 보관 정책과 D05 실제 호스트 설치는 후속 결정 대상이다.
