# Task 28 Paper Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병합된 Task 27의 모델별 이미지 토큰 회계 근거를 기존 논문과 평가 프로토콜에 반영하되 실측 결과나 논문 방향 결정으로 확대하지 않는다.

**Architecture:** 기존 논문 §3.3/5/6과 프로토콜 §6/7에 한정해 출처 기반 산술 예제, 관측 계획, 해석 한계를 연결한다. 근거의 단일 참조는 `docs/research/image-token-cost-models.md`이며 이 파일의 수치나 출처는 수정하지 않는다. 이 계획의 단계는 모두 하나의 사용자 검토 단위인 Task 28에 속한다.

**Tech Stack:** 한국어 Markdown, 기존 PowerShell 문서 검사, npm 저장소 검증 스크립트. 런타임·의존성·테스트 코드 변경 없음.

## Global Constraints

- 기준은 PR #27 병합 커밋 `9aaf8235bd7954ed7d9ff8d8855e5275c08efcea`, 브랜치는 `codex/task-28-paper-evidence`다.
- 구현 담당은 실제 호출 가능한 Luna, 계획·최종 검토는 Astra다. 공유 파일을 병렬 수정하지 않는다.
- Windows 명령은 `tty:true`, `login:false`; background 창이나 보안 설정을 바꾸지 않는다.
- 신규 계산, 신규 외부 출처, API/count-tokens 호출, 이미지 업로드, 실제 실험, 데이터 취득, 구현·의존성·사용자 WBS 변경은 제외한다.
- `docs/agent/HANDOFF.md`는 수정하지 않는다. root `HANDOFF.md`와 Task 전용 handoff는 주 에이전트가 관리한다.
- F-12 방향 결정은 미해결이다. 선택 질문에 답이 없으면 기존 구조의 근거 보강만 수행하며 답 부재를 방향 승인으로 해석하지 않는다.
- F-06은 출처 근거 부분만 보완한다. WBS 5.1/5.6 실측은 여전히 미완료다.
- 12 calibration/36 held-out families, 계획된 720 calls(A–D 576/E 144), A–E arms, D−C primary, C−B/D−A secondary를 보존한다.
- 1536px/q75는 미검증 calibration 후보다. 비용·가독성·정확도·안전성의 검증된 임계값으로 표현하지 않는다.

## 파일 책임과 수용 기준

| 파일 | 책임 / 허용 변경 |
| --- | --- |
| `docs/superpowers/plans/2026-10-10-paper-evidence.md` | Astra 계획 및 실행 체크리스트 |
| `docs/research/image-first-paper-draft.ko.md` | Luna: §3.3/5/6만 근거·측정 경계 보강 |
| `docs/research/image-first-evaluation-protocol.md` | Luna: §6/7만 향후 기록·분석 경계 보강 |
| `docs/agent/handoffs/task-28.md` | 주 에이전트: 실제 결과·검토·승인 경계 기록 |

root HANDOFF는 기존 ignored 운영 기록으로 유지하고 커밋 대상에 추가하지 않는다. 위 네 문서 외 변경은 즉시 원인을 확인하며 다른 작업자의 변경을 되돌리지 않는다.

