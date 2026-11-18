# N-34 P10 K1 공식 1회 실행 결과 (run `p10run1`)

- 상태: **사용자 승인 공식 1회 실행 종료, primary 공식 결과 PASS WITH NOTES.** timing → memory → 정보용을 모두 1회씩 실행했다. 남은 것은 문서 마감 최종 확인과 아래 §7의 후속 통합 단계다. 이 문서는 P10 완료, Ready, merge를 뜻하지 않는다
- primary 판정(`codex_review/review_2026-11-18_p10-official-primary.md`, 검토 HEAD `1e0097f`)
  - J1 유효: 필수 18행과 정보용 8행 모두 attempt 1에서 A/A 유효, K = 1, 재시도 0
  - J2 PASS: timing 18/18, memory 18/18
  - J3: 정보용 8행 모두 V, 블록 수용
  - J4: **D-0**
  - primary 독립 raw 대조 3,633개 항목 일치(불일치 0). primary scoped Argon APPROVE, 추가 지적 0
- 승인: 사용자 "승인" 2026-11-17 21:35 KST. 요청 `codex_review/review_2026-11-17_p10-official-run1-request.md`, Approval Gate `review_2026-11-17_p10-impl-final.md`(추적 안 됨)
- 기준: [n34-p10-prereg.md](n34-p10-prereg.md)(동결 `4b3e06e`). 실행 중 하네스·prereg·제품·worker·입력·임계·예산은 바꾸지 않았다
- 실행 환경: 같은 PC, Windows 10.0.26200, Node `v24.18.0`, 숨김 실행. 사용자 앱은 그대로 두었다

## 1. 실행 기록 (시각 KST, exit은 실제 프로세스 값)
| 블록 | 명령 HEAD | 시작 → 끝 | exit | 상태 | raw-only commit |
|---|---|---|---|---|---|
| check-only | `4b3e06e` | 21:41 | 0 | PASS, copy guard 위반 0 | 없음 |
| timing | `4b3e06e`(= `--prereg`) | 11-17 21:42:02 → 11-18 01:25:59 | 0 | `pass` | `6459820` |
| memory | `6459820` | 01:26:33 → 01:31:18 | 0 | `pass` | `79548cf` |
| 정보용 | `79548cf` | 01:31:40 → 03:17:15 | 0 | `completed_informational`, 처분 **D-0** | `6bd6f9a` |

- 명령은 prereg §5 그대로이고, 세 블록 모두 `--prereg=4b3e06e9b29d6671bb6346d1918ff27358ce83ad`를 썼다. 블록 사이에는 raw 파일 하나만 추가하는 commit 외에 다른 tracked 변경이 없다
- 재실행, 재개, 추가 진단, 조건 변경은 하지 않았다. 거부, 오류, 부모 중단도 없었다. NOT RUN 블록은 없다

## 2. receipt와 hash (sha256 = 커밋 blob 바이트 = 저장 파일)
| 블록 | sha256 | elapsedMs / capMs | capOverrunMs |
|---|---|---|---|
| timing | `bfa890d7c58acaa4db2c6da2846eb21213cb857e99230516cdf2d363d0f9274e` | 13,437,737 / 36,000,000 | 0 |
| memory | `c3042ff544e9996d7f8851c5db3be06f335268aee5e9dfeb1724e6a9a839a71d` | 285,191 / 3,600,000 | 0 |
| 정보용 | `1d0a24dbd4a04bf48f3bb5983ee306a7ae1bad3dcbb74a9ad59c9f38b72a02a1` | 6,335,264 / 14,400,000 | 0 |

- 각 commit 본문에는 stdout의 `P10-Receipt:` 줄이 변형 없이 한 번 들어 있다. 저자는 사용자 단독이고 trailer는 `Agent: claude-code`다
- memory와 정보용 raw의 `priorBlocks`에 앞 블록의 commit과 receipt가 기록돼 있다(runner가 시작 전에 검증한 값)

## 3. 필수 K1 결과 (run3 정의, REF = B1, CAND = C1, nearest-rank n = 30)
- **timing**: 18행 모두 `pass`. 모두 attempt 1에서 A/A가 유효했고 재시도는 0이다. 보정 K는 모든 행에서 1(사다리 1단계)이다
  - 시간 한도(run3 정의)
    - median ≤ max(REF median × 1.10, REF median + 0.5 ms)
    - p95 ≤ max(REF p95 × 1.20, REF p95 + 1 ms)
    - 이번 26행(필수 18, 정보용 8)은 모두 곱셈항이 더 크다. 그래서 아래 비교는 곱셈 한도와 같다
  - C1/B1 median 비는 G-R 0.407–1.016, G-C 0.464–1.030이다. 최대는 `O1/F7` 1.030이고 median 한도 안이다
  - p95는 모든 행에서 한도 안이다. A/A 비는 0.975–1.018이다(허용 0.95–1.05)
- **memory**: 18행 모두 `pass`. 3반복이 모두 완료됐고 행마다 output digest가 하나로 일치한다
  - R(보존 바이트): CAND − REF는 −26,344 ~ +6,792 bytes다. 모든 행이 한도(REF + max(1 MiB, 2 %)) 안이다
  - P(최대 RSS): CAND/REF가 0.104–0.837이다(한도 REF × 1.10 + 32 MiB)
