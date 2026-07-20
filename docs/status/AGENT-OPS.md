---
tags: [agent-entry, ops]
state: ACTIVE
last_daily: null
last_weekly_security: null
last_cs_sweep: null
open_issues: 2
---

# AGENT-OPS — ChatterBox 자율 에이전트 운영 진입문서

> **에이전트가 깨어나면 이 파일을 제일 먼저 읽는다.**  
> 루틴 종류(일간·주간·CS)를 확인하고 해당 섹션의 체크리스트를 실행한다.  
> 작업이 끝나면 상단 frontmatter의 `last_*` 날짜와 `open_issues`를 갱신한다.

---

## 루틴 매트릭스

| 루틴 | 주기 | 크론 (KST) | 진입 스킬/커맨드 | 보고 채널 |
|---|---|---|---|---|
| 문서·계약 건강성 | 매일 | `0 9 * * *` | `/doc-health-check` | Slack `#agent-log` |
| 보안 드리프트 + 레드팀 | 매주 월 | `0 9 * * 1` | `§ 주간 보안 체크리스트` | Slack `#security-alerts` |
| CS 인입 분류 | 매시간 | `0 * * * *` | `/cs-triage` | Slack `#cs-inbox` |
| GAP·마일스톤 리뷰 | 매주 금 | `0 9 * * 5` | `§ 주간 진행도 리뷰` | Slack `#dev-log` |

> **트리거 설정 상태:** 미설정 (앱 배포 후 `create_trigger` MCP로 등록 예정 — `§ 트리거 등록 플랜` 참조)

---

## § 일간 체크리스트 (매일 09:00 KST)

### 1. 계약서·문서 게이트

```bash
cd /Users/family/jason/ChatterBox
npm run docs:check       # contract-docs PASS 아니면 즉시 수정
npm run docs:health      # staleness·고아 파일·크기 경고
```

- `docs:check` FAIL → 어떤 계약서가 깨졌는지 분석 후 수정, Slack `#agent-log` 보고
- `docs:health` 경고 → 수준에 따라 수정 또는 이슈 등록

### 2. 앱 구현 Phase 확인

- 파일: `docs/plan/IMPLEMENTATION-ORDER.md`(Phase 정의·의존 순서) + `docs/GAP-MATRIX.md`(GAP 상태)
- 현재 구현 Phase 확인 (Phase 0 미착수 → Phase 1 인증 순서)
- `⏳`/`BLOCKED` 항목이 블로킹 상태인지 확인
- 주의: `docs/status/PROJECT-STATUS.md`는 **랜딩 페이지(snack-web) 전용**이며 앱 구현 Phase와 무관하다 — 혼동 금지

### 3. GAP-MATRIX 상위 TODO 3개

- 파일: `docs/GAP-MATRIX.md`
- `TODO` 상태 항목 중 IMPLEMENTATION-ORDER.md 현재 Phase 내 항목 추출
- 진행 중인 구현과 계약서 드리프트 없는지 확인

### 4. 보고

```
[일간 리포트] YYYY-MM-DD
- docs:check: PASS / FAIL (원인)
- docs:health 경고: N건
- 현재 Phase: Phase N (Phase 목표: ...)
- 이번 주 TODO GAP: G-XX, G-XX, G-XX
- 조치사항: 없음 / [상세]
```

→ Slack `#agent-log` 전송

---

## § 주간 보안 체크리스트 (매주 월 09:00 KST)

### 1. 정책 드리프트 감지

SecurityPolicies.md의 구현 체크리스트 `[ ]` 항목을 스캔:

- 파일: `docs/specs/SecurityPolicies.md`
- `[ ]` 항목 카운트 → 지난 주 대비 변화 확인
- 새로 추가된 계약서·RLS 정책 중 SecurityPolicies와 충돌하는 항목 탐지

### 2. 레드팀 시뮬레이션 (간소화)

> 병렬 다역할 감사 절차(저가 모델 N역할 Find → 직접 검증 → 고가 모델 클러스터 분리 Fix)는 `.claude/skills/gap-find/SKILL.md` 참조. 보안 외 정합성/기능갭/운영 렌즈로 확장 가능.

4개 역할 순서로 공격 경로 체크:

```
① 미인증 게스트: ViewerGate → invite brute-force 경로
② 악성 뷰어: messages INSERT 직접 시도, 정원 레이스, users SELECT *
③ 강퇴 액터: LiveKit 재입장, room-authority 스푸핑
④ 내부 위협: host_id 노출, public_user_profiles view 준수 여부
```

각 항목을 계약서/SecurityPolicies 기준으로 현재 문서 상태에서 평가.  
새 취약점 발견 시 → SecurityPolicies.md 즉시 패치 + Slack `#security-alerts` P0/P1/P2 분류로 보고.

### 3. 환경변수·시크릿 확인

- `.env`, `.env.local`이 `.gitignore`에 있는지 확인
- Edge Function 환경변수 목록 (SecurityPolicies §9)이 최신인지 확인
- `VITE_` 접두사 변수 중 시크릿이 섞여 있으면 즉시 경보

### 4. 보고

```
[주간 보안 리포트] YYYY-WW
- SecurityPolicies 미구현 항목: N개 (지난 주 대비 ±N)
- 레드팀 신규 취약점: 없음 / [VUL-XX 목록]
- 시크릿 노출 위험: 없음 / [내용]
- 조치사항: [상세]
```

→ Slack `#security-alerts` 전송

---

## § CS 인입 분류 (매시간)

> 자세한 분류 로직은 `.claude/skills/cs-triage/SKILL.md` 참조.

### 수신 채널

| 채널 | 확인 방법 | SLA |
|---|---|---|
| Discord `#도움말` | Slack 미러링 또는 수동 | 24시간 |
| Discord `#버그리포트` | Slack 미러링 또는 수동 | 48시간 확인 |
| 이메일 (Tally 폼) | Gmail MCP `search_threads` | 72시간 |

### 분류 → 대응 매트릭스

| 분류 | 기준 | 대응 | 에스컬레이션 |
|---|---|---|---|
| `P0_보안` | 취약점·데이터 유출 의심 | 즉시 Slack `#security-alerts` + 조사 착수 | 주인님 직접 알림 |
| `버그_블로킹` | 앱 진입 불가·데이터 손실 | 48시간 내 재현 시도·픽스 PR | `#dev-log` |
| `버그_일반` | 기능 오작동·UI 깨짐 | SUPPORT-PLAYBOOK.md FAQ 매칭 후 응답 초안 | 주 1회 배치 처리 |
| `기능요청` | 새 기능·개선 아이디어 | 감사 응답 + GAP-MATRIX 미등록이면 후보 추가 | 없음 |
| `문의_일반` | HOW-TO·사용법 | SUPPORT-PLAYBOOK.md 스크립트로 즉시 응답 | 없음 |
| `결제·계정` | 환불·계정 삭제 | 이메일로 수집 후 주인님 전달 | 반드시 주인님 |

### 보고

```
[CS 스윕] YYYY-MM-DD HH:00
- 신규 인입: N건
- P0_보안: 0건 / N건 (즉시 처리)
- 버그_블로킹: N건
- 응답 초안 작성: N건
- 미해결 누적: N건
```

---

## § 주간 진행도 리뷰 (매주 금 09:00 KST)

- IMPLEMENTATION-ORDER.md 현재 Phase 목표 달성도 평가
- 이번 주 완료된 Feature ID 목록 업데이트
- 다음 주 착수 예정 항목 확인 (의존성 블로킹 없는지)
- MILESTONES.md AC 기준 달성 여부 체크

```
[주간 진행도] YYYY-WW
- 현재 Phase: N / 완료율: N%
- 이번 주 완료: [Feature ID 목록]
- 다음 주 착수: [Feature ID 목록]
- 블로커: 없음 / [내용]
```

→ Slack `#dev-log` 전송

---

## § 트리거 등록 플랜

앱 배포(Vercel) 완료 후 아래 순서로 `create_trigger` MCP를 이용해 설정한다.