- 모든 수치는 기존 근거 문서의 예제이며 실측·전체 데이터셋 절감률·공급자 일반론이 아님을 바로 인접한 문장으로 명시한다.
- Haiku 4.5 standard 예제 0–1.79%, GPT-4o high 예제 최대 22.22%와 low 고정 85토큰/차이 0을 정확히 옮긴다.
- Sonnet 5.5 high-resolution의 **양수 예제** 36.64–64.36%, Sol auto=original의 **거부되지 않은 축소 예제** 43.76–85.94%, high 양수 예제 7.83%, low 예제 0%를 조건부로 옮긴다. no-op과 0 사례를 보편적인 양수 범위에 포함한 것처럼 쓰지 않는다.
- Sol original/auto/생략의 65,535px 축 상한과 처리 뒤 30,000 patches 초과 거부를 구별한다. 거부 한도에 맞춘 자동 재축소로 쓰지 않는다. 원본 거부는 비교 기준 미정의이며 절감 사례가 아니다.
- Gemini의 명목 budget 차이 0은 실제 토큰 차이 0을 뜻하지 않는다. 실제 B/C/차이와 크기 경계의 미확인을 유지한다.
- 기존 세 pilot 후보와 두 accounting-family 대조 모델의 역할을 보존한다. 추가 모델을 pilot 확정이나 모델 품질 순위로 표현하지 않는다.
- JPEG q75: OpenAI/Anthropic 공개 회계식에는 quality 변수가 없고 Gemini 영향은 미문서화다. 바이트·지연·품질·청구는 미측정이며 작은 글자 손상 가능성은 기존 출처 안내의 한계로만 전달한다.
- 실제 usage가 없으면 unknown이다. 추정치나 nominal budget으로 실측 칸을 채우거나 0 처리하지 않는다.

## Task 28 실행 단계

**Consumes:** 병합된 `image-token-cost-models.md`의 기존 예제와 현재 논문·프로토콜.

**Produces:** 범위가 고정된 두 연구 문서, 검증 가능한 handoff, Draft PR와 최종 Astra 판정.

- [x] **1. 기준 확인 및 초기 검토:** 격리된 worktree의 diff/status와 root HANDOFF를 확인한다. 초기 외부 교차 검토 상태를 아래와 같이 기록한 뒤 Luna에게 두 연구 문서만 위임한다.
- [x] **2. RED 대체:** 순수 문서 변경이므로 실패 테스트 추가는 적용하지 않는다. 위 수용 기준, 네 문서 검사, 기존 설계 보존을 편집 전 검사 기준으로 동결한다. 기존 `npm.cmd test` baseline 결과를 기록한다. 새 worktree의 누락된 node_modules/fast-png로 baseline이 실패했다면 원인과 lockfile 기반 `npm.cmd ci` 후 재실행 결과를 구별한다. 설치가 보고한 기존 취약점은 별도 노트로 남기고 audit fix나 의존성 변경을 하지 않는다.
- [x] **3. 논문 §3.3:** 기존 바이트/비용 구분에 근거 문서 상대 링크와 조건부 회계 요약을 추가한다. 비용 예제의 B/C가 평가 arm B/C를 뜻하는 것으로 오해되지 않게 '원본/변환 회계 비교'라고 설명한다.
- [x] **4. 논문 §5/6:** §5는 실험 결과 미측정을 유지하면서 '실측 절감률 없음'과 '출처 기반 산술 예제 존재'를 구별한다. §6은 계열·설정·입력 치수에 따른 차이, rejection·unknown, q75 작은 글자 위험과 실청구/품질 미검증을 설명한다. 서론·제목·초록·결론·평가 설계를 재구성하지 않는다.
- [x] **5. 프로토콜 §6:** 기존 manifest 목록을 유지하고 향후 관측 시 요청 설정과 실제 처리 정보(알 수 없는 것은 unknown), 원본/변환 치수·바이트, 공식 추정/명목 예산, count-token 결과(실행된 경우에만), API usage, 실제 청구와 rejection 상태를 서로 구별하도록 문장으로 보강한다. 이는 기록 계획이며 manifest 코드나 스키마 구현이 아니다.
- [x] **6. 프로토콜 §7:** 모델·설정·회계 계열·입력 조건별 해석과 missing usage 유지, rejection 비교 불가를 명시한다. 기존 failure/timeout assigned denominator 규칙을 보존한다. 회계 비교 불가는 할당된 품질 평가 분모에서 실패를 제외한다는 뜻이 아니다. 기존 paired 분석과 primary/secondary 대비는 변경하지 않는다.
- [x] **7. GREEN/REFACTOR:** 수치와 조건을 근거 문서의 해당 행에 직접 대조하고 불필요한 중복만 줄인다. 아래 네 문서 검사와 diff를 확인하고 전체 gate를 순서대로 실행한다. 소프트웨어 테스트 통과를 이미지 실험 검증으로 쓰지 않는다.
- [x] **8. 마일스톤 검토:** 주 에이전트가 실제 로그·변경·미측정·외부 검토 공백을 handoff에 기록한다. Astra가 범위와 수치·조건 누락을 직접 검토한다. 승인 범위 내 오류만 고친 뒤 관련 검사를 반복한다.
- [x] **9. Git/PR:** 주 에이전트가 네 문서의 최종 diff를 보고 Task 커밋·upstream push를 수행한다. `main` 대상 Draft PR에 요구사항, 문서 RED 예외, 실제 검증, DEGRADED, 실험 미실행과 승인 경계를 쓴다. push 결과 및 PR head SHA를 확인한다.
- [x] **10. 최종 gate와 Astra 검토:** Draft PR 생성 후 아래 검사와 전체 gate를 새로 실행한다. Astra는 실제 diff·로그·handoff·branch/head/push·Draft 상태를 직접 보고 판정한다. 수정 발생 시 같은 브랜치/PR에서 추가 커밋·push·검증·재검토한다.
- [x] **11. 종료:** 사용자 Task Review Result로 보고하고 승인 대기한다. Task 28 Ready 전환·merge 및 Task 29 구현은 하지 않는다.

