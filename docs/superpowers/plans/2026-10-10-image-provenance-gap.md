# Image Provenance Gap — Task 29 Documentation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for this documentation delivery. Astra owns plan/handoff; the delegated author owns the analysis draft. Checkboxes track evidence; acceptance changes require review.

**Goal:** 현재 이미지 원본 식별·검증 구현과 M2 변환 provenance 사이의 차이를 근거로 정리하고, 사용자 검토 가능한 최소 후속 구현안을 제안한다.

**Architecture:** 코드를 변경하지 않고 기준 SHA `73f201c638934905b1a038db3d2776e7c8872e27`의 실제 파일·심볼을 읽어 현행 기능, 미구현 기능, 미래 제안을 분리한다. 첫 후보는 제한된 8-bit RGB PNG의 정수 좌표 crop→PNG이며 공개 API나 구현 계약으로 확정하지 않는다. resize·JPEG 재인코딩·guard·pilot은 별도 후속이다.

**Tech Stack:** 한국어 Markdown, 기존 TypeScript 소스 읽기, PowerShell 문서 검사와 저장소 npm gate.

## Global Constraints

- base `73f201c638934905b1a038db3d2776e7c8872e27`, branch `codex/task-29-image-provenance-plan`.
- 새 tracked 문서는 이 계획, `docs/research/image-transform-provenance-gap.md`, `docs/agent/handoffs/task-29.md` 세 개만 허용한다. ignored root HANDOFF는 주 에이전트가 관리한다.
- Astra(주 에이전트/controller)는 이 계획과 최종 검토, Claude Code Opus 5.5는 분석 문서, 주 에이전트는 handoff·Git·PR을 담당한다. Claude 호출 불가 시에만 정확한 Codex 6 Terra로 폴백하며 모델 실행을 확인한다. 다른 작업자의 파일을 덮어쓰거나 되돌리지 않는다.
- 기존 연구 문서·공유 HANDOFF·WBS·코드·테스트·의존성·공개 API를 변경하지 않는다. 문서 예시는 실행하거나 사용자 데이터로 생성하지 않는다.
- 외부 조사·연구용 모델/API/count-tokens·업로드·실험·데이터 취득은 제외한다. 전역 하네스의 비민감 위임 작성·독립 검토 호출은 허용한다. F-12와 파일럿 모델 선택을 결정하지 않는다.
- Windows 실행은 `tty:true`, `login:false`. helper 초기화 실패 시 `sandbox_permissions: require_escalated` 승인 경로를 사용한다. 검증된 Node 보조 실행은 `windowsHide:true`를 쓴다.
- 모든 신규 설계는 **후속 사용자 승인 전 제안**이다. Task 29 완료는 M2 구현이나 안전성 검증 완료가 아니다.

## 현행 근거와 분석 수용 기준

| 근거 | 분석에서 확인할 내용 |
| --- | --- |
| `src/core/types.ts`의 `ImageArtifactRecord` | 원본 path/hash/byteLength/dimensions/profile만 있고 변환 이력·출력 관계는 없음 |
| `src/core/image-artifacts.ts`의 `indexImageArtifact`, `inspectImageArtifact`, `MemoryImageArtifactStore` | 원본 identity, 재검사와 scalar 메타데이터의 shallow copy를 재사용할 수 있으나 pixels/영구 보관은 제공하지 않음 |
| 같은 파일의 private `readBoundedSource`, `validatePng`, `MAX_BYTES/MAX_AXIS/MAX_PIXELS` | 읽기 권한·bounded validation은 존재하나 안전한 출력 쓰기 구현을 대신하지 않음; private 함수를 현재 공개 API로 기술하지 않음 |
| `src/core/jpeg-validation.ts`의 `validateJpeg` | JPEG 검증·decode는 변환/encode API가 아님 |
| `src/server/index.ts`의 `index_image_artifact`, `inspect_image_artifact` | 현재 노출된 이미지 MCP 도구는 두 개; 미래 도구 이름은 확정하지 않음 |
| `docs/image-artifacts.md` | metadata record는 backup이 아니고 서버 재시작 시 사라짐; 변환·모델 효과 미구현 경계 |
| `tests/image-artifacts.test.ts`, `tests/image-source-race.test.ts`, `tests/image-packaging.test.ts` | 실제 존재하는 원본 불변·권한·레이스·패키징 테스트와 미래 변환 테스트를 구별 |
| `docs/research/image-first-evaluation-protocol.md` §6/10 | M2의 transform provenance와 전체 pilot manifest 요구사항을 혼동하지 않음 |

