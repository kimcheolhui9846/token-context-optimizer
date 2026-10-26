# 허용 루트·경로 안전 사전 조사 (WBS 6.9, 6.4 묶음 (가))

- 작성: Claude Code, 2026-10-26. 기준 main `6e308c9`
- 성격: 읽기 전용 조사. 제품 코드·테스트·문서는 고치지 않았다
- 대상
  - F-20(텍스트): 허용 루트 하나가 없으면 전체 실패, 환경 변수가 비면 명시적 오류가 없다
  - F-22: `..notes.txt`를 루트 밖으로 오판한다
  - S-02: 허용 루트 검사 전에 realpath를 해서 루트 밖 경로의 존재 여부가 드러난다
- 근거: [Findings 재확인](./2026-10-25-findings-recheck.md) §2·§5(PR #66), 사용자 결정 순서 F-21 → 6.9 → 6.12a–c
- 목적: Codex의 6.9 계획이 바로 쓸 수 있게 현재 동작, 영향 범위, 선택지를 정리한다

## 1. 현재 동작 (실측)

임시 폴더에 루트(`root`)와 루트 밖 폴더(`outside`)를 만들고 main 코드를 그대로 불렀다. Windows 11, Node 24.18. 경로는 `<BASE>`로 가렸다.

- 이미지 쪽은 PNG가 아닌 내용으로 불렀다. 그래서 "경로 통과"는 경로 검사를 지나 형식 검사(`malformed_png`)에서 멈췄다는 뜻이다

| 경우 | 텍스트 `indexArtifact` | 이미지 `indexImageArtifact` |
|---|---|---|
| 루트 안, 있는 파일 | 통과 | 경로 통과 |
| 루트 안, 없는 파일 | `ENOENT … realpath '<BASE>\root\nope.txt'` | `read_failure` |
| **루트 밖, 있는 파일** | `File is outside allowed roots: <BASE>\outside\secret.txt` | `path_denied` |
| **루트 밖, 없는 파일** | `ENOENT … realpath '<BASE>\outside\nope.txt'` | `read_failure` |
| 루트 안 `..notes.txt` | `File is outside allowed roots` (F-22) | 경로 통과 |
| 루트 하나가 없음 + 루트 안 파일 | `ENOENT … realpath '<BASE>\gone'` (F-20) | 경로 통과 |
| 허용 목록 빈 값, 루트 밖 있는 파일 | `File is outside allowed roots: …` | `path_denied` |
| 허용 목록 빈 값, 루트 밖 없는 파일 | `ENOENT …` | `path_denied` |
| 루트 안 junction → 밖, 있는 파일 | `File is outside allowed roots: <BASE>\outside\secret.txt` | `path_denied` |
| 루트 안 junction → 밖, 없는 파일 | `ENOENT … '<BASE>\root\lnk\nope.txt'` | `read_failure` |

- 굵은 두 줄이 S-02다. 텍스트와 이미지 모두 루트 밖 경로가 있으면 거부, 없으면 읽기 실패로 갈린다. 마지막 두 줄(루트 안 링크가 밖을 가리킬 때)도 같다
- 텍스트는 더 드러낸다
  - 루트 밖 거부 문구에 **realpath한 절대 경로**를 싣는다. junction 경우에는 호출자가 준 경로(`root\lnk\…`)가 아니라 링크 대상(`outside\…`)이 나온다
  - 허용 목록이 비어도 대상 경로를 먼저 realpath하므로 같은 구분이 생긴다. 이미지는 빈 목록을 파일 접근 전에 거부한다(`image-artifacts.ts:108`)
- 서버는 `TCO_ALLOWED_ROOTS`가 없으면 빈 목록을 넘긴다(`server/index.ts:258-263`). core의 기본값 `[process.cwd()]`(`artifacts.ts:35`, `image-artifacts.ts:53`)은 `??`라서 빈 배열에는 적용되지 않는다. 그래서 서버에서 환경 변수가 없으면 텍스트는 "outside allowed roots"로 끝나고, 무엇을 설정해야 하는지는 알려 주지 않는다(F-20 두 번째 부분)

## 2. 코드 위치

| 항목 | 텍스트 | 이미지 |
|---|---|---|
| 경로 검사 함수 | `src/core/artifacts.ts:480-502` `validateReadableFile` | `src/core/image-artifacts.ts:104-120` `readBoundedSource` |
| 대상 realpath | `:484` (루트 검사 전) | `:111-112` (루트 검사 전) |
| 루트 realpath | `:485-487` `Promise.all`, 하나 실패하면 전체 실패 | `:113-115` 실패한 루트는 버림 |
| 포함 판정 | `:504-507` `isPathInside`: `startsWith("..")` (F-22) | `:265-269` `isInside`: `".."`와 `..<구분자>`만 밖으로 봄 |
| 빈 목록 | 처리 없음 | `:108` 파일 접근 전 `path_denied` |
| 오류 형식 | `Error` 문구, 경로 포함(`:490`, ENOENT 원문) | `ImageValidationError` 코드만(`:16-22`) |
| 호출 | `indexArtifact` `:34` | index `:53`, inspect `:90`, crop용 `readValidatedImageArtifact` `:165` |

- 이미지 inspect는 리더 오류 중 `path_denied`만 그대로 두고 나머지를 `source_missing_or_unreadable`로 바꾼다(`image-artifacts.ts:91`). crop은 `path_denied`와 `source_changed`를 그대로 두고 나머지를 바꾼다(`:167`). 문서는 `docs/image-artifacts.md:191-195,207-210`이다(2026-10-26 Codex 검토로 crop 서술 정정, §8). 두 도구는 index 때 루트 안이었던 기록 경로만 읽는다. 그래서 S-02가 드러나는 곳은 주로 index다. inspect·crop에서는 기록 경로를 루트 밖을 가리키는 링크로 바꿔야 같은 구분이 생긴다. 공통 helper를 쓰면 이 경우도 함께 막힌다
- Windows에서 `path.win32.relative`는 대소문자를 무시한다(`C:\Work\Root`와 `c:\work\root\A.txt` → `"A.txt"` 확인). 대소문자 차이로 거부되는 일은 없다

## 3. 선택지

모든 선택지에 공통인 것
- 텍스트와 이미지가 경로 판정 helper 하나를 같이 쓴다. 포함 판정은 이미지의 `isInside` 방식으로 통일한다(F-22 해결)
- 루트 realpath 실패는 그 루트만 버린다. 남은 루트가 없으면 거부한다(F-20 첫 부분)
- 허용 목록이 비면 대상 파일에 접근하기 전에 거부한다

### 가-1 (권장): realpath 뒤, 실패하면 가장 가까운 존재 조상으로 판정
1. 대상 realpath가 성공하고 루트 안이면 통과한다
2. 성공했는데 루트 밖이면 거부한다
3. 실패하면 대상 자신부터 부모 쪽으로 한 단계씩 올라간다
   - 그 단계가 lstat로는 있는데 realpath가 안 되면(끊어진 링크, 링크 순환, 권한) 바로 거부한다
   - lstat로도 없으면 다음 부모로 간다
   - 처음 realpath가 되는 조상이 루트 안이면 읽기 실패(이미지 `read_failure`), 루트 밖이면 거부(`path_denied`)
- 끊어진 링크 규칙이 없으면 새는 곳이 생긴다(gemini-4-argon 지적). 루트 안 링크가 루트 밖의 없는 대상을 가리키면, 링크 자체의 realpath가 실패해 부모인 루트까지 올라가고 읽기 실패가 된다. 대상이 있으면 거부다. 그래서 링크 대상의 존재 여부가 다시 갈린다
- 효과
  - §1 표의 루트 밖 네 경우(있음·없음, 링크 있음·없음)가 모두 거부로 같아진다
  - 루트 안 없는 파일은 지금처럼 읽기 실패로 남아 오타 진단이 된다
  - realpath를 먼저 하므로 8.3 짧은 이름, subst 드라이브, 링크로 된 루트 같은 다른 표기도 지금처럼 통과한다
- 비용: 조상 탐색은 실패 경로에서만 돈다. 경로 깊이만큼 realpath·lstat를 더 부른다
- 보수적인 부분: 루트 안의 끊어진 링크나 권한 없는 폴더는 읽기 실패가 아니라 거부가 된다. 루트 안을 가리키는 끊어진 링크도 거부다. 진단이 조금 덜 친절해지는 대신 링크 대상은 드러나지 않는다
- 남는 것: 응답 시간 차이(조상 깊이)는 막지 않는다. 범위 밖으로 기록한다

- 시제품 확인(제품 코드 아님, scratch 스크립트, Windows junction): 18개 경우 결과
  - 통과: 루트 안 있는 파일, `..notes.txt`, 루트 하나가 없을 때 다른 루트 안 파일, 루트를 junction 경로로 준 경우
  - 읽기 실패: 루트 안 없는 파일, 루트 안 없는 하위 폴더 속 파일
  - 거부
    - 루트 밖 있는 파일·없는 파일·없는 깊은 경로·없는 폴더, 빈 허용 목록
    - 루트 안 junction이 밖의 있는 폴더를 가리킬 때: 대상 파일이 있음·없음·없는 깊은 경로
    - 루트 안 junction이 밖의 **없는** 폴더를 가리킬 때: 그 아래 파일, junction 자체(끊어진 링크 규칙)
    - 루트 안 junction이 루트 안의 없는 폴더를 가리킬 때(보수적 거부)
  - 루트 밖과 링크 경우가 모두 거부 하나로 모였다
  - 파일 symlink는 이 PC 권한(개발자 모드 아님)으로 만들 수 없어 확인하지 못했다. 규칙은 같지만(끊어진 링크는 lstat 성공 → 거부) POSIX 테스트로 확인해야 한다

### 가-2: realpath 전에 경로 문자열로 먼저 거른다
- `resolve(path)`가 (realpath 전·후) 루트 문자열 안에 있지 않으면 파일 접근 없이 거부한다
- 단점
  - 루트를 다른 표기(8.3 이름, 링크 경로)로 준 정상 요청이 거부된다
  - 루트 안 링크가 밖을 가리키는 두 경우(§1 마지막 두 줄)는 여전히 갈린다

### 가-3: 루트 밖이든 읽기 실패든 모두 `path_denied`
- 가장 단순하다
- 단점
  - 루트 안 오타도 `path_denied`가 되어 진단이 어려워진다
  - `read_failure`의 뜻과 테스트(`tests/image-artifacts.test.ts:144-145`), 문서(`docs/image-artifacts.md:168`)가 바뀐다

## 4. 텍스트 오류 문구 (결정 필요)

- **T-1 (권장)**: 문구는 유지하고 경로만 뺀다
  - 루트 밖: `File is outside allowed roots` (경로 없음). 설치 검증 스크립트(`scripts/verify-installed-plugin.mjs:123`)와 테스트(`tests/core.test.ts:430,445`)는 이 구절만 보므로 그대로 통과한다
  - 루트 안 읽기 실패: 경로 없는 고정 문구(예: `File cannot be read`). 지금의 ENOENT 원문은 호출자가 준 경로만 담지만, 링크를 따라간 경로가 섞일 수 있어 같이 고정한다
  - 허용 목록 빈 값: `No allowed roots are configured; set TCO_ALLOWED_ROOTS` (F-20 두 번째 부분)
- T-2: 텍스트도 이미지처럼 오류 코드(`path_denied` 등)를 쓴다. 두 도구가 같아지지만 텍스트 MCP 오류 계약이 바뀌고 검증 스크립트·테스트를 고쳐야 한다. 텍스트 트랙이 보류 중이라 권하지 않는다
- 이미지 빈 목록은 지금처럼 `path_denied`로 둔다. 문서(`docs/image-artifacts.md:167`)가 이미 "or the allowlist is empty"로 적고 있다. 텍스트만 설정 안내 문구를 주는 차이는 남는다

## 5. 영향 범위

| 종류 | 위치 | 가-1·T-1에서 |
|---|---|---|
| 테스트(유지) | `tests/core.test.ts:422-446` 루트 밖·접두사 형제 | 그대로 통과(구절 유지) |
| 테스트(유지) | `tests/image-artifacts.test.ts:133-160` 빈 목록, 형제, `..` 경로, 없는 파일, 링크 | 그대로 통과. `:145`(`image.png/../missing.png`)는 `resolve`가 문자열로 접으므로 루트 안 없는 파일이다 |
| 테스트(유지) | `tests/image-artifacts.test.ts:274`, `tests/image-crop-boundaries.test.ts:56,66,109` 빈 목록 | 그대로 |
| 스크립트(유지) | `scripts/smoke-mcp.mjs:201` `path_denied`, `scripts/verify-installed-plugin.mjs:123` 구절 | 그대로 |
| 문서(수정) | `docs/image-artifacts.md:168` `read_failure` 뜻 | "authorized root 안에서 읽지 못함"으로 좁힌다 |
| 문서(수정) | `docs/design.md:70`, `README.md:44` | 빈 값일 때 텍스트 안내 문구를 적는다 |

추가할 테스트(텍스트·이미지 각각)
1. 루트 밖 있는 파일과 없는 파일이 같은 결과다(S-02)
2. 루트 안 링크가 밖을 가리킬 때 대상이 있든 없든 같은 결과다(Windows junction, POSIX symlink). 링크 대상 폴더 자체가 없는 끊어진 링크와, 끊어진 파일 symlink를 포함한다
3. 텍스트 오류 문구에 대상 경로와 링크 대상 경로가 없다
4. 루트 안 `..notes.txt`가 통과한다(F-22)
5. 허용 루트 중 하나가 없어도 다른 루트 안 파일이 통과한다(F-20)
6. 허용 목록이 비면 텍스트가 설정 안내 문구를 준다(F-20)
7. 루트 안 없는 파일은 읽기 실패로 남는다(진단 유지)

## 6. 범위 밖 (기록만)
- 텍스트 읽기의 검사-사용 사이 경쟁: `validateReadableFile` 뒤 `readFile(absolutePath)`(`artifacts.ts:38`)는 이미지의 `O_NOFOLLOW`·스냅샷 비교(`image-artifacts.ts:122-131`)가 없다. 원래 지적 범위가 아니다. 필요하면 별도 Finding으로 올린다
- 조상 탐색 깊이에 따른 응답 시간 차이(§3 가-1)
- 이미지 오류 코드 표의 다른 항목

## 7. 다음
- **결정 (2026-10-26 사용자: 권장안대로)**: 경로 판정은 **가-1**, 텍스트 오류 문구는 **T-1**
  - 가-1: realpath 뒤, 실패하면 대상부터 부모 쪽으로 올라가며 판정한다. lstat로는 있는데 realpath가 안 되는 단계는 바로 거부한다(§3)
  - T-1: "outside allowed roots" 구절은 유지하고 경로를 뺀다. 루트 안 읽기 실패는 경로 없는 고정 문구로 둔다. 허용 목록이 비면 `TCO_ALLOWED_ROOTS` 설정 안내 문구를 준다(§4)
  - 가-2·가-3·T-2는 채택하지 않는다
- Codex 6.9는 F-21이 끝난 뒤 이 메모를 근거로 계획 PR부터 시작한다. 6.12a가 `image-artifacts.ts`를 고치기 전에 들어가야 충돌이 적다

## 8. 교차 확인
- `gemini-4-argon` 1차: REQUEST CHANGES
  - [Major] 가-1이 루트 안의 끊어진 링크에서 존재 여부를 다시 드러냈다. 끊어진 링크 규칙(§3 가-1 3단계)을 더하고 시제품으로 다시 쟀다
  - [Minor] §1 이미지 열의 "통과"가 실측(`malformed_png`)과 달랐다. "경로 통과"로 고치고 설명을 붙였다
  - [Nit] 발췌에 없던 `tests/image-crop-boundaries.test.ts:56,66,109`와 PR #66 메모는 Claude가 원문으로 확인했다
- 2차: APPROVE, 지적 0건
- 결정 기록(§7): APPROVE, 지적 0건
- Codex 교차 검토(2026-10-26): Approve. §2의 crop 오류 변환 서술이 코드와 달랐다(crop은 `source_changed`도 그대로 둔다). 정정했다. 6.9 계획(PR #72)은 이미 코드대로 적었다
