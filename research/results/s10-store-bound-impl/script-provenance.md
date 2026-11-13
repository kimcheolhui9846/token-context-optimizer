# S-10 진단 스크립트 버전과 원자료 대응 (2026-11-13)

- diagnostic-run1.json과 diagnostic-run2.json은 **종료 코드를 처리하기 전의 parent**로 측정했다
  - parent 작업 사본 sha256: `5c73b402f1b846b04f427ead64f461d19bfe711bc7be833a0fd474af57d3809c`
  - git blob: `42cb97aaf08700eb232edd57bdfd637f118704d8`(commit b17eecf)
  - 이 parent는 판정 결과와 관계없이 exit 0으로 끝났다. run1은 D1 harnessValid=false였지만 exit 0이었다
- worker
  - run1: 하네스 수정 전 `c02f3cc31212eb1e7b56244fc3dc0692677ef9ea3f411d68386b883a7f67afa6`
  - run2: `e33bc7810f28c69f78b25a9a337a8f6be5ade7be8cf51efb7d25cdbdb01b4315`(b17eecf와 같다)
- 리뷰 지적에 따라 parent를 고쳤다(fix(review))
  - 끝에서 `process.exitCode`를 설정한다. pass와 harnessValid가 모두 true일 때만 0, 진단 FAIL·하네스 무효·child crash면 1이다
  - 시험용 `--worker=<path>`를 추가하고 `provenance.workerOverride`에 기록한다
  - 판정 기준과 측정 절차는 바꾸지 않았다
  - 새 parent 작업 사본 sha256: `f7b8f089ed0c241dc8bfa90d1a3bbbd1b392df68f3afc156de8170d043598a1c`
- 새 parent로 D1/D2 실측을 다시 하지 않았다. run1·run2 raw는 위 이전 parent의 결과이며, 최신 스크립트로 실행한 결과가 아니다
- 종료 코드 분기는 `exit-code-check/`에서 합성 stub child로만 확인했다(측정값 아님)
  - stub: `research/src/s10-store-bound-diagnostic-stub-worker.mjs`
  - 결과: pass→0, invalid→1, fail→1, crash(child exit 3, JSON 없음)→1
- 해시는 이 checkout의 작업 사본 바이트 기준이다(CRLF일 수 있다). git blob id는 LF 기준이다