분석 문서에는 다음이 있어야 한다.

1. 구현됨/없음/제안의 상태 표와 실제 상대 파일 링크·심볼. 현재 코드가 문서보다 우선하는 사실 근거다. 이번에 테스트를 실행한 결과와 단지 테스트 코드를 읽은 사실을 구별한다.
2. 재사용 가능 경계와 부족한 경계: 현재 store/inspect는 bytes를 제공하지 않는다. 새 캡처 단계가 필요하며, 재허가한 원본을 한 번 캡처한 후 검증·원본 기록의 canonical path/hash와 대조·decode·transform에 같은 buffer를 사용해야 한다. 같은 검증된 source bytes를 decode·transform·hash에 사용해야 하며 inspect 후 임의 reread로 TOCTOU가 사라진다고 가정하지 않는다. 경로와 원본 해시 기반 identity를 내용만의 identity나 immutable archive로 바꾸지 않는다.
3. 최소 후보 및 대안: **제한 RGB PNG의 정수 직사각형 crop→PNG**를 제안한다. 이미 있는 PNG 검증과 codec 의존성을 활용할 여지가 있고 resize 필터/반올림·JPEG 손실을 첫 단계에서 피할 수 있다. RGBA/resize/JPEG까지 한 번에 확장하는 대안은 범위·검증 부담 때문에 보류한다. codec 존재만으로 encoder 출력이 제한 프로필을 만족한다고 단정하지 않는다.
4. 제안 좌표 규칙: 좌상단 원점, 정수 `x/y/width/height`, half-open 영역, 양수 크기, 경계 내 crop; 소수·음수·초과 범위를 반올림·clamp하지 않고 거부하는 안. 따라서 첫 후보에는 resize 반올림이 없다. 전체 영역 crop은 명시적 no-op으로 원본 bytes/hash를 유지하고 새 파일을 만들지 않는 안을 제안한다. 이는 승인 전 권장 선택지이며 기존 동작이 아니다. 이 안에서는 output metadata가 source를 참조함을 명시하고 새 파일 생성 여부를 별도로 표현한다. no-op 거부 및 항상 재인코딩하는 대안의 장단점도 비교하며 필드명/직렬화 계약은 확정하지 않는다.
5. 제안 provenance 항목: 버전, 원본 identity/hash/dimensions/profile, 요청 crop와 effective operation/no-op, 출력 hash/dimensions/format/byteLength, 변환 구현·codec 버전. 요청/유효 변환을 구분하고 crop 단일 연산만 기록한다. 미래 연산 조합의 순서·좌표 변환은 별도 설계다. manifest hash/serialization, 저장 수명·쓰기 commit 방식·공개 도구 이름은 후속 결정 항목으로 명시한다.
6. 쓰기 안전성 제안과 한계: source 불변, 원본/출력 alias·hardlink·symlink·junction, 권한 경로와 부모 교체, exclusive create, 임시 파일/manifest 부분 실패, 정리 및 재검사, 메모리·출력 encoded-size 제한을 다룬다. read/write 권한 분리, Windows file-ID와 case/8.3/ADS/장치·확장 경로 별칭, 공유 manifest의 절대경로 노출 정책을 후속 결정으로 기록한다. 현행 PNG는 ancillary/color chunk를 거부하므로 변환에서 몰래 제거·정규화하지 않는다. codec/zlib/filter 설정에 따른 encoded bytes의 재현성은 별도 검증 대상이다. 현재 read allowlist만으로 write race가 해결됐다고 주장하지 않는다. Windows에서 검증 가능한 writer 전략이 정해지기 전 구현을 시작하지 않는다.
7. 미래 TDD 계획: 작은 독립 RGB pixel fixture의 정확한 crop 좌표, 가장자리/1-pixel/선택 승인 시 full-frame no-op, invalid/fractional/out-of-bounds crop, source 변경·revoked root·출력 충돌·부분 쓰기 실패·hash 불일치·resource limit. RED는 새 기능 부재/명시적 오류, GREEN은 한 연산 최소 구현 및 출력 재-ingest 검증, REFACTOR는 중복 정리와 기존 ingest/inspect 회귀 재검증으로 제안한다. race 테스트에는 기존 `vi.doMock` 방식과 같은 결정적 주입 지점을 제안하되 새 테스트가 이미 존재한다고 쓰지 않는다. 현재 테스트가 새 동작을 검증한 것으로 쓰지 않는다.
8. 미래 구현 진입 gate: 사용자 scope·출력 계약·공개 API 승인, codec 제한 프로필 확인, pixel/resource budget, source capture 및 race-safe writer 전략, manifest 저장·재시작 수명 결정. F-12/모델 선정과 무관하게 분석은 가능하나 실험·품질·비용 주장을 하지 않는다.

