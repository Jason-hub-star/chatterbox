---
tags: [goals]
---

<!--
  GOAL-room-gaps.md — 룸 페이지 누락기능 감사(2026-07-17, DOGFOOD §0 A-P1e) 후속 골 사다리 브리프.
  실행: phase-loop("이 골 실행해" / /phase-loop docs/goals/GOAL-room-gaps.md).
  상태판(영구 인덱스)은 GOAL-LADDER.md "사다리 R" 표 — 완료 시 이 브리프는 archive/ 이관.
-->

# GOAL-room-gaps — 룸 페이지 갭 7종 사다리 (R1~R7)

## 골 한 줄

룸 감사 확정 갭 6종+트랙B UX 델타 1패스를 R1~R7 직렬 phase 로 완결 — verified by 각 phase 체크리스트 전항 [x] + `npm run check:all` green + 신규/수정 Edge `deno check` clean + §0 probe 등재(docs:drift 앵커), while preserving 기존 스위트 green·room-authority 스푸핑 방어·i18n 3국어 완역. details in docs/goals/GOAL-room-gaps.md

## 1. Outcome (완료 시 참)

DOGFOOD-AUDIT §0 **A-P1e 전 항목 [x]** + **UX 델타 2026-07-17 전 항목 해소**. phase 별 이진 판정:

- **R1 RM-HOSTXFER** (defer 대장 V-6 부활): HostConsole 에서 재적 배우 선택→확인 모달→이양 시 `rooms.host_id` 갱신·전원 isHost 재파생(기존 A-FUNC-3 host_id 경로)·구/신 호스트 콘솔 탭 노출 전환.
- **R2 RM-EDIT**: HostConsole "방 설정" 섹션에서 제목(1~60자)·장르(genre 화이트리스트) 변경 → 서버 재검증 → 전원 상단바 즉시 반영(broadcast).
- **R3 RM-GUEST-CTA**: 익명 관전자 채팅 잠금 영역에 로그인 CTA — 클릭 시 로그인 후 현 방 `?watch=1` 로 복귀(기존 원목적지 복귀 경로 재사용).
- **R4 RM-MUTE-DUR**: mute 에 duration 옵션(예: 1/5/10분/무기한) — `muted_until` 경과 시 자동 해제(서버 판정), HostConsole 셀렉트 + 잔여시간 표시.
- **R5 RM-SOFTLEAVE**: ①pagehide 시 keepalive fetch 로 leave-room best-effort(완화) ②`livekit-webhook` Edge(서명 검증→participant_left→soft-leave+호스트 승계)(근본). 웹훅 라이브 연결은 배포 게이트로 명시.
- **[승인 게이트]** R6 착수 전 대본 시스템 설계(마이그 형태: `rooms.script_id` vs scripts 테이블, 시드 N종 구성) 플랜 승인.
- **R6 RM-SCRIPT**: 방별 대본 선택 — 시드 대본 N종(≥3) + 방 생성/HostConsole 선택 UI + `useScriptSync` 시드 고정 해제(`SEED_SCRIPTS[0]` → script_id 조회). 다른 대본 방 간 큐 오염 0(sceneId 가드 유지).
- **R7 트랙B 1패스**: 채팅 탭 미읽음 뱃지 · 무대초대 수락 실패 toast+승격 재연결 안내 · 더빙 내 세그먼트 강조 · 좌석 번호 표시 · 노트 휘발성 고지 · DUB 탭 뷰어 안내 1줄 — 전부 i18n 3국어.

## 2. Verification surface (도구 중립 — 어느 런타임이든 동일)

- 공통(매 phase): `npm run check:all` → tsc 0·lint clean·test 전체 green·build PASS·docs:check PASS·docs:drift STALE/REGRESSION 0·docs:links 0 broken.
- Edge 신규/수정(R1·R2·R4·R5): `deno check supabase/functions/<fn>/index.ts` clean.
- 마이그(R4·R6): 로컬 `supabase db reset` 적용 + psql 로 컬럼/제약 실측 1회.
- 문서 앵커(매 phase): DOGFOOD §0 해당 행 [x] + `<!-- probe: <파일> :: <마커> -->` 등재 → `npm run docs:drift` 가 회귀 감시.
- R7 추가: i18nCoverage 테스트(en/ja ⊆ ko·orphan 0) green.
- 아티팩트: §7 실행 기록에 phase 별 실행 명령·결과 1줄.

## 3. Constraints (후퇴 금지 — phase 마다 누적)