## 고정 문서 검사

worktree 루트에서 실행한다. untracked 파일도 직접 읽는다. 외부 링크는 새로 조사하지 않고 이미 병합된 근거 문서로 연결한다.

```powershell
$paths = @('docs/superpowers/plans/2026-10-10-paper-evidence.md', 'docs/research/image-first-paper-draft.ko.md', 'docs/research/image-first-evaluation-protocol.md', 'docs/agent/handoffs/task-28.md')
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
    if (-not (Test-Path -LiteralPath (Join-Path (Split-Path $path) $relative))) {
      $problems += "Broken local link: $path -> $target"
    }
  }
}
if ($problems.Count) { $problems | Write-Output; throw 'Scoped documentation checks failed' }
Write-Output 'PASS: scoped whitespace, newline, fence and relative-link checks'
```

이는 완전한 Markdown parser가 아니다. 표·문장·fragment·reference-style 링크는 직접 확인한다. 모든 수치의 조건과 예제 범위를 원문과 대조하고, diff가 논문 §3.3/5/6·프로토콜 §6/7에 국한되는지 검사한다.

## 전체 gate

다음 명령을 순서대로 실행하고 각 exit code와 실제 결과를 기록한다. 실패하면 다음 단계를 성공으로 기록하지 않는다. Draft PR 전과 생성 후 모두 실행한다.

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

추가 lint/format 스크립트는 package.json에 없으므로 만들어내지 않는다. 네 문서 검사로 문서 형식을 확인하며 신규 checker 파일·의존성은 추가하지 않는다.

## 교차 검토와 위험 판단

초기 계획 및 마일스톤 모두 `Cross-check status: DEGRADED`를 명시한다. 이번 범위의 외부 모델/API 호출 금지를 유지하며 Claude Opus 5, Gemini 무료 모델·quota, Copilot 실제 호출 가능성을 확인하지 않았으므로 각각 검토 미수행으로 기록한다. 실행 파일 존재나 로그인만으로 모델·quota 확인을 대신하지 않는다. 2026-10-09 사용자 제공 Claude 검토는 Task 27에만 해당한다.

native Astra는 별도 계획/최종 검토이며 위 외부 제공자 교차 검토가 아니다. 외부 독립 검토 부재로 표현상의 과장·조건 누락 위험이 남는다. 이를 완화하려고 신규 수치·출처를 만들지 않고 기존 표와의 직접 대조, 고정 범위 diff, 문서 검사와 기존 gate를 사용한다. 이 검증은 실측 공백이나 외부 검토를 해소하지 않는다.

계획 판정: **GO — 위 범위의 문서 구현에 한함.** 미해결 F-12 방향, WBS 5.1/5.6 실측, 외부 교차 검토 부재를 완료로 선언하지 않는다.