## Task 29 실행

**Files:** Create 위 세 문서. **Consumes:** 병합된 실제 소스·테스트·입력 계약. **Produces:** 구현 사실과 승인 전 제안을 분리한 분석 문서 및 검증 기록.

- [x] **1. 초기 계획:** root HANDOFF와 격리 상태를 확인하고 이 계획의 범위·수용 기준을 동결한다. 초기 독립 계획 검토 후 실제 Claude Opus 5.5에게 분석 문서만 위임한다.
- [x] **2. RED 대체와 baseline:** 순수 문서 작업이므로 새 실패 테스트는 적용하지 않는다. 위 수용 기준을 사전에 고정하고 `npm.cmd test` baseline 결과를 기록한다. 현재 의존성은 설치되어 있다. 필요 시 `npm.cmd ci`는 lockfile·설치 스크립트·네트워크 승인 조건을 확인한 후 실행하고 tracked 파일 무변경을 확인한다.
- [x] **3. 분석 작성:** Claude Opus 5.5가 위 8개 요구를 구현 사실/증거/제안/남은 결정으로 연결한다. 소스에 없는 함수·CLI·실험·테스트 결과를 만들지 않는다. 기존 분석을 불필요하게 복제하지 않는다.
- [x] **4. 검증과 검토:** 세 문서 검사, source-symbol 대조, proposal 표시, 허용 세 파일 범위, 기존 문서·runtime 무변경을 확인한다. 실제 diff와 근거를 Astra가 검토하며 분석 문서 수정은 작성자에게 반환한다. controller는 계획·handoff만 수정하고 전달받은 분석 결과를 보존한다.
- [ ] **5. 전달:** 전체 gate 후 세 문서만 commit·push하고 main 대상 Draft PR 생성. RED 예외, 문서 변경, 실제 검증과 독립 리뷰 결과·한계, 구현 미승인 경계를 PR에 기록한다.
- [ ] **6. 최종 확인:** Draft PR 후 문서 검사와 전체 gate를 다시 실행하고 Astra가 actual diff/logs/PR/upstream/head를 검토한다. 수정은 같은 PR에서 해결한다. 실패는 같은 Task에서 수정·재검증하며 해결 불가 시 BLOCKED를 보고한다. PASS/PASS WITH NOTES 보고 후 사용자 승인 대기; Task 29 Ready·merge와 다음 구현은 수행하지 않는다.

