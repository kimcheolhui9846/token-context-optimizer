# JPEG codec 실행 가능성 조사

2026-09-21 Task 21. 연구 준비용 로컬 probe 결과이며 제품 JPEG 지원이나 논문 효과 실험이 아니다. [승인 전 설계](../superpowers/specs/2026-09-21-jpeg-ingest-design.md).

## 관찰 근거

Node v24.18.0, jpeg-js 0.4.4를 ignored scratch에 풀어 실행했다. production package.json/lockfile은 변경하지 않았다. tarball SHA-256은 `269f988267bc71efe58baf97e8b2da064b5bbbbb8b0eab11e2149049935e1160`이다.

독립 System.Drawing encoder로 8×8 RGB gradient JPEG를 생성했다. 좌표(x,y)의 RGB는 (30+10x,60+10y,120), 651 bytes, SHA-256 `7d7db20f927304cb7bcdd509cd1512b6e54c39c424fc553831afa22925a19575`. SOF marker offset 158, 첫 DHT 177, SOS 609, EOI 649다. decoder 자체 encoder로 만든 fixture가 아니다.

명령: `node .artifacts/task21-codec-probe/probe.cjs`. 중단 후 같은 명령을 다시 실행하여 아래 결과를 확인했다. scratch의 `make-fixture.ps1`, `probe.cjs`, `probe-output.json`, fixture, 압축 package는 보존되지만 Git 산출물은 아니다. 아래 mutation/옵션으로 동등한 probe를 구성할 수 있으며, OS encoder 버전 차이에 따른 byte 차이는 hash로 구분해야 한다.

strict 옵션: `{ tolerantDecoding:false, useTArray:true, maxResolutionInMP:1, maxMemoryUsageInMB:16 }`. default/strict 모두 반환 RGBA 길이는 정상 반환 시 256 bytes였다.

PR 재현성 제한: 정확한 실행 script/fixture는 로컬 scratch에만 있으므로 PR만 받은 검토자는 위 방법으로 별도 재구성해야 한다. 결과 요약은 완전한 portable reproduction package가 아니다.

| 입력 mutation | default | strict |
|---|---|---|
| 원본 | 수락 | 수락 |
| EOI 직전 `12 34` 추가 | 수락 | 수락 |
| EOI 직전 `FF 00` 추가 | 수락 | 수락 |
| EOI 뒤 `12 34` 추가 | 수락 | 수락 |
| SOF length를 1로 변경 | 수락 | 수락 |
| EOI 제거 | 거절: marker was not found | 동일 |
| scan 마지막 5 bytes 제거 후 EOI 유지 | 거절: unexpected marker: ffd9 | 동일 |
| 첫 DHT length를 1로 변경 | 거절: unknown JPEG marker 0 | 동일 |

원본에 resolution 0.000063 MP(63 pixels)를 적용하면 limit 오류, memory accounting 1 byte를 적용하면 limit 오류가 관찰됐다. 이는 작은 fixture에서 옵션이 작동한다는 증거이며 최대 입력/peak RSS/CPU 상한 증거는 아니다. strict 성공도 전체 입력 소비의 증거가 아니다.

## 해석과 제한

[공식 v0.4.4 decoder](https://github.com/jpeg-js/jpeg-js/blob/v0.4.4/lib/decoder.js)의 scan 후 byte 건너뛰기와 일치하는 결과다. marker 구조 검사만으로 SOF 길이/EOI 뒤 데이터를 거절할 수 있지만, EOI 앞 entropy의 정확한 소비를 증명할 수는 없다. 별도 entropy 검증 또는 검증된 codec 수정이 필요하다.

[공식 README](https://github.com/jpeg-js/jpeg-js)는 synchronous pure JavaScript decoder와 resource 옵션을 설명한다. 내부 Int32 block 계수, component line, 출력 버퍼 등으로 메모리를 사용하므로 RGB 출력 크기만으로 메모리를 산정하지 않는다. 128 MiB 제안의 최대 허용 크기와 총 메모리는 아직 실증하지 않았다.

package LICENSE는 Eugene Ware 저작권의 3-clause 조건이며 decoder 파일에는 notmasteryet의 Apache-2.0 header가 있다. 배포 시 두 출처를 확인해야 한다. 이는 법률 판단이나 라이선스 준수 완료 선언이 아니다.

형식 검증의 구현 기준은 [ITU T.81 Annex B/C/F](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)와 [JFIF](https://www.w3.org/Graphics/JPEG/jfif3.pdf)다. 이번 probe는 JPEG 표준 전체 적합성 시험이 아니며, 새로운 validator의 구현 가능성/정확성은 후속 TDD와 검토에서 입증해야 한다.
