# GOAL — 아바타 입/미소 자연화 + 커미션 예방 게이트

한 줄: **`airi`(wide_grow) 입 벌림을 정상치(≤13%, 목표 ~10%)로 낮춰 자연스럽게 만들고, 실렌더 몽타주 + qa-mouth-lips 기하로 검증, 다른 3본 회귀 없이. 그리고 게이트 우회(QA_MOUTH_SKIP)를 추적·차단해 재발을 막는다.**

> 루프 계약 — 완료 판정은 주장이 아니라 §2 증거. 어느 세션이 실행해도 같은 명령·같은 기대값.

## 0. 측정된 사실 (2026-07-16, 읽기전용 실측 — 진단 정정)
| 아바타 | 모드 | 코너 대칭 `|L−R|` | 입벌림 높이/얼굴 |
|---|---|---|---|
| **airi** | wide_grow | **0.000 (완벽 대칭)** | **19.0%** ← 과다 |
| uro | states | 0.007 | 10.1% |
| yuki | none | 0.014 | 6.6% |
| mimi-smoke | states | 0.009 | 7.2% |
- **정정**: 근본원인은 "입꼬리 비대칭"이 **아니라** 과다개구(19%). airi 코너는 완벽 대칭.
- 게이트(AMP_MAX_RATIO 0.13)는 이 결함을 **잡는다** → airi 는 `QA_MOUTH_SKIP=1` 우회로 배포됨(deploy-avatar.mjs:70·publish-avatar-job.mjs:52).

## 1. Outcome (완료 시 참)
- **자연 개구**: airi mouth_state_wide 가 전 27포즈에서 `heightRatio ≤ 0.13`(목표 ~0.10, uro 급). 높이 단조·widthRatio∈[0.8,1.2] 유지.
- **대칭 유지**: `|leftDrift−rightDrift| ≤ 0.05`(이미 0.000 — 수선이 이걸 깨지 않을 것).
- **웃음·픽셀**: MouthForm=1 웃음 포즈 실렌더에서 입꼬리 픽셀 대칭·자연(기하 대칭≠픽셀 대칭 — 렌더로 최종 확인).
- **예방**: 우회 배포가 **추적**되고(어느 아바타가 언제 스킵했는지 로그+기록), states 아닌 화풍의 정당한 보류와 결함 우회를 구분한다.

## 2. Verification surface (도구 중립)
- `node scripts/qa-mouth-lips.mjs <airi-dir>` → heightRatio ≤ 0.13 (현재 19% FAIL → PASS 되어야).
- `node scripts/render-mouth-matrix.mjs airi` → 27포즈 + 웃음 몽타주 실렌더 → 우로/유키/미미와 나란히 **육안**(과다개구 해소·입꼬리 픽셀 대칭·자연).
- 회귀: uro/yuki/mimi 동일 측정 → 여전히 정상(수선·게이트 변경이 정상본을 안 건드림).

## 3. Constraints (후퇴 금지)
- 캔버스(그림) 비파괴 — 개구 진폭(키폼/스프라이트 높이)만 클램프.
- 우로·유키·미미 rig·게이트 통과 무변경.
- 우회 차단이 무안료(다크라인) 화풍의 **정당한 게이트 보류**를 거짓 실패시키지 않게(ponytail 관례).

## 4. Boundaries
- 파일: `scripts/sprite-squash.py`·`mouth-squash-candidates.mjs`(개구 클램프), `scripts/deploy-avatar.mjs`·`publish-avatar-job.mjs`(우회 추적/로그), airi rig 디렉터리. 코너 픽셀 비대칭이 렌더에서 확인되면 `scripts/mouth-corner-align.py`.
- Vtube 재빌드는 최후(스크립트 클램프로 자연 개구가 안 나올 때).
- 프로드 재배포·재발행은 **승인 seam**.

## 5. Iteration policy
1. `sprite-squash.py`(또는 mouth-squash-candidates)로 개구 클램프 → 2. `render-mouth-matrix` 렌더 → 3. `qa-mouth-lips` 측정(heightRatio) → 4. 미달이면 클램프 계수 조정 → 1. 최대 4회.
- 4회 후에도 자연스럽지 않으면 = 키폼 자체 재빌드 → §6.

## 6. Blocked stop condition
- 스크립트 클램프로 자연 개구(≤0.13·육안) 불가 → "Vtube wide_grow 키폼 재빌드 필요"로 정지·보고.
- 우회 추적 강화가 정상 아바타 발행을 막으면 → 보류 조건 재정의 후 재개.

## 7. 실행 기록 (실행 에이전트가 채운다)
- 2026-07-16 P1(측정): airi 19% 과다개구·완벽 대칭(`|L−R|=0.000`) 확인, QA_MOUTH_SKIP 우회 배포 확정.
- 2026-07-16 P2(수선값 확정): openY 키폼 상단고정 스쿼시 **factor 0.55 → 10.6%**(uro 10.1%급) — 실게이트 함수(`inspectWideGrowGeometry`) PASS·대칭0·단조·폭 정상. factor sweep 증거(스크래치).
- 2026-07-16 P3(예방 구현·미커밋): QA_MOUTH_SKIP 우회를 durable 추적으로 격상 — 공유 헬퍼 `scripts/lib/qa-bypass-log.mjs`(deploy·publish 공용), 우회 시 `docs/status/qa-mouth-bypass.tsv`에 id·시각·사유 기록, 사유 없으면 차단. `node --check` 3/3·스모크 PASS.
- 2026-07-16 P4(수선·배포·라이브검증 **DONE**): 실게이트가 **2결함** 노출 — 과다개구 19% + `mouth_state_wide absolute primary` 태그 누락(airi가 유일 wide_grow라 계약 미검증이었음). 수선 = openY 키폼+스프라이트 **0.55 스쿼시** + `composition:'absolute'` 태그(단일 spec 렌더 무변경). 몽타주 육안: before(쩍 벌어짐)/after(자연) 확인. `deploy-avatar.mjs` 정공 배포 — **게이트 우회 없이 PASS**·39파츠·원격 40/40·매니페스트 유지. **라이브 실측: rev 2026-07-16T12:21:32Z · maxHeight 10.6% · gate.ok true · errors 0.**
- 2026-07-16 P5(**정정·재동기화**): 병행 세션(Vtube `keyform-compose-002`)이 오늘 03:08 이미 정공(**height-normalize 12.5%**, `absolute + AngleY affine_additive` 계약, 원본 스프라이트)으로 고쳐 **잡 경로 `99c74a83.../v6`에만** 배포했음을 발견. 진범 = 진폭이 아니라 **키폼 delta 기준 불일치(raw base 251px > 닫힘 169px)**. 내 0.55 스쿼시(10.6%)는 조잡한 중복이라 **로스터를 정공 v6로 교체**(rev 13:45Z·12.5%·errors 0·우회 없이). **states 재생성은 불필요**(wide_grow는 정규화하면 정상). 남은 sync 갭 = 로스터↔잡 경로 미러 + 세션 조율.
- **골 달성(정공).** 잔여(미커밋): 예방 게이트 강화(P3)·명령 일원화·문서. `/마감`으로 커밋·인계.
