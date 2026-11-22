# R08 연구 버전과 최신 제품의 결정적 비교 근거 (r08-parity)

- 실행: 2026-11-22, Claude Code. 모델 호출 0, 비용 0
- 상세 해석은 [r08-research-product-parity.md](../../../docs/research/r08-research-product-parity.md)에 있다. 이 폴더는 근거 수치만 둔다.
- 코드: `research/src/r08-excerpt-capture.mjs`, `r08-excerpt-parity.mjs`, `r08-jpeg-entry.mjs`, `r08-jpeg-parity.mjs`

## 역할과 번들

번들은 각 커밋의 `bin/token-context-optimizer.mjs`를 `git cat-file blob`으로 꺼낸 원시 바이트다(개행 변환 없음). SHA-256은 전체 길이다.

| 역할 | 커밋 | SHA-256 |
|---|---|---|
| exp3 | `7914a44abd03b3f403fb57589893720fc3cd419a` | `30b76db869c8e53a11cbd87200091e07fe986de89f4c5954b7796894b5376ae4` |
| pre002 | `c2237ca23ae3f96d63ac2794ce34ecfd557a1415` | `1267f3de364b4b2ac73f3acea8e683897af075196c925412eea9fac22bbb22b4` |
| post002 | `68fe59dea179563f209da9d48282d42ba3ceeeea` | `98c707dab49072f8b210fe9ba3fe2cf9dde863844803666d68dbc632a25175fd` |
| latest | `c201b69cd606838f371049df1b3d8f85481be825` | `6265b9b4bb650c947a9ec6cd6f83b9215d0e75fd63a5e4b8a0093e6891c76fa8` |

## 파일

| 파일 | 내용 |
|---|---|
| `excerpt-keys.jsonl` | 297줄. 줄마다 키 하나(`split/session/turn/variant`) |
| `excerpt-summary.json` | 텍스트 발췌 비교 요약. schema `r08-excerpt-parity/v1` |
| `jpeg-summary.json` | JPEG 비교 요약. schema `r08-jpeg-parity/v1` |

### excerpt-keys.jsonl

- 줄의 필드: `key`, `type`, `applicable`, `goldLine`, 그리고 역할 `exp3`, `pre002`, `post002`, `latest`
- 역할 필드마다 `h`(정규화 응답 해시 앞 16자), `ranges`(발췌 구간), `hit`, `hitAny`

### excerpt-summary.json 주요 필드

`schema`, `failures`, `expectedKeys`, `roles`, `runtime`, `unstableKeys`, `manifestCheck`, `pairs`, `roleSummaries`, `storedComparisons`, `rawSha256`, `excerptKeysSha256`

### jpeg-summary.json 주요 필드

`schema`, `failures`, `probe`, `entry`, `otherRoles`, `rq1SettingsOnly`, `fixtures`, `meta`, `tools`, `rawSha256`, `fixtureCalls`

## 핵심 수치 (JSON에서 그대로 옮김)

### 텍스트 발췌 (excerpt-summary.json)

- `failures`: 0건(빈 배열), `expectedKeys`: 297
- `unstableKeys`: exp3 0, pre002 0, post002 0, latest 0

| pairs | compared | identical | firstExcerptIdentical |
|---|---|---|---|
| exp3 → pre002 | 297 | 297 | 297 |
| pre002 → post002 | 297 | 286 | 297 |
| post002 → latest | 297 | 297 | 297 |
| exp3 → latest | 297 | 286 | 297 |
| pre002 → latest | 297 | 286 | 297 |

| storedComparisons | storedRows | differingRows |
|---|---|---|
| excerpt-bench-001 vs exp3 | 297 | 0 |
| excerpt-bench-001 vs pre002 | 297 | 0 |
| excerpt-bench-002 vs post002 | 297 | 0 |
| excerpt-bench-002 vs latest | 297 | 0 |

### JPEG (jpeg-summary.json)

| 항목 | 값 |
|---|---|
| `probe.compared` / `probe.identical` | 458 / 458 |
| `entry.agree` | default 458, tolerant 458, app0Default 458 |
| `entry.outcomes` | `default=unsupported_jpeg_profile tolerant=pass(jpeg-ycbcr8-tolerant-v1) app0Default=pass`: 458 |
| `fixtures.agreeDefault` / `fixtures.agreeTolerant` | 63 / 63 |
| `rq1SettingsOnly.rowsIdentical` | true |

## 원시 자료

- 원시 응답, 번들, 이미지는 커밋하지 않았다. 로컬 scratch에만 있다.
- 그 SHA-256은 각 JSON의 `rawSha256`에 있다. `excerpt-keys.jsonl`의 SHA-256은 `excerpt-summary.json`의 `excerptKeysSha256`에 있다. 이 해시와 `rawSha256`은 LF 원본 기준이다. autocrlf 작업 사본(CRLF)에서는 값이 다르므로 `git show HEAD:<경로>`로 꺼내 확인한다.