## 고정 문서 검사

세 문서가 생성된 후 worktree 루트에서 실행한다. 검사 파일이나 의존성은 추가하지 않는다.

```powershell
$paths = @('docs/superpowers/plans/2026-10-10-image-provenance-gap.md', 'docs/research/image-transform-provenance-gap.md', 'docs/agent/handoffs/task-29.md')
$problems = @()
foreach ($path in $paths) {
  $body = [IO.File]::ReadAllText((Join-Path $PWD $path))
  if ($body -match '(?m)[ \t]+\r?$') { $problems += "Trailing whitespace: $path" }
  if (-not $body.EndsWith("`n")) { $problems += "Missing final newline: $path" }
  if ([regex]::Matches($body, '(?m)^```').Count % 2) { $problems += "Unpaired code fence: $path" }
  $prose = [regex]::Replace($body, '(?ms)^```[^\r\n]*\r?\n.*?^```[^\r\n]*(?:\r?\n|$)', '')
  foreach ($match in [regex]::Matches($prose, '\[[^\]\r\n]*\]\(([^)\r\n]+)\)')) {
    $target = $match.Groups[1].Value.Trim().Trim('<', '>')
    if ($target -match '^(https?://|mailto:|#)') { continue }
    $relative = [uri]::UnescapeDataString(($target -split '#', 2)[0])
    if (-not (Test-Path -LiteralPath (Join-Path (Split-Path $path) $relative))) { $problems += "Broken local link: $path -> $target" }
  }
}
if ($problems.Count) { $problems | Write-Output; throw 'Scoped documentation checks failed' }
Write-Output 'PASS: scoped whitespace, newline, fence and relative-link checks'
```

검사는 완전한 Markdown parser가 아니다. 표·fragment·reference-style 링크, 제목/괄호 포함 링크, inline code, 다른 fence, 절대/루트 경로는 직접 확인한다. 신규 문서에는 이 단순 검사가 다룰 수 있는 상대 링크와 backtick fence를 사용한다. source-symbol 검사는 다음 결과와 문서의 주장·파일 링크를 직접 대조한다.

```powershell
rg -n 'ImageArtifactRecord|indexImageArtifact|inspectImageArtifact|MemoryImageArtifactStore|readBoundedSource|validatePng|MAX_BYTES|MAX_AXIS|MAX_PIXELS' src/core/types.ts src/core/image-artifacts.ts
rg -n 'validateJpeg|index_image_artifact|inspect_image_artifact' src/core/jpeg-validation.ts src/server/index.ts
rg -n 'it[.(]|test[.(]|describe[.(]' tests/image-artifacts.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts
git diff --check
git status --short
```

## 전체 gate와 검토 공백

아래 명령을 순서대로 실행하고 실제 exit code와 로그를 기록한다. 생성 번들 보존과 scope 확인은 아래 초기 검토 후 실행 보강 절차를 따른다. `git diff --check`만으로 untracked 신규 문서를 검증했다고 주장하지 않는다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
npm.cmd run benchmark
git diff --check
git status --short
```

2026-10-11 재개 요청에 따라 전역 하네스를 적용한다. Claude Code `claude-opus-5-5` 실제 가용성 probe는 성공했으며, 초기 계획 및 마일스톤 검토는 별도 호출로 수행하고 결과를 Task 29 핸드오프에 기록한다. 호출 불가 시에만 정확한 Codex 6 Terra를 확인한다. 두 제공자 모두 불가하면 독립 검토는 `DEGRADED`, 필수 위임 작성은 `BLOCKED`다. Task 28 리뷰를 Task 29 리뷰로 재사용하지 않는다. Astra 직접 검토와 독립 교차 검토를 구분하며 새 변환 검증 완료를 주장하지 않는다.