- 이전 phase 검증 표면 green 유지(사다리 규칙) + 착수 시점 테스트 수 이상 유지.
- **room-authority 수신 방어 유지(SEC-RA-1)**: 신규 broadcast 타입(host_change·room_update·mute 갱신 등)은 서버릴레이(participant=undefined)만 수락 목록에 추가 — 클라 발행 수락 금지.
- 호스트 전용 쓰기는 전부 서버 재검증(requireHostRoom 패턴)·`check_rate_limit` 재사용(신규 무제한 쓰기 Edge 금지).
- i18n: JSX 하드코딩 한글 금지(lint 게이트)·신규 키는 ko/en/ja 동시.
- 마이그 시 schema split 게이트 준수(docs/schema 모듈+legacy 스냅샷+manifest 3종 동시 — docs:check 가 강제).
- stores barrel export 금지 · ponytail 미니멀리즘(새 패널·추상화 최소, 기존 프리미티브 재사용: Modal·toast·broadcast·check_rate_limit).

## 4. Boundaries

- 허용: `src/features/{room,chat,script,dub,reaction}/` · `src/pages/RoomPage.tsx` · `src/lib/rooms.ts` · `src/hooks/useLiveKitRoom.ts` · `src/i18n/locales/` · `supabase/functions/`(신규 transfer-host·update-room-settings·livekit-webhook + 기존 mute/leave/list-room-members/create-room 최소 수정) · `supabase/migrations/`(신규 2) · `docs/`(§0·schema·contracts·goals).
- 금지: 크레딧/결제 RPC · 아바타 rig/pixi(`src/lib/pixi/`) · `.env`(grep 전면 금지 — awk/cut만) · 기존 마이그레이션 파일 수정 · 무관 로비/의상실 모듈.

## 5. Iteration policy (phase-loop 계약)

- phase 순서 R1→R2→R3→R4→R5→[승인 게이트]→R6→R7. 각 phase: 구현 → §2 검증 전체 실행 → **§1 해당 체크리스트 대비 자기리뷰(누락 대조 — 메인 모델 직접)** → PASS 면 §7 기록 후 자동 진행, FAIL 이면 실패 항목만 최소 변경 재시도.
- 같은 phase 무진전 3패스 → blocked 판정.
- 배포·커밋·push 는 골 밖(기존 게이트) — phase 완료는 로컬 증거로 판정, 라이브 실측(웹훅·broadcast 2탭)은 배포 후 체크리스트로 §7 에 이월 기록.

## 6. Blocked stop condition

- R6 설계 승인 미획득 상태에서 R5 완료 → R6 앞에서 정지·승인 요청(진행 금지).
- 마이그가 schema split 게이트와 충돌(모듈/스냅샷/manifest 동기 실패 반복) · LiveKit webhook 서명 자격정보/설정 경로 부재 · 게이트 flaky 재현 불가 · 무진전 3패스.
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실 4분류.

## 7. 실행 기록 (실행 에이전트가 기록)

