---
tags: [agent-entry, ops]
state: ACTIVE
last_daily: null
last_weekly_security: null
last_cs_sweep: null
open_issues: 1
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
| ISS-01 | 스킬 정리 | `doc-health-audit`(ChatterBox 정본)과 `doc-health-check`(Vtube 이식본)가 3기준 진단 목적 중복. 코딩 착수 후 어느 쪽이 더 잘 맞는지 드러나면 나머지를 `docs/archive/`로 이동 | 2026-07-01 | OPEN |
| ISS-03 | 골 사다리 인계 | **8골 사다리(`docs/goals/GOAL-LADDER.md` = 상태 SSOT) — G1·G2·G3 DONE(G3=프로드 라이브 녹화 실측 10/10, 배포 대기열 소진).** 다음: ①RoomPage 리팩토링 R-커밋(주인님 콜 — 조인게이트/대본동기/호스트액션 3분할 순수 이동, check:all+스모크 재검증) ②G4 자막편집(더빙) — entrypoint=GOAL-LADDER G4 행 근거 매트릭스(`DATA-SCHEMA §1.12`·`DubCompositor.md §3`·세그먼트 편집=`DubPanel.tsx` 호스트 게이트 재사용·신규 Edge `update-dub-segment-text` 1개). read first: ①GOAL-LADDER ②GAP-MATRIX 진행 로그 2026-07-12 5행. blocker: none. first verify: `npm run check:all` | 2026-07-12 | HANDOFF |
| ISS-02 | 이모트 기능화·인계 | Phase 1–6 완료·push(하단바 배선·모닥불 기본배경·로드아웃 피커·우도크 이모트 콘솔·**옐로 Lottie 8종+EmoteGlyph** `83c965a`, 게이트 130/130·인룸 E2E 7/7). "`npx skills` 블로커"는 **rtk npx 재작성 오판** — 절대경로 `/opt/homebrew/bin/npx` 로 우회(text-to-lottie 스킬 설치 `f7014a1`, 파이프라인은 `emote-lottie` 스킬로 고정). **배포 완료(2026-07-12)**: 프론트 CF=G3-E ship-live 동편 라이브, create-room Edge=V-7a 전 함수 재배포로 커버 — Phase 7 소진. 남음: SSOT 백로그 기록 여부만. 인계=[HANDOFF-EMOTE-LOTTIE-2026-07.md](./HANDOFF-EMOTE-LOTTIE-2026-07.md) | 2026-07-10 | HANDOFF |

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