```
1. 일간 문서 헬스 (최우선)
   create_trigger({
     name: "chatterbox-daily-health",
     cron_expression: "0 0 * * *",   // 09:00 KST = 00:00 UTC
     prompt: "AGENT-OPS.md § 일간 체크리스트를 실행하고 Slack #agent-log에 보고하라."
   })

2. 주간 보안 리뷰
   create_trigger({
     name: "chatterbox-weekly-security",
     cron_expression: "0 0 * * 1",   // 월 09:00 KST
     prompt: "AGENT-OPS.md § 주간 보안 체크리스트를 실행하고 Slack #security-alerts에 보고하라."
   })

3. CS 스윕 (배포 후 사용자 유입 시작 시점)
   create_trigger({
     name: "chatterbox-cs-hourly",
     cron_expression: "0 * * * *",
     prompt: "/cs-triage — Discord/이메일 인입을 분류하고 Slack #cs-inbox에 보고하라."
   })

4. 주간 진행도 리뷰
   create_trigger({
     name: "chatterbox-weekly-progress",
     cron_expression: "0 0 * * 5",   // 금 09:00 KST
     prompt: "AGENT-OPS.md § 주간 진행도 리뷰를 실행하고 Slack #dev-log에 보고하라."
   })
```

---

## § 에스컬레이션 + 보고 채널 구성

| 채널 | 용도 | 트리거 조건 |
|---|---|---|
| Slack `#agent-log` | 일간 루틴 결과 | 매일 자동 |
| Slack `#security-alerts` | 보안 이슈 | 취약점 발견 즉시 |
| Slack `#cs-inbox` | CS 인입 요약 | 매시간 자동 |
| Slack `#dev-log` | 진행도 + 버그 블로킹 | 주간 + 블로킹 발생 시 |
| Gmail (주인님) | 결제·계정·P0 보안 | 즉시 직접 전달 |

> **Slack 채널 설정:** Slack MCP `slack_send_message`로 즉시 사용 가능.  
> 채널이 없으면 생성 후 이 문서 갱신.

---

## § 현재 열린 이슈 (에이전트가 갱신)

