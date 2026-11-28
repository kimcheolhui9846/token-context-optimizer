# B1 · 설치 스킬의 회색조 PNG 계약 링크

Tier D. 설치 스킬의 자르기 지침에서 지원 프로필과 한도를 확인하는 링크를 갱신했다. 배경은 O01 품질 검토 B1이다.

## 링크와 실행 결과

- 이전 링크의 고정 커밋 `31de4ff`는 회색조 PNG를 거부한다고 설명했다. [변경한 링크](https://github.com/kimcheolhui9846/token-context-optimizer/blob/976c403d30650b1aee1e16aa9db297d2ccfdc9ea/docs/image-artifacts.md#supported-input)는 병합된 기준 커밋의 **Supported input** 절로 연결된다. GitHub가 제공한 문서 blob은 로컬 Git 객체와 일치했다.
- 기존 [STDIO 테스트](../../../tests/image-gray8-mcp.test.ts)는 같은 41×29 합성 8비트 회색조 PNG를 세 번 색인한다. 프로필 생략과 명시적 `strict`는 모두 `unsupported_png_profile`을 반환한다. 명시적 `tolerant`는 `png-gray8-tolerant-v1`, `channels: 1`, `alpha: "none"`을 반환한다.
- 수정 전 해당 STDIO 테스트 3개가 통과했다. 수정 후 격리 설치본의 번들로 회색조 테스트 두 파일을 실행해 77개가 통과했다. 설치 스킬과 번들은 작업 사본과 각각 바이트가 같았다. `verify:installed`, `validate:plugin`, 스킬 검증도 통과했다.
- 기존 독립 검토는 Claude Opus 5.5의 O01 지적 S7이다. 이 링크 수정에 대한 최종 판정은 주 세션이 직접 수행한다. 실제 호스트 반영은 배포 단계에서 확인한다.
