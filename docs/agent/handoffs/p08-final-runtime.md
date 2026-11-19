# P08 최종 번들 및 지원 런타임 검증

Tier C. [P08 검증 PR](https://github.com/kimcheolhui9846/token-context-optimizer/pull/129)에서 [설치 검증기 원본](https://github.com/kimcheolhui9846/token-context-optimizer/pull/114)을 통합했다. 아래 수치는 첫 통합 커밋 `6ca028ade1aa6a35455fdb523705612fc2dc9449`에서 측정했다. PR 본문에는 최종 문서 커밋의 재검증 결과도 기록한다.

## 검증 범위

- 제품 계약은 Node `>=22.0.0`이다. Windows x64에서 하한 22.0.0과 개발 환경 24.18.0을 검사했다. 전체 개발 게이트는 24.18.0에서 실행했다. 잠금 파일의 Vite는 `^20.19.0 || >=22.12.0`을 요구한다.
- 로컬 설치 패키지를 이루는 네 파일은 플러그인 manifest, MCP 설정, 번들, 스킬 문서다. 프로젝트 MIT 라이선스와 의존성 고지는 번들 안에 있다. 실제 사용자 설치와 호스트 캐시 활성화는 별도 승인 대상이다.
- P07이 인계한 N-41은 파일 변경·동시 접근에서 관찰한 간헐적 실패다. 원인은 미확정이다. 이미지 저장소 보관 한도는 별도 정책 결정으로 남는다.

## 후보와 패키지

- 기준 main `81d9118b30a3b55caa15e873d81bb94329f5919b`과 #114 `86268e9f3722e185b7decaff3894bd4fe201ebc8`가 통합 커밋의 두 부모다. 병합 트리는 `02b673753193a39f83ff94b72219213e63a8e6a3`이며 #114의 7개 파일을 보존했다.
- npm 11.16.0 · esbuild 0.28.2로 최종 소스에서 재빌드했다. Git 정규화 blob `5709a184c3e99b5e6ddc642b2f5dc736924d3578`은 커밋과 일치한다.
- 임시 디렉터리의 빈 설치 대상에 `--target`과 `--no-marketplace`를 지정했다. 기대한 파일 집합과 네 SHA-256이 원본과 일치했다. manifest의 이름·버전과 MCP 실행 경로를 대조했다.
- 재빌드 원본과 설치 사본의 번들 SHA-256은 `6265b9b4bb650c947a9ec6cd6f83b9215d0e75fd63a5e4b8a0093e6891c76fa8`이다. 고지에서 패키지 7개와 구성요소 표제 8개를 확인했다. 표제 8개 중 2개는 jpeg-js 디코더·인코더에 대한 추가 귀속 표시다. 고지 테스트가 esbuild 입력과 vendored 구성요소도 대조한다.

## 공개 STDIO 결과

| Windows x64 | 도구 | 고정 UTF-8 색인 | PNG 색인 및 JPEG overview | 종료 코드 / stderr |
|---|---:|---|---|---|
| Node 22.0.0 | 9 | 2줄·원본 해시 일치 | 3×2 PNG·JPEG 해시/디코딩 확인 | 0 / 0바이트 |
| Node 24.18.0 | 9 | 2줄·원본 해시 일치 | 3×2 PNG·JPEG 해시/디코딩 확인 | 0 / 0바이트 |

- 각 Node 실행 파일을 절대 경로로 호출했다. 임시 패키지 상위에 node_modules가 없음을 확인하고 NODE_PATH와 NODE_OPTIONS를 제거했다. 두 자식이 보고한 플랫폼·아키텍처·버전과 프로토콜 `2025-06-18`을 확인했다.
- 별도 임시 복사본에서 프로젝트의 `verify-installed-plugin.mjs --plugin-root`도 두 버전 모두 종료 코드 0, 필수 9개, 텍스트 2줄, 이미지 overview 성공을 반환했다.
- 도구명별 inputSchema를 정렬한 SHA-256은 두 버전 모두 `69c6ba8b2ec00b209a66e124a1ce6492e4f3691be42984d0c9cd210e03154850`이다. N-38 검증기는 필수 9개 포함을 검사하며 추가 도구를 허용한다.
- Node 22.0.0 실행 파일의 SHA-256 `db174445b3d28314772bc3918e39d8543cfbd18d542cf2a662f431f5cdc259ea`을 Node.js 공식 HTTPS 체크섬과 대조했다. 서명 검증은 수행하지 않았다. [Node.js 22.0.0 공식 체크섬](https://nodejs.org/dist/v22.0.0/SHASUMS256.txt)

## 테스트 및 인계

- 기존 #114 구현과 테스트를 통합했다. 신규 동작을 설계하는 단계의 RED는 적용 대상이 아니었다. 대상은 설치 검증기·스키마·고지 3파일 43개로 모두 통과했다.
- Draft 이후 `npm ci --ignore-scripts --no-audit`, build, 전체 test, typecheck, smoke:mcp, validate:plugin, benchmark를 실행했다. 전체 test는 `npm test -- --dir tests --maxWorkers=1`로 실패했다. Test Files  1 failed / 57 passed (58) · Tests  1 failed / 4561 passed / 5 skipped (4567). benchmark는 기존 명령 정상 종료만 확인했다.
- 공식 npm 레지스트리의 운영 의존성 및 개발 포함 전체 감사에서 각각 권고 0건이었다. 이는 감사 당시의 잠금 파일 결과다.
- 첫 통합 커밋에서 실패한 한 건은 기존 `tests/image-source-race.test.ts`의 N-41 관찰에 해당했다. 기대 오류는 `source_changed`, 관측 오류는 `read_failure`였다. 요청은 두 경우 모두 거부됐다. 다른 여섯 게이트는 통과했다. 이 실행은 전체 게이트 실패로 기록하며 후속 실행도 개별 결과로 남긴다.
- 최초 계획은 Claude Opus 5.5가 수정 후 통과로 판정했다. Claude Sonnet 5.5가 검증 범위 문단 초안을 작성했다. 최종 독립 검토 및 승인 상태는 PR 본문과 WBS에 기록한다.
- P08 병합 승인 시 #114 원본이 main의 조상인지 재확인한 뒤 기존 PR의 처리 상태를 기록한다.