- 따라서 사전등록 판정으로 J2(timing·memory 모두 pass)가 성립한다. runner 판정, §5 구현자 재계산, primary 독립 대조가 모두 일치했다

## 4. 정보용 F1 (same-input, 행마다 1회)
| 행 | 판정 | C1/B1 median | A/A 비(B, C) |
|---|---|---|---|
| `O1/F1:same-input` | V | 0.794 | 0.997, 0.979 |
| `O1/F2:same-input` | V | 0.848 | 1.000, 1.004 |
| `O1/F6:same-input` | V | 0.942 | 0.999, 1.001 |
| `O1/F7:same-input` | V | 0.943 | 1.004, 0.995 |
| `O2/F1:same-input` | V | 0.912 | 0.987, 1.002 |
| `O2/F2:same-input` | V | 0.864 | 1.003, 1.000 |
| `O2/F6:same-input` | V | 0.937 | 0.987, 1.020 |
| `O2/F7:same-input` | V | 0.947 | 1.005, 0.999 |

- 집계: V 8, X 0, C 0, I 0, N 0. 무결성 실패 0
- F1 처분(prereg §4 순서 D-3 > D-4 > D-2 > D-1 > D-0): J2가 성립하고, 무결성 실패와 C 행이 없고, 블록이 `completed_informational`이며, F1 두 행이 모두 V다. 따라서 **D-0**이다
- D-0은 이 입력(10 MiB 합성 F1), 이 PC, 이 Node로 한 번 관찰한 결과다. 일반 성능 보장이나 F1 위험 해소가 아니다
- 계획 §7.3에 따라 D-0은 기록하고 §8.2 완료 조건으로 진행한다. 추가 F1 위험 수용 결정은 필요하지 않다(D-1·D-2에만 필요)

## 5. 구현자 읽기 전용 재계산 (자기 검증)
- 스크립트: 메인 checkout `codex_review/remediation-impl-2026-11-13/p10-impl/official-p10run1/recalc/recalc.mjs`
  - runner와 contract를 import하지 않고, run3 정의를 다시 구현해 커밋 blob을 읽는다. 결과는 `recalc-out.json`에 있다
  - 대조 항목(assertion) 130개, 불일치 0. 실험·테스트 수가 아니다
  - 구현자의 자기 검증이다. primary의 독립 대조 3,633개 항목과는 별개다
- 대조 항목
  - raw-only commit 사슬: 부모, name-status, 저자, trailer, receipt 1줄 원문
  - receipt 필드 11개, blob sha256, cap, 실제 exit
  - 저장 status/exit, 예산(work·finalization 초과 0), 측정 HEAD
  - 신원 10개 필드와 snapshot(CAND ref 제외) 세 블록 동일, blob pin 7개
  - schedule 144 표본 order·label·arm, digest·view 4사본 일치
  - 통계·A/A·gate·C1/B1 비를 표본에서 다시 계산해 저장값과 정확히 같은지
  - 보정 사다리와 K, attempt 번호와 선택
  - memory run 108개 순서, 중앙값·한도, 행 판정
  - 정보용 판정과 D-0
  - child: `childId` 1..n, spawn → exit → close, exit 0, 겹침 없음, 행·run 연결
  - 정리: 잔류 0, 정리 위반 0, 임시 폴더 정리, 추적 파일 변화 0, 환경 불변
- child 수: timing 38, memory 110, 정보용 18. memory에서 순차 PID 재사용이 1건 있었다(pid 36728, `childId` 33 → 83). prereg §6이 허용하는 형태다

## 6. 남은 위험·한계
- 한 PC에서 1회 실행한 결과다. 이번 A/A는 모두 attempt 1에서 유효했지만, 이전 run에서 본 O2 A/A 불안정의 기제는 여전히 미확인이다. 재현성은 이 결과로 보장되지 않는다
- 사용자 백그라운드 앱(게임 런처, 브라우저 등)이 켜진 상태로 측정했다. A/A·교대 설계가 공통 잡음을 대조하지만, 외부 부하가 없었다고 보장하지는 않는다
- raw 일관성과 hash/commit 사슬은 기록끼리의 모순만 잡는다. 일관되게 꾸민 기록의 외부 진실은 보장하지 않는다
- D-0은 위험 해소가 아니다. P04 의존성 경고 7건과 P08 최종 통합 검증은 남는다

## 7. 다음 단계 (계획 §8.1–§8.3, 각 단계는 별도 승인 경계)
1. 이 문서 마감에 대한 primary 최종 확인
2. 후속 통합 준비 요청과 승인
3. 기준 main SHA와 PR #119 head SHA를 요청서에 고정
4. Orca가 관리하는 별도 후보 공간에서 결합(공유 branch·main·사용자 checkout 밖)
5. 후보 SHA에서 전체 gate, 결합 lock·audit, 교차 계약 검사
6. 사용자 Ready·merge 승인. 결합 후보 검증이 이 승인보다 먼저다
7. head 고정 merge, 반영 뒤 main tree와 후보 tree의 동등성 확인
8. #115 merge 또는 흡수·close 기록

- 지금은 위 2–8 단계의 실행 권한이 없다. 후보 생성, cherry-pick, Ready, merge를 하지 않는다
- P10 완료 조건(§8.2)은 그대로다: J2 PASS, 7단계 gate, primary 판정, §7.3 처분 기록, #119 처분, #115 처분