| ID | 분류 | 내용 | 발견일 | 상태 |
|---|---|---|---|---|
| ISS-04 | CS·버그_일반 | poon995(잡 `5529ea2c`) 아바타 입술 소실 — **근본원인 확정**: AUTORIG 생성 `mouth_state_small/mid` 립 안료 누락 → MouthOpenY 0.245~0.47 밴드(발화 중)에서 입술 소실 발현(상태×각도 매트릭스 실렌더 재현). **P1 완료(2026-07-13)**: closed_master 크로스페이드(0.30→0.60) 프로드 반영+백업(`project.pre-lipfix.json`)·실렌더 검증. **P2 완료**: `scripts/qa-mouth-lips.mjs` 립 안료 연속성 게이트(deploy·publish 배선, poon995 표본 FAIL 실측)+`scripts/render-mouth-matrix.mjs` 승격. **P3+bepo 완료(2026-07-13)**: `create-feedback` 창구 프로드 개통(의상실 [문제 알리기]·진단번들 opt-in·90일 purge — 실증 16/16, 스펙 §16.6·GAP 로그 참조). 잔여: 입 상태 자산 재생성(정공, Vtube 몫) 후 poon995 회신. **형제결함 해소(2026-07-13·티켓 FA3739D5=주인님 본인, 문제알리기 창구 첫 라이브)**: mid-open "입안 검정 캐비티"(입술 소실과 별개 결함 — qa-mouth-lips 립축이 어두운 구강을 명시제외해 못 잡던 사각). 유키=메쉬입 구조적 면역·미미=states 정상 → 4909f992 한정 생성결함(mid 암부 58% vs 미미 2%). 조치 ①`scripts/fix-mouth-crossfade.mjs`(입안 암부율 검출→나쁜 state 억제+이웃 크로스페이드, `--id --upload`·백업 `project.pre-mouthfix.json`) — 4909f992 프로드 반영·티켓 status fixed ②`qa-mouth-lips.mjs`에 "입안 암부율" 축 추가(무안료 화풍도 캐비티는 판정; 원본FAIL·픽스PASS·미미PASS 실측)로 로스터 배포 게이트 커버. forge 발행은 레포밖(Vtube)이라 fixer 를 인제스션 폴백 겸용. 메모리 `mouth-state-lip-qa-gap` | 2026-07-13 | OPEN |
| ISS-05 | 보안 지뢰(선제·해소) | **`users.is_admin` 셀프 승격 자물쇠 설치 완료(2026-07-13).** 마이그 `20260713150000_guard_is_admin.sql` — is_admin 만 막는 BEFORE UPDATE 트리거(authenticated/anon 이 값 변경 시 42501; service_role·postgres 통과). 프로드 실증 6/6. **어드민 콘솔 UI 는 defer 유지**(GM 1인 → `scripts/whois-avatar.mjs`+psql CLI 로 운영). 착수 트리거: P1=유저 유입 시 CLI status 전이, P2=모더레이터 2인/신고↑ 시 G-47 `/admin/reports` 구현(is_admin 배선은 이 자물쇠 위에서만). 골 `docs/goals/GOAL-admin-selfpromo-lock.md` | 2026-07-13 | RESOLVED |
| ISS-01 | 스킬 정리 | `doc-health-audit`(ChatterBox 정본)과 `doc-health-check`(Vtube 이식본)가 3기준 진단 목적 중복. 코딩 착수 후 어느 쪽이 더 잘 맞는지 드러나면 나머지를 `docs/archive/`로 이동 | 2026-07-01 | OPEN |
| ISS-03 | 골 사다리 인계 | **8골 사다리(`docs/goals/GOAL-LADDER.md` = 상태 SSOT) 전량 DONE(2026-07-13 완주).** G7 U-연출 마감=네온 On Air(red→green, 주인님 시안 판정 B)+U-3 배속 rate 3단 동기+F-8 대극장 무대 원화 채택(로컬 15/15 ×2·배포판 13/13·bepo 라이브). G8 하네스 템플릿화=4종(backlog-drift-probe·deploy-verify-close·goal-backlog-ladder·supabase-slice-verify) → `jason-agent-harness-template` 이관·REGISTRY 등재·check-harness PASS. **잔여(골 밖 판정 2건):** ①로비 구름 속도 상향(2.7배) 육안 ②SFX 4종 청취. 다음 방향 후보: eastern 광장 아트·P2 방=방장·도그푸딩 2차. | 2026-07-13 | RESOLVED |
| ISS-06 | 골 사다리 R 인계 | **사다리 R(룸 갭, `goals/GOAL-room-gaps.md`) 6/7 완주(2026-07-17, `/루프` 첫 실주행)** — R1 호스트 이양(transfer-host)·R2 방설정 편집(update-room-settings)·R3 게스트 채팅 CTA·R4 시간제 음소거(muted_until 파생 3점+자가해제)·R5 탭닫기 승계(livekit-webhook 재실대조+roomLeave 공유추출+비호스트 keepalive)·R7 UX 6종(미읽음 뱃지 등). 전 phase check:all 그린(159/159)·deno clean·§0 [x]+probe·자기리뷰 PASS. **R6 대본 HOLD**(주인님 결정: 컬럼-only 안이 G-286/CNT-02·09 스펙과 어긋남 — 별도 세션 플랜모드 정본 설계). **다음 = /배포**: Edge 신규3(transfer-host·update-room-settings·livekit-webhook)+수정4(leave-room·set-participant-mute·list-room-members·livekit-token)+config verify_jwt+CF Pages+**LiveKit 대시보드에 webhook URL 등록**+라이브 2탭 실증(이양·설정 broadcast·시간제 만료·탭킬 승계). read first: ①`goals/GOAL-room-gaps.md` §7 ②DOGFOOD §0 A-P1e. 첫 검증: `npm run check:all`(159/159 기대). blocker: none. **→ /배포 완료(2026-07-17, GAP-MATRIX "룸 갭 사다리 bepo" 행 — 프로드 통합 23/23·lk 탭킬 재현 2회)** — R6 정본 설계만 잔여. | 2026-07-17 | RESOLVED |
| ISS-07 | 골 사다리 G9 인계 | **G9 더빙 녹음 체감(`goals/GOAL-dub-recording-tangible.md`) P1~P4 완주+bepo 완료(2026-07-18)** — 레벨미터+무음경고·녹음 로컬모드+즉시 미리보기(Web Audio·ffmpeg 불필요)·누적 시사회 전원(get-dub-recordings v13 멤버 완화·SEC-RA-1 dub_screening)·내차례 배너+±200ms 캘리브레이션(submit-dub-track v10·합성 동일 적용). CF `index-DpVmQqc7.js` 별칭·배포판 스모크 8/8. **주인님 실사용 확인(2026-07-18)**: 녹음 동작 OK. **다음 세션 1순위 = DUB-RETAKE**(DOGFOOD §0 신규 등재): synced 후 되돌리기 UI 부재(G-283 defer "전체 재촬영") + `submit-dub-track` 트랙 status 무게이트(API 로 synced 덮어쓰기 가능 — 정합 갭) → 서버 게이트 + 확정 해제/재녹음 요청 흐름. 소소: 레벨미터 무음경고 1회 관측(이후 정상) — ctx.resume() 가드·문턱 완화 후보. 그 외 잔여: 늦은 입장자 시사회 하트비트 · 비호스트 seek 시 시사회 오디오 재스케줄 · 멀티트랙 영상 편집기(별도 대설계 골) · DUB-FRICTION 잔여(다인 진행 타임라인·합성 ETA·소스언어 사후변경·휠 편집 발견성). read first: ①DOGFOOD §0 DUB-RETAKE ②브리프 §7. 첫 검증: `npm run check:all`. blocker: none. **→ DUB-RETAKE + RM-REJOIN 완료·bepo(2026-07-19, 커밋 cdf2c38)**: submit-dub-track v11 synced 재제출 409·confirm-dub-track v10 undo(호스트 확정 해제)·[확정 해제] 버튼·레벨미터 resume 하드닝 — 프로드 라이브 9/9. +RM-REJOIN 토큰 403 자가치유(하네스 2/2). 잔여는 ISS-08로 이관. | 2026-07-19 | RESOLVED |
| ISS-08 | 설계 세션 2건 대기 | **다음 작업 = 설계 세션(플랜모드 정본 설계·주인님 승인 게이트) 2건 — 조사 블로커 전부 해소됨(2026-07-19).** ①**DUB-TRIM**(캡컷식 트림+세그먼트 협업 편집+presence — ISS-07 "멀티트랙 편집기" 대설계 1슬라이스): UX 레퍼런스 4축 권고 완비([research/DUB-TRIM-UX-REFERENCES.md](../research/DUB-TRIM-UX-REFERENCES.md) + `design/product-ui-references/` 6종 UX-NOTES). **설계 첫 질문 = 트림/시간수정 시 기녹음 테이크 무효화 정책**(유료·노동 산물 보존 원칙 충돌). ②**RM-SCRIPT**(방별 대본 시스템 — G-286 scripts 테이블+CNT-02 업로드+CNT-09 시드팩): 시드 소스 = 지정 유튜브 클립 다운로드 사용 결정(2026-07-19 주인님 — 공용도메인 희곡 경로·저작권 조사 문서 폐기, 요지는 GAP-MATRIX 로그 보존). read first: ①DOGFOOD §0 해당 행 2개(RM-SCRIPT·DUB-TRIM) ②research/DUB-TRIM-UX-REFERENCES.md. 첫 검증: `npm run check:all`(159/159 기대). blocker: none(설계 승인만). **→ DUB-TRIM 계열 완주(2026-07-19)**: 트림 v1→DUB-EDIT(센터 편집기 E0~E5)→DUB-SHOWCASE(각인 UX S0~S5)→DubPanel 3분할 리팩터까지 한 세션에 소화. RM-SCRIPT 는 시드=유튜브 클립 결정으로 재정의 — 잔여. | 2026-07-19 | RESOLVED |
| ISS-09 | 더빙 UX 감사+피드백 6건 | **/감사 완료(2026-07-19, 3기 Opus 페르소나+메인 서버 대조)** — 신규 5행 등재: **DUB-CONSENT-VIEWER(High·Confirmed — 관전자 있으면 all_consented 영구 미충족 = 녹음 시작 불가, record-consent:54 role 무관 전원 계수. 다음 세션 1순위)**·DUB-CHAIN-DONE·DUB-BED-LOCAL-HINT·DUB-CHANGE-NOTICE·DUB-A11Y-M + 기각 3(트랙 미러 미인지 오판 등 — §0 기각 기록). **다음 세션 = 피드백 배치+감사 신규(§0 "주인님 실사용 피드백 배치") 처리** — §0 "주인님 실사용 피드백 배치 2026-07-19" 5행: DUB-HAIR-MATTE(크로스레포 Vtube 매팅 — 병행세션 확인 선행)·DUB-AVATAR-DRAG(오버레이 드래그 배치)·DUB-SCRIPT-TELEPORT(좌패널→타임라인 시크, 소형)·DUB-PANEL-UNIFY(조작 동선 좌패널 통합 — 정본 설계감)·DUB-STEP-BACK(단계 복귀+녹음 중 텍스트 수정 완화). +DUB-NEW(새 영상 버튼, 소형) 동군. **주의: 오늘 작업 전체가 커밋·CF 배포 대기**(RM-REJOIN/RETAKE 이후분 — 트림·타임아웃픽스·편집기·줌·쇼케이스·3분할·VISIBILITY. Edge 는 edit-dub-segment v1·separate-dub-audio v12 만 라이브) → 세션 시작 시 `/배포` 또는 `/마감` 먼저 판단. read first: ①§0 피드백 배치 5행 ②goals/GOAL-dub-showcase.md §7. 첫 검증: `npm run check:all`(165/165 기대). blocker: none. **→ 사다리 F(GOAL-dub-polish) F1~F8 완주(2026-07-19 "전부 ㄱ")**: CONSENT-VIEWER(record-consent v10)·SCRIPT-TELEPORT·신호 3종·DUB-NEW·STEP-BACK(revert-dub-session v1·update-dub-segment-text v6)·AVATAR-DRAG(로컬 v1)·A11Y-M·PANEL-UNIFY v1(recordRequest 브리지) — 프로드 통합 3/3+6/6·실렌더 10/10·check:all 그린·§0 [x]+probe·drift 0. 잔여: HAIR-MATTE(Vtube HOLD)·PANEL-UNIFY-V2(정본 설계)·**커밋+CF Pages 배포 대기(오늘 프론트 전량)**. | 2026-07-19 | HANDOFF |
| ISS-02 | 이모트 기능화·인계 | Phase 1–6 완료·push(하단바 배선·모닥불 기본배경·로드아웃 피커·우도크 이모트 콘솔·**옐로 Lottie 8종+EmoteGlyph** `83c965a`, 게이트 130/130·인룸 E2E 7/7). "`npx skills` 블로커"는 **rtk npx 재작성 오판** — 절대경로 `/opt/homebrew/bin/npx` 로 우회(text-to-lottie 스킬 설치 `f7014a1`, 파이프라인은 `emote-lottie` 스킬로 고정). **배포 완료(2026-07-12)**: 프론트 CF=G3-E bepo 동편 라이브, create-room Edge=V-7a 전 함수 재배포로 커버 — Phase 7 소진. 남음: SSOT 백로그 기록 여부만. 인계=[HANDOFF-EMOTE-LOTTIE-2026-07.md](./HANDOFF-EMOTE-LOTTIE-2026-07.md) | 2026-07-10 | HANDOFF |

> 에이전트가 이슈 발견 시 이 표에 행을 추가하고 `open_issues` frontmatter를 갱신한다.

---

## § 필수 파일 경로 레퍼런스

```
ChatterBox 루트: /Users/family/jason/ChatterBox/
├── docs/
│   ├── status/AGENT-OPS.md          ← 이 파일
│   └── snack-web/docs/
│       ├── PROJECT-STATUS.md         ← 현재 구현 상태
│       ├── GAP-MATRIX.md             ← 기능 GAP 현황
│       ├── IMPLEMENTATION-ORDER.md   ← 구현 순서·의존성
│       ├── specs/SecurityPolicies.md ← 보안 정책 SSOT
│       ├── SUPPORT-PLAYBOOK.md       ← CS 대응 스크립트
│       ├── INCIDENT-PLAYBOOK.md      ← 인시던트 대응
│       └── SECURITY-OPS.md           ← 보안 운영 절차
├── .claude/
│   ├── skills/cs-triage/SKILL.md    ← CS 분류 스킬
│   └── skills/doc-health-check/     ← 문서 건강성 스킬
└── package.json                      ← docs:check / docs:health
```