초기 계획 판정: **GO — SPEC PASS / QUALITY PASS WITH NOTES.** 별도 Claude 재검토에서 M1–M6 ADDRESSED, blocker/major 0. 미래 crop 제안의 구현·공개 API·배포·실험은 승인되지 않았다.

## 초기 검토 후 실행 보강

- 소스 심볼이 없으면 사실 문구를 수정하고 근거를 확인한다. `rg` 미설치 시 `git grep -n`으로 대체한다. 현재 `rg` 실행 성공을 확인했다.
- Astra가 현재 코드에서 `fast-png` 8.0.0, PNG bit depth 8/color type 2 또는 6/interlace 0, `validateJpeg`와 `jpeg.decode`, 세 cap 상수, shallow copy, `validatePng`의 IHDR/IDAT/IEND 이외 chunk 거부와 race 테스트의 `vi.doMock`을 확인했다. 같은 canonical path/hash의 재-index identity는 `indexImageArtifact`를 근거로만 설명한다. 문서에는 실제 값과 심볼을 기록한다.
- `scripts/smoke-mcp.mjs`는 임시 로컬 MCP 서버와 fixture, `benchmarks/run.ts`는 기존 합성 text fixture를 사용한다. 현재 gate는 hosted-model 호출이나 이미지 실험이 아니다. build는 dist 및 생성 번들을 쓴다.
- build 전 status와 번들 bytes를 보존한다. build 후 차이가 줄바꿈 정규화로만 설명되는 경우 그 파일만 build 전 bytes로 복원한다. 다른 내용 차이는 중단·검토하며 사용자 변경을 덮어쓰지 않는다.
- 세 파일의 whitespace/newline/fence/link를 stage 전 검사한다. stage 후 `git diff --cached --check`, staged 경로가 아래 세 파일과 정확히 같은지 검사한다. commit 후 `git diff --name-only 73f201c...HEAD`도 동일하게 검사한다.
  - `docs/superpowers/plans/2026-10-10-image-provenance-gap.md`
  - `docs/research/image-transform-provenance-gap.md`
  - `docs/agent/handoffs/task-29.md`
- 공개 문서는 실제 사용자 홈 경로·이메일·credential/token 형태를 검사하고 사람이 재검토한다. 예시/근거는 repo-relative 경로만 쓴다.
- Task handoff는 목적·범위·계획·파일 변경·판단·실행한 명령과 결과·오류·실제 모델/단계별 독립 검토·자체 리뷰·남은 결정·승인 경계·최종 요약을 갖춘다. 작성과 검토는 별도 Claude 호출로 수행하며 다중 모델 합의로 표현하지 않는다.

실행 보강의 stage 후 정확한 경로 검사는 다음과 같다. 별도 local scratch는 ignored `.superpowers/sdd/2026-10-10-image-provenance-gap/`이며 build 전 번들 bytes와 gate 로그를 보관한다. 공개 diff에는 포함하지 않는다.

```powershell
$expected = @('docs/agent/handoffs/task-29.md', 'docs/research/image-transform-provenance-gap.md', 'docs/superpowers/plans/2026-10-10-image-provenance-gap.md') | Sort-Object
$actual = @(git diff --cached --name-only) | Sort-Object
if ($LASTEXITCODE -ne 0 -or $actual.Count -ne 3) { throw 'Invalid staged scope' }
if (Compare-Object $expected $actual) { throw 'Unexpected staged paths' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace failure' }
rg -n 'fast-png|jpeg\.decode' package.json src/core/image-artifacts.ts src/core/jpeg-validation.ts
rg -n 'vi\.doMock' tests/image-source-race.test.ts
$leaks = Select-String -Path $expected -Pattern '[A-Za-z]:[/\\]Users[/\\]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})'
if ($leaks) { throw 'Review potential private data before push' }
```

검색은 보조 검사이며 false positive와 누락을 사람이 확인한다. commit 후에는 `$actual = @(git diff --name-only 73f201c...HEAD) | Sort-Object`로 같은 경로 검사를 반복한다.