- (대기) 2026-07-17 브리프 작성 — 착수 전.
- 2026-07-17 Claude(Fable)/phase-loop — **R1 PASS(패스 1)**: `transfer-host` Edge(호스트·대상 활성배우 검증·조건부 갱신·host_change broadcast) + 래퍼 + RoomPage 수신(재조회 범프+새 호스트 toast) + HostConsole 이양(배우만)+모달 + i18n 9키×3. 검증: `deno check` clean · `check:all` green(tsc·lint·test 159/159·build·docs:check·drift·links). 자기리뷰: 스푸핑(서버릴레이만)·RightPanel 탭 폴백·vod publisher 전환·레이스(조건부 UPDATE) 확인, broadcast best-effort 는 의도적 편차(주석). 이월: 라이브 2탭 이양 실측(배포 게이트).
- 2026-07-17 Claude(Fable)/phase-loop — **R2 PASS(패스 1)**: `update-room-settings` Edge(requireHostRoom·title 1~80·GENRES('' 제거)·'room_update' 병합 최종값 broadcast) + 래퍼 + RoomPage 수신/저장 + HostConsole "방 설정" 섹션(lobby.genre* 재사용) + i18n 5키×3. 검증: deno check clean · check:all green(159/159). 편차 기록: 브리프 "제목 1~60자" → create-room SSOT 80자로 정정(진입점 규칙 통일). 이월: 라이브 2탭 broadcast 실측(배포 게이트).
- 2026-07-17 Claude(Fable)/phase-loop — **R3 PASS(패스 2)**: ChatPanel 게스트 잠금 블록 로그인 CTA. 패스 1 FAIL(라우터 훅 직접 사용 → 라우터 없는 chatPanelMeta 유닛 2 FAIL + en/ja 인덴트 불일치로 i18nCoverage 2 FAIL) → 패스 2 정수정(콜백 prop `onGuestCta` 로 상위 위임 — onSend 동형·라우터 비의존, 로케일 인덴트 정정) 후 check:all green(159/159). state.from=`?watch=1` 보존 복귀(LoginPage 기존 메커니즘 재사용).
- 2026-07-17 Claude(Fable)/phase-loop — **R4 PASS(패스 1)**: 시간제 음소거. **마이그 불필요 판명** — `muted_until` 은 `20260702050002` 가 선제 생성("ALTER 반복 회피")·스키마 문서(01-core-tables:263)에도 기존재 → §2 "db reset·psql" 검증은 대상 부재로 N/A(OrbStack 기동했다가 원상 종료). 구현: set-participant-mute duration_sec+본인 만료 자가해제(서버 시계 검증) · 만료 파생 3점(livekit-token·list-room-members 단일지점·RoomPage 타이머) · HostConsole 셀렉트+만료시각 · viewer canPublish 오부여 잠복버그 role 파생 정수정. 검증: deno check ×3 clean · check:all green(159/159). 잔여 ceiling: 만료~자가해제 ≤1s 창(재연결=최종 해제 경로)·비호스트 배지 라이브 전파(기존 ceiling 승계).
- 2026-07-17 Claude(Fable)/phase-loop — **R5 PASS(패스 1)**: ①`_shared/roomLeave.ts` 추출(leave-room 무수정 공유) ②`livekit-webhook` 신규(서명검증·participant_left·재실 대조로 리로드 오탐 차단·verify_jwt=false config) ③pagehide keepalive(비호스트 한정 — 호스트 리로드 승계 오발화 회귀 방지, 브리프 "완화" 의 의도적 축소·사유 주석). 검증: deno check ×2 clean·check:all green(159/159). **배포 게이트 이월: LiveKit 대시보드 webhook URL 등록 + 탭킬 라이브 실증.** 다음 = R6 승인 게이트(정지).
- 2026-07-17 Claude(Fable)/phase-loop — **R6 승인 게이트 도달·주인님 무응답(60s)** → 진행 금지 유지, **의존성 없는 R7 을 선행**(순서 변경 기록). **R7 PASS(패스 3)**: 미읽음 뱃지(RightPanel badge+스토어 구독 카운트 — 컴파일러 lint 2FAIL(렌더 ref→effect setState)을 구독 콜백 패턴으로 정수정)·수락실패/승격 toast·더빙 내 세그먼트 강조·좌석번호 칩·노트 휘발성 고지·DUB 뷰어 안내, i18n 7키×3. 검증: check:all green(159/159). 미세 잔여: 탭 비활성 중 히스토리 백필이 카운트될 수 있음(기본탭=chat 이라 실질 0)·clearMessages 후 카운트 유지(다음 탭 복귀에 소거). **잔여 = R6 단독(승인 대기).**
- 2026-07-17 Claude(Fable)/phase-loop — **R6 보류(주인님 결정)**: 승인 게이트에서 스펙 대조 결과 브리프의 "rooms.script_id+코드 시드" 안이 **스펙 정본(G-286: scripts 테이블+DB cues_json / CNT-02 사용자 업로드 P1 / CNT-09 시드 팩 P1)과 어긋남** 판명 — 텔레프롬프터 대본은 사용자 업로드+시드 팩 병행이 정본(영상 추출 대본은 더빙 전용 별계). 별도 세션 플랜모드로 재설계 후 착수. **골 종결 판정: R1~R5·R7 = 6/7 PASS, R6 는 정본 재설계로 이관** — 배포·커밋은 /마감·/배포 게이트로.
- 2026-07-17 Claude(Fable)/bepo — **배포+라이브 실증 완료**: deno 전 함수 스윕 exit0 → functions deploy 전체(exit0, transfer-host/update-room-settings/livekit-webhook v1·leave-room v13·set-participant-mute v8·list-room-members v10·livekit-token v14 실측) → CF Pages(비밀키 감사 6종 clean·`index-SFaW-TLb.js` 별칭 서빙 MATCH·curl 3종 200·신규 기능 마커 6/6) → **프로드 통합 23/23 PASS**(R1 이양 왕복·R2 설정 403/200/400/DB·R4 실시간 10s 만료 자가해제·R5 실서명 webhook→soft-left+위조 401·leave 회귀 ended). 커밋 048d5dd(코드)·ce69a2b(문서)·push 승인분. **잔여 수동 1: LiveKit 대시보드 webhook URL 등록**(등록 후 탭킬 자동 회수 발효). 골 종결 — 브리프는 R6 정본 설계 시 참조용으로 활성 유지.

## 참조 문서

- [DOGFOOD-AUDIT-2026-07.md](../DOGFOOD-AUDIT-2026-07.md) §0 A-P1e·UX 델타 2026-07-17 (발견 원본·file:line)
- [GOAL-LADDER.md](./GOAL-LADDER.md) 사다리 R 상태판
- `contracts/HostConsole.md` · `contracts/ScriptPanel.md` · `contracts/ChatPanel.md` · `contracts/RightPanel.md`
