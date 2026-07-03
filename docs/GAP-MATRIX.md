---
tags: [hub]
---

<!--
  GAP-MATRIX — 구현 전 누락 스펙 감시판
  갱신 규칙: 항목이 채워지면 상태를 DONE으로, 블로커면 BLOCKED로 바꾼다.
  Haiku가 공식문서 조사 → Opus가 스펙 작성 → 이 파일로 진행 추적.
  Updated: 2026-07-02
-->
<!-- opencode: 2026-06-29 - G-31·G-53 OBS는 P2 방송 송출 옵션으로 deferred, G-32 MOB 계약은 유지. Coded with OpenCode; high-cost model review recommended. -->

# GAP-MATRIX — 누락 스펙 감시판

> **사용법**: 코딩 시작 전 모든 P0 행이 `DONE`이어야 한다.  
> `RESEARCH` = Haiku 조사 완료 대기 중 · `DRAFT` = Opus 초안 작성 중 · `DONE` = 스펙 확정

---

## LATER 전체 목록 (빠른 참조)

> "지금 안 채워도 됨" 40건 요약. ID로 Ctrl+F해서 아래 레이어/N차 분석 섹션에서 원문(우선순위·근거)을 찾을 것. 신규 LATER 등록/DONE 전환 시 이 표도 같이 갱신.

| ID | 항목 | 섹션 |
|---|---|---|
| G-17 | i18n 리소스 파일 구조 | 레이어5 |
| G-27 | ROOM-14 역할 배정 UI + 리허설/본공연 모드 | 레이어5 |
| G-29 | ROOM-18 메인뷰 배속 조절 | 레이어5 |
| G-31 | OBS-01~03 방송 출력 모드 (계약 초안 있음, P0 스캐폴딩 금지) | 레이어5 |
| G-53 | OBS 토큰 검증 RLS 완성 | 레이어5 |
| G-68 | 방 생성 단계별 위저드 | 레이어5 |
| G-69 | 자동 매칭·"진행 중" 표시 | 레이어5 |
| G-70 | 발성 워밍업·표정 연습 가이드 | 레이어5 |
| G-71 | 대기 시간 활동 | 레이어5 |
| G-72 | 1:1 귓속말 | 레이어5 |
| G-73 | FPS·트래킹 레이턴시·핑 디버그 오버레이 | 레이어5 |
| G-74 | 녹화물 편집 | 레이어5 |
| G-75 | SNS 공유 OG이미지·썸네일 생성 (우선순위 상향 권고, G-251) | 레이어5 |
| G-76 | 커튼콜·공연 종료 연출 | 레이어5 |
| G-78 | 크리에이터 구독+공연시작알림 (팔로우 자체는 G-195로 DONE) | 레이어5 |
| G-90 | 모델 마켓/스토어 | 레이어5 |
| G-105 | BGM 라이브러리 | 레이어5 |
| G-106 | 대본 포맷 import | 레이어5 |
| G-107 | PWA 설치 지원 | 레이어5 |
| G-117 | 다크/라이트 테마 전환 | 5차분석 |
| G-136 | API/SDK 버저닝 정책 | 8차분석 |
| G-138 | 외부 서비스 가입 절차 (`CONTRIBUTING.md` 미작성) | 8차분석 |
| G-148 | 시드 데이터 갱신 주기 (G-132 연계) | 9차분석 |
| G-162 | 콘텐츠 라이브러리 검색·태그·재생목록 | 10차분석 |
| G-163 | 관객 투표/폴 | 10차분석 |
| G-184 | 혼자 시작 방지 연습 방/AI 파트너 (G-132 연계) | 14차분석 |
| G-185 | 리허설 피드백 루프 | 14차분석 |
| G-186 | 트래킹 품질 게이지 + 표정 리플레이 | 14차분석 |
| G-187 | 호스트 이탈/재접속 승계 UX | 14차분석 |
| G-188 | 시드 대본 팩 5~10개 (G-132 연계) | 14차분석 |
| G-189 | 방송용 클린 모드 + OBS 이전 가이드 | 14차분석 |
| G-203 | 연령층별 크레딧 한도/요금 | 16차분석 |
| G-227 | HelpPanel 12섹션 콘텐츠 | 18차분석 |
| G-255 | 이벤트/컨테스트 운영 계획 | 19차분석 |
| G-256 | 초대 캠페인 추적(campaign_id) | 19차분석 |
| G-257 | 인플루언서 협업 고지/계약 가이드 | 19차분석 |
| G-258 | 일본 APPI 담당자·기한 | 19차분석 |
| G-259 | 카피-스펙 추적 필드(specId) | 19차분석 |

---

## 레이어 1 — 블로커 (코딩 즉시 막힘)

| ID | 누락 항목 | 영향 기능 | 산출 문서 | 상태 |
|---|---|---|---|---|
| G-01 | **LiveKit 토큰 발급 Edge Function** | ROOM-04 (WebRTC) | [[livekit-edge-fn]] | `DONE` |
| G-02 | **models 테이블 스키마** | MOD-01 (모델목록) | [[supabase-auth]] §6 | `DONE` |
| G-03 | **rig JSON 포맷 스펙** | ROOM-03 (아바타렌더) | [[rig-format]] — 2026-07-02 정본 교체: AUTORIG mesh-deform `project.json`(실 렌더러·에셋 대조). 미구현 variant-swap v1은 §9 이력 강등 | `DONE` |
| G-33 | **Security P0 Review** | LiveKit/RLS/R2/FAL/DataChannel/StageMode | [[SECURITY-P0-REVIEW]] + 관련 SSOT 문서 | `DONE` |
| G-34 | **Runtime Hardening Review H1-H16** | HOST/ROOM/VGEN/DUB/OBS/Auth 런타임 복구 | [[RUNTIME-HARDENING-REVIEW]] + 관련 SSOT 문서 | `DONE` |
| G-35 | **방 생성·입장·초대링크 rate limit + brute-force 방어** | AUTH/ROOM 입장 보안 | `specs/SecurityPolicies.md §13` (verify-invite-code/create-room/livekit-token 제한) | `DONE` |
| G-36 | **채팅 입력 sanitize 정책** (markdown·링크·XSS) | ChatPanel/ChatOverlay 구현 전 | `specs/SecurityPolicies.md §6.4` (3단계: 입력·서버·출력 sanitize) | `DONE` |
| G-37 | **강퇴/비활성화 후 기발급 LiveKit 토큰 무력화 절차** | ROOM-04 (is_disabled_by_host → token revoke) | `specs/SecurityPolicies.md §8` + `livekit-edge-fn.md §6` + `DATA-SCHEMA.md §1.3` | `DONE` |
| G-85 | **이용약관(ToS)·개인정보처리방침** | 법적 필수 (한국 개인정보보호법·GDPR) | [[TERMS-OF-SERVICE]] + [[PRIVACY-POLICY]] | `DONE` |
| G-86 | **저작권 신고 프로세스 (DMCA/Safe Harbor)** | 법적 필수 | [[COPYRIGHT-DMCA]] (신고 접수·처리·이의제기 플로우) | `DONE` |
| G-87 | **UGC 소유권 귀속 정책** | VGEN-06·ROOM-13·DUB-05 (생성물·녹화·더빙) | [[UGC-OWNERSHIP]] (권리 귀속·재사용·라이선스) | `DONE` |
| G-88 | **서비스 종료 시 데이터 반출 경로** | 개인정보보호법 §15 | [[DATA-EXPORT]] (요청 절차·포맷·기한) | `DONE` |
| G-44 | **토큰 무효화 캐시 아키텍처 (jti/nonce/epoch 선택)** | ROOM-04 (replay 방어, C1·C7) | `specs/SecurityPolicies.md §8.4·§8.7` — jti 추적 전용, 블랙리스트 없음, `token_version`은 YAGNI | `DONE` |
| G-80 | **dev/staging/prod 환경 분리** (Supabase·LiveKit·Stripe 프로젝트별 분리) | 배포·DB 안전성 | `PLATFORM-ARCHITECTURE.md §Env` + `.env.{dev\|staging\|prod}` | `DONE` |

---

## 레이어 2 — 컴포넌트 계약 누락

| ID | 누락 항목 | 영향 기능 | 산출 문서 | 상태 |
|---|---|---|---|---|
| G-04 | **Auth 페이지 컴포넌트** (Login/Register) | AUTH-01~03 | [[AuthPage]] | `DONE` |
| G-05 | **Lobby 페이지 컴포넌트** (방 목록/생성) | LOB-01, 03~05 | [[LobbyPage]] | `DONE` |
| G-06 | **Settings 페이지 컴포넌트** | SET-01~08 | [[SettingsPage]] | `DONE` |
| G-07 | **Green Room 컴포넌트** (입장 전 준비) | MOD-05 | [[GreenRoom]] | `DONE` |
| G-08 | **무대 레이아웃 엔진** (2/4/6인 자동배치) | ROOM-02 | [[StageLayout]] | `DONE` |

---

## 레이어 3 — 상태머신 누락

| ID | 누락 항목 | 영향 기능 | 산출 문서 | 상태 |
|---|---|---|---|---|
| G-09 | **VGEN 상태머신** | VGEN-01~12 | [[Vgen]] | `DONE` |
| G-10 | **Onboarding 상태머신** | 온보딩 플로우 전체 | [[Onboarding]] | `DONE` |

---

## 레이어 4 — 설계 미결정

| ID | 누락 항목 | 영향 | 결정 방법 | 상태 |
|---|---|---|---|---|
| G-11 | **온보딩 플로우 선택** | 첫 UX 전체 | [[ONBOARDING-FLOW]] | `DONE` |
| G-12 | **아바타 에셋 포맷** (Live2D vs PNG rig) | ROOM-03 전체 | rig-format.md §7 — Vtube AUTORIG `project.json` 직접 렌더 확정(2026-07-02: 다운컨버전 없음, mesh-deform) | `DONE` |
| G-13 | **Supabase Auth UI** 라이브러리 선택 | AUTH-01~03 | → 직접 구현 확정 (auth-ui-react 아카이브됨) | `DONE` |

---

## 레이어 5 — P1 이후 (지금 안 채워도 됨)

| ID | 누락 항목 | 상태 |
|---|---|---|
| G-14 | VGEN 컴포넌트 계약 | `DONE` — `contracts/VgenPanel.md` (VgenPromptPanel + VgenStatusTab) |
| G-15 | DubSession 상태머신 (이미 예정됨) | `DONE` — `state-machines/DubSession.md` (8상태: IDLE→UPLOADING→UPLOADED→TRANSCRIBING→READY→RECORDING→COMPOSITING→COMPLETED, C6 롤백 정책 포함) |
| G-16 | Moderation 스펙 (VGEN-06) | `DONE` — `specs/SecurityPolicies.md §5` (프롬프트 사전 + 프레임 사후 검사) |
| G-17 | i18n 리소스 파일 구조 | `LATER` |
| G-18 | DUB 4개 계약서 (SessionSelector·RoleAssigner·Recorder·Compositor) | `DONE` — `contracts/DubSessionSelector.md`·`DubRoleAssigner.md`·`DubRecorder.md`·`DubCompositor.md` (DUB-01/03/04/05) |
| G-19 | LOB-06 예약 공연 컴포넌트 계약 | `DONE` — `contracts/LobbyPage.md` ReservationSection + `DATA-SCHEMA.md §1.24 room_reservations/notifications` |
| G-20 | LOB-07 게스트/데모룸 컴포넌트 계약 | `DONE` — `contracts/LobbyPage.md` DemoRoomSection + `contracts/MobileViewer.md` viewer-only 권한 |
| G-25 | **ROOM-12 가벼운 리액션/이모트** — 박수 등 객석 반응 DataChannel 스펙 | `DONE` — `DATA-SCHEMA.md §2.3/§2.5` reaction whitelist/TTL/rate limit |
| G-26 | **ROOM-13 인앱 녹화·다시보기·클립** — ●녹화 중 타이머·하단 바 ⏺버튼·클립 저장 스펙 | `DONE` — `DATA-SCHEMA.md §1.11 recordings` + `§1.22 room_artifacts`, `VgenExport.md` 작품함 연동 |
| G-27 | **ROOM-14 역할 배정 UI + 리허설/본공연 모드** — 캐릭터↔배우 매핑 + 모드 토글 스펙 | `LATER` |
| G-28 | **ROOM-15 무대/객석 분리** — 출연자(트래킹) vs 관전자(뷰어·채팅) 전환 스펙 | `DONE` — `ONBOARDING-FLOW.md` Viewer Gate + `MobileViewer.md` canPublish=false/canPublishData=false + `GreenRoom.md` viewer/voice-only 폴백 |
| G-29 | **ROOM-18 메인뷰 배속 조절** — 비디오 컨트롤 바 0.5x~2x 버튼 스펙 | `LATER` |
| G-30 | **ROOM-19 참가자 이벤트 리액션** — ✓·?·이모지 캐릭터 위 즉발·전체 동기 DataChannel 스펙 | `DONE` — `DATA-SCHEMA.md §2.3` reaction_kind whitelist + no DB persistence |
| G-31 | **OBS-01~03 방송 출력 모드** — 방송 송출용 P2 옵션. 토큰 없는 ?transparent=1·?obs=1 레거시 진입 금지 | `LATER` — 계약 초안은 `contracts/OBSViewer.md`에 있으나 P0/MVP 구현·스캐폴딩 금지. 구현 시 `DATA-SCHEMA.md §1.17 obs_viewer_tokens` + `SecurityPolicies.md §7`만 사용 |
| G-32 | **MOB-02 모바일 뷰어** — 관전·채팅 전용 모바일 레이아웃 스펙 | `DONE` — `contracts/MobileViewer.md` (3탭: 무대·채팅·참가자, viewer 권한, MOB-01 PC 우선 정책) |
| G-38 | **초대링크 flow 확정** (room_id vs room_invites 테이블, 비인증 사용자 처리) | LobbyPage/LobbyInviteFlow | `DONE` — `?invite={invite_code}` (room_invites.invite_code_hash 매칭, Edge Function verify-invite-code) | `DONE` |
| G-43 | **동의 전파 프로토콜** (recordings→dub_sessions) | ROOM-13, DUB-05 | `DONE` — `specs/SecurityPolicies.md §11.3` (독립성 원칙: 자동 전파 없음, UX 힌트만) | `DONE` |
| G-39 | **녹화·더빙 사용자 동의 + 데이터 보존기간 정책** (법적 요건, recordings/dub_sessions 삭제 주기) | ROOM-13, DUB-05 | `DONE` — `specs/SecurityPolicies.md §11` (2단계 동의: 사전+사후, consent_json, 보존기간 90일, pg_cron 자동 삭제, 철회 메커니즘) + `DATA-SCHEMA.md §1.11·§1.12` 컬럼 추가 | `DONE` |
| G-40 | **월별 크레딧 할당량 경계 정책** | VGEN-02 | `DONE` — `specs/SecurityPolicies.md §12.3` (월 1일 100 credits, 일할 계산, pg_cron) | `DONE` |
| G-41 | **credit_transactions 동시성 제어 (격리 레벨 SSOT)** | VGEN-02 | `DONE` — `specs/SecurityPolicies.md §12.2` (FOR UPDATE 비관적 잠금 + idempotency_key 이중 방어) | `DONE` |
| G-42 | **PostgreSQL 격리 레벨 선언 (SecurityPolicies §2.5)** | VGEN-02 | `DONE` — `specs/SecurityPolicies.md §12.1` (READ COMMITTED + FOR UPDATE, SERIALIZABLE 과대설계 제외) | `DONE` |
| G-45 | **room-authority 메시지 타입 12개 완전화** | DataChannel SSOT | `DONE` — `DATA-SCHEMA.md §2.1` (12개 타입 모두 명시, _INDEX.md와 일치) | `DONE` |
| G-46 | **VgenExport.md 계약서** (VGEN-11/12·ROOM-18·RT-05 구현 블로커) | VGEN-12 완성 쇼츠 다운로드+SNS 공유 | `DONE` — `contracts/VgenExport.md` (VgenExportPanel: R2 서명 URL·9:16 변환·공유링크·vgenStore.exportState) | `DONE` |
| G-47 | **Admin Review Console 명세** | VGEN-06 사후 모더레이션 | `DONE` — `state-machines/Vgen.md §Admin Review Console` (검토 항목·액션·RLS·24시간 자동 거절) | `DONE` |
| G-48 | **사후 모더레이션 FSM 완성 (flagged 상태)** | VGEN-06 | `DONE` — `state-machines/Vgen.md` (FLAGGED 상태 + DONE→FLAGGED→DONE/FAILED 전이, C14) | `DONE` |
| G-49 | **WebGL Context Loss Recovery SOP** | ROOM-03 | `DONE` — `state-machines/Avatar.md Edge Case 4` (C16에서 처리: voice-only badge + host alert + context restored) | `DONE` |
| G-50 | **Room 삭제 시 R2 Cascade 정책** | ROOM-01 | `DONE` — `DATA-SCHEMA.md §1.2` (rooms DELETE 시 R2 오브젝트 자동 삭제: background·vgen·recording·dub, Cloudflare Worker + pg_cron) | `DONE` |
| G-51 | **멀티탭 동시 진입 프로토콜** | ROOM-04 | `DONE` — `DATA-SCHEMA.md §1.3` (UNIQUE 충돌 + ON CONFLICT DO NOTHING, LiveKit kick first, "이미 다른 탭에서 접속 중" 메시지, C17) | `DONE` |
| G-52 | **design/scene-prompts.md 재확인** | G-24 | `DONE` — 557줄 존재 확인, 레이어 분해 PNG 프롬프트 완비 (17개 레이어) | `DONE` |
| G-53 | **OBS 토큰 검증 RLS 완성** | OBS-02 | `LATER` — OBS 자체가 P2 옵션이므로 P0/MVP 구현 범위 아님. 구현 시 token_hash RLS + Edge 검증만 허용 | `LATER` |
| **— 사용자 여정 감사 P1 (G-54~G-67) —** | | | | |
| G-54 | **비밀번호 재설정 flow** (forgot password) | AUTH-01~03 | Auth.md RESET_REQUEST·RESET_NEW_PW 상태 + `auth.resetPasswordForEmail()`·`auth.updateUser({password})` + ForgotPasswordForm·ResetPasswordForm 컴포넌트 | `DONE` |
| G-55 | **이메일 인증 UX** (confirm·재전송·타이머) | AUTH-01~02 | Auth.md PENDING_VERIFICATION 상태; `auth.resend({type:'signup'})` + 60초 재전송 cooldown; EmailVerificationPending 컴포넌트 + 마스킹 이메일 표시 | `DONE` |
| G-56 | **게스트→정회원 이력 마이그레이션** | LOB-07·AUTH-02 | DATA-SCHEMA users.anonymous_session_id 추가; Edge Function `migrate-guest-history` (recordings/room_participants/user_room_history 소유권 이관, non-blocking 실패 처리) | `DONE` |
| G-57 | **온보딩 재시청 옵션** | CNT-06 (CinematicIntro) | Onboarding.md INTRO→INTRO 전이 추가, SettingsPage.md "첫 방문 가이드 다시 보기" 버튼 + userStore.restart_requested; INTRO 완료 시 리셋 | `DONE` |
| G-58 | **장르 선택 → 로비 시각화** (추천 반영 UI) | LOB-01 (방 목록) | LobbyPage.md preferred_genres 필터 + RoomCard "당신의 장르" 뱃지 + 일치도순 정렬 | `DONE` |
| G-59 | **방 가득 참 알림/대기열** | LOB-01·ROOM-01 | DATA-SCHEMA room_waitlist 테이블; NotificationCenter "자리 생겼습니다" 알림; LobbyPage "대기 중" 표시 | `DONE` |
| G-60 | **방 검색 다중 필터** (태그+장르+인원+언어) | LOB-02 (P1) | LobbyPage.md §RoomFilter: checkbox(genre)·select(language)·slider(min_participants) SQL WHERE 절 | `DONE` |
| G-61 | **방 카드 언어 표시** | LOB-01 (RoomCard) | DATA-SCHEMA rooms.language (default='ko'); LobbyPage.md §RoomCard 우상단 언어 뱃지 (ko→🇰🇷, en→🇺🇸, ja→🇯🇵, zh→🇨🇳), CreateRoomModal language 드롭다운 추가 | `DONE` |
| G-62 | **Green Room 다중 참가자 상태 표시** | ROOM-01·MOD-05 | GreenRoom.md 우측 패널: room_participants 리스트 (avatar_thumbnail·role·is_ready) | `DONE` |
| G-63 | **즉흥 모드 UI** (ScriptPanel 없을 때 대체 UI) | ROOM-06 (대본) | RoomView.md §G-63 + ScriptPanel.md §G-63 (script_id 조건부 렌더, ImpromptuModePanel: 리액션 버튼+주제 카드) | `DONE` |
| G-64 | **Self-모니터 PiP** (내 아바타 자기 미리보기) | ROOM-03 (아바타) | RoomView.md §G-64 + HostConsole.md §G-64 (FloatingSelfMonitor: 우상단 고정, 100~200px 리사이즈, stageStore.showSelfMonitor 토글) | `DONE` |
| G-65 | **늦참 입장 프로토콜** (비디오 동기·역할 배정) | ROOM-04·ROOM-08 | `DONE` — DATA-SCHEMA.md §1.2 rooms.playback_position_ms 추가; Participant.md 늦참 입장 프로토콜 섹션; GreenRoom.md 공연 이미 시작된 경우 건너뜀 | `DONE` |
| G-66 | **작품 공개 범위 설정** (public/private/members) | ROOM-13 (녹화) | `DONE` — DATA-SCHEMA.md §1.8·§1.11에 visibility 컬럼 추가 (enum: public/private/members_only) + RLS 게이트 문서화; VgenExport.md §3.5 공개 범위 선택 UI 추가 | `DONE` |
| G-67 | **방 아카이브/갤러리** (ended 방 콜렉션) | LOB-01·ROOM-13 | `DONE` — LobbyPage.md §컴포넌트 구조에 PastRoomsSection 추가 (rooms.status='ended' 필터·recordings LEFT JOIN·썸네일·무한 스크롤); §Supabase 접근에 상세 쿼리 명시 | `DONE` |
| **— 사용자 여정 감사 P2 (G-68~G-79) —** | | | | |
| G-68 | **방 생성 단계별 위저드** | LOB-03 (방 생성) | 단일 폼 → 테마·분위기·예상 시간·필요 인원 단계별 StepWizard | `LATER` |
| G-69 | **자동 매칭·"진행 중" 표시** | LOB-01 | 혼자 방 만들 때 자동 추천·"X명 들어오는 중" 소셜 표시 | `LATER` |
| G-70 | **발성 워밍업·표정 연습 가이드** | MOD-05 (GreenRoom) | 캘리브레이션 전 발성·표정 가이드 튜토리얼 스텝 | `LATER` |
| G-71 | **대기 시간 활동** (Green Room idle) | MOD-05 | 아바타 표정 연습 미니게임·채팅 사전 대화 | `LATER` |
| G-72 | **1:1 귓속말** | ROOM-05 (채팅) | DM용 별도 DataChannel 또는 채팅 recipient 필드 | `LATER` |
| G-73 | **FPS·트래킹 레이턴시·핑 디버그 오버레이** | RT-01~05 | VTuber 퍼포먼스 디버그 오버레이 (SET 또는 단축키 토글) | `LATER` |
| G-74 | **녹화물 편집** (트림·챕터 분할) | ROOM-13 (녹화) | 작품함 내 영상 트림 UI + 챕터 마킹 | `LATER` |
| G-75 | **SNS 공유 OG 이미지·썸네일 생성** | VGEN-12 (공유) | 공유 링크 OG 태그·썸네일 파이프라인 (Edge Function) — 2026-07-01 재확인: 여전히 유효, 우선순위 상향 권고(G-251 참조) | `LATER` |
| G-76 | **커튼콜·공연 종료 연출** | ROOM-01 | 공연 종료 시 박수 소리·엔딩 크레딧 연출 | `LATER` |
| G-77 | **친구 온라인 상태** | LOB-08 | `DONE` — G-195 `contracts/FriendSystem.md` §Realtime `friends_presence` 채널로 이미 구현됨 (2026-07-01 재확인) | `DONE` |
| G-78 | **크리에이터 팔로우·구독** | LOB-08 | 팔로우 관계는 G-195로 DONE. "공연 시작 알림" 트리거는 G-266(`FriendSystem.md` `followed_creator_stream_start`)으로 2026-07-01 DONE. 남은 갭은 "구독"(follow와 구분되는 등급/결제) 개념 부재뿐 | `LATER` |
| G-79 | **사용자 통계·뱃지·게이미피케이션** | CNT-* | `DONE` — G-267 `contracts/ProfilePage.md` §활동 요약 (공연 주최·참가 횟수·생성 영상 수·총 시청시간) | `DONE` |
| **— 시스템·경쟁력·운영 감사 (G-80~G-84, G-105~G-107) —** | | | | |
| G-81 | **display_name 방 내 구분 정책** (동명이인 slot_index 표시) | AUTH/채팅/슬롯 | P1 | `DONE` |
| G-82 | **UTC 타임존 통일 + pg_cron UTC 재설정** | 글로벌 사용자·크레딧 할당 | P1 | `DONE` |
| G-83 | **사용자당 R2 스토리지 쿼터** (기본 10GB, 80% 경고) | INF-06·VGEN·녹화 | P1 | `DONE` |
| G-84 | **user_blocks 입장 게이트** (차단+같은방 원천 차단) | SEC-04·livekit-edge-fn | P1 | `DONE` |
| G-105 | **BGM 라이브러리** (AudioMixer 사운드보드 확장) | AudioMixer.md | P2 | `LATER` |
| G-106 | **대본 포맷 import** (SRT·Celtx→JSON 변환) | ScriptPanel.md | P2 | `LATER` |
| G-107 | **PWA 설치 지원** (홈 화면 추가·오프라인 캐시) | PLATFORM | P2 | `LATER` |
| **— 모더레이션·아바타·상태머신 감사 (G-89~G-104) —** | | | | |
| G-89 | **AUTORIG→ChatterBox 계약서** | MOD-01/02 (Vtube 파이프라인 UI) | `contracts/AvatarAutorig.md` (업로드·프리셋·선택) | `DONE` |
| G-90 | **모델 마켓/스토어** | B-8 아바타 탐색 | P2 (후속 기능) | `LATER` |
| G-91 | **VGEN 프롬프트 거절 시 수정 가이드 UX** | VGEN-06 (모더레이션 거절) | `contracts/VgenPanel.md` 확장 (거절 이유·카테고리·수정안 제시) | `DONE` |
| G-92 | **FLAGGED 생성물 사용자 통보·appeal UX** | VGEN-06 (사후 모더레이션) | `state-machines/Vgen.md` 확장 + `contracts/VgenPanel.md` appeal 플로우 | `DONE` |
| G-93 | **신고(SEC-04) 접수→처리 피드백 루프** | SEC-04 (신고 시스템) | `specs/SecurityPolicies.md §18 신설` (접수 확인·처리 상태·결과 통보) | `DONE` |
| G-94 | **계약서 loading/error 상태 표준화** | 24/29 계약서 (로딩·에러 미정의) | `contracts/_INDEX.md` 표준 추가 + 각 계약서 loading/error Props 확장 | `DONE` |
| G-95 | **방 인원 초과 거절 UX** | LOB-01·ROOM-01 (방 입장) | `state-machines/Room.md` Edge Case 추가 (max_participants 도달 시 거절 팝업) | `DONE` |
| G-96 | **방 삭제 중 참가자 처리** | ROOM-01 (방 종료) | `state-machines/Room.md` Edge Case 확장 (진행 중 삭제 시 강제 퇴장·알림) | `DONE` |
| G-97 | **2기기 동시 접속 프로토콜** | ROOM-04·AUTH-01 (세션 관리) | `state-machines/Participant.md` Edge Case 추가 (중복 접속 감지·이전 세션 종료) | `DONE` |
| G-98 | **ICE 타임아웃 UX** (>30초) | ROOM-04 (WebRTC 연결) | `state-machines/WebRTC.md` Edge Case 확장 (명시적 타임아웃·폴백 UI) | `DONE` |
| G-99 | **코덱 협상 실패 처리** | ROOM-04 (WebRTC) | `state-machines/WebRTC.md` Edge Case 추가 (협상 실패·폴백·음성만 모드) | `DONE` |
| G-100 | **메모리 부족 렌더 실패** | MOD-03 (아바타 렌더) | `state-machines/Avatar.md` Edge Case 확장 (GC 트리거·해상도 자동 감소) | `DONE` |
| G-101 | **호스트 위임 거절 정책** | HOST-03 (권한 양도) | `state-machines/HostAuthority.md` Edge Case 추가 (거절 시 현 호스트 유지·알림) | `DONE` |
| G-102 | **스크립트 동시 편집 충돌** | ROOM-06 (대본) | `state-machines/Script.md` Edge Case 추가 (LWW·충돌 해소 알림) | `DONE` |
| G-103 | **스크립트 삭제 중 사용** | ROOM-06 (대본) | `state-machines/Script.md` Edge Case 추가 (삭제 진행 중 접근 차단·경고) | `DONE` |
| G-104 | **스크립트 버전 히스토리** | ROOM-06 (대본) | `contracts/ScriptPanel.md` 확장 + `DATA-SCHEMA.md` script_versions 테이블 추가 | `DONE` |

---

## 레이어 6 — 데이터 스키마 불일치 (DATA-SCHEMA.md 미반영)

| ID | 누락 항목 | 영향 기능 | 수정 위치 | 상태 |
|---|---|---|---|---|
| G-21 | **users.onboarding_step · preferred_genres 컬럼** | 온보딩 플로우 전체 | `DATA-SCHEMA.md §1.1 users` | `DONE` |
| G-24 | **design/scene-prompts.md 미존재** | GPT Image 2 씬 재생성 불가 | `design/scene-prompts.md` 신규 작성 (프롬프트 3종 + 스타일가이드) | `DONE` |
| G-22 | **expression_presets 테이블 정의** | SET-05 (품질 조절) | `DATA-SCHEMA.md §PENDING → 정식 §1.x` | `DONE` |
| G-23 | **turn_timings 테이블 정의** | TimedTurnsProgressBar (ROOM 큐 타이밍) | `DATA-SCHEMA.md §PENDING → 정식 §1.x` | `DONE` |

---

## 레이어 7 — 인프라·품질·지속가능성 감사 (G-108~G-138)

### 5차 분석 — 코드 품질·고객 지원·접근성·데이터 안정성 (2026-06-30)

| ID | 누락 항목 | 우선 | 영향 기능 | 산출 문서 | 상태 |
|---|---|---|---|---|---|
| **G-108** | **React ErrorBoundary 에러 경계 전략** | P0 | ChatPanel 등 자식 컴포넌트 장애 격리 | `RUNTIME-HARDENING-REVIEW.md` §ErrorBoundary 추가 + `contracts/ErrorBoundary.md` 신규 | `DONE` |
| **G-109** | **Feature Flag / 점진 배포 정책** | P1 | VGEN·DUB·신기능 안전한 출시 | `specs/FeatureFlags.md` (플래그 정의·Supabase 저장소·클라이언트 로드 패턴) | `DONE` |
| **G-110** | **코드 스플리팅 + 레이지 로딩 전략** | P1 | 초기 JS 번들 2MB+ 감소 (현황 분석 필수) | `PLATFORM-ARCHITECTURE.md` §번들 전략 신설 (라우트별·컴포넌트별 청크 분할) | `DONE` |
| **G-111** | **테스트 전략 체계화** (vitest/playwright) | P0 | 단위·통합·E2E 테스트 커버리지·CI 게이트·테스트 데이터 | `specs/TestStrategy.md` (층별 범위·mock 전략·coverage target 70%) | `DONE` |
| **G-112** | **상태머신(FSM) 자동 검증 도구** | P1 | 12개 상태머신의 전이 유효성·엣지케이스 체크 | `specs/_FSM-VALIDATION.md` (전이 매트릭스 검증·도구 선택·CI 통합) | `DONE` |
| **G-113** | **인앱 도움말 / 튜토리얼 시스템** | P1 | VGEN·DUB·필살기 사용법 애니메이션·팝오버 안내 | `contracts/HelpPanel.md` (TourStep·하이라이트·스킵·완료 추적) | `DONE` |
| **G-114** | **고객 문의 채널** (인앱 피드백 버튼) | P1 | 사용자 이슈 접수·지원팀 대시보드 | `specs/FeedbackChannel.md` (피드백 폼·Supabase 저장·이메일 알림·분류 태그) | `DONE` |
| **G-115** | **Accessibility 탭 구현** (고대비·글자확대·모션감소·스크린리더) | P1 | WCAG 규정 준수·포용적 UI | `contracts/SettingsPage.md` §Accessibility 확장 (고대비 모드·글자크기 150%/200%·prefers-reduced-motion·aria-label) | `DONE` |
| **G-116** | **WCAG 접근성 레벨 타겟 명시** (A/AA/AAA 중 선택) | P0 | 색 대비 비율·ARIA 속성·키보드 네비게이션 | `specs/AccessibilityPolicy.md` (AA 목표·색상 대비 4.5:1·포커스 인디케이터·ARIA 규칙) | `DONE` |
| **G-117** | **다크 / 라이트 테마 전환** | P2 | UX 편의성·배터리 절감 (OLED) | `contracts/ThemeToggle.md` 또는 `SettingsPage.md` 확장 (토글·CSS var·localStorage 저장) | `LATER` |
| **G-118** | **VGEN 생성 단가 산출 및 검증** | P0 | 월 100 크레딧 경제성·가격 정책 결정 | `specs/VgenCostAnalysis.md` (§1 모델단가표·§2 크레딧단위·§3 티어별비용·§4 model_id 환경변수·§5 2.5전환체크리스트) + `contracts/VgenPanel.md` §영상길이설정(UI/렌더규칙/환경변수 동기) | `DONE` |
| **G-119** | **SET-05 "자동 품질 조절" 구체 정의** | P1 | 저대역폭/저사양 자동 적응 (해상도·FPS·blendshape 전송률) | `specs/NetworkAdaptiveQuality.md` (LiveKit VideoQuality API·ConnectionQuality 이벤트·Simulcast 레이어·자동 조정 로직) | `DONE` |
| **G-120** | **DB 백업 + 재해복구 계획** | P0 | Supabase 자동 백업·R2 아카이브·RTO/RPO 정책 | `specs/BackupDisasterRecovery.md` (일일 백업·7일 보존·RPO 1일·RTO 4시간·복구 절차) | `DONE` |
| **G-121** | **커뮤니티 가이드라인 + 신고 정책** | P0 | 금지 행동 정의·신고→조사→조치 플로우 | `specs/CommunityGuidelines.md` (금지 콘텐츠·신고 분류·이의제기·해제 프로세스) | `DONE` |

### 7차 분석 — 기술 구현 깊이·미디어·로깅·점진적향상 (2026-06-30)

> 접근성 세부항목(ARIA·키보드·포커스·라이브리전·색대비·모션감소)은 G-116 `AccessibilityPolicy.md` 범위에 포함.  
> i18n 구현 깊이(포맷·로케일·워크플로)는 G-17 LATER 범위.  
> WebRTC 미지원 폴백은 MVP에서 불필요(앱 핵심 기능 = WebRTC).

| ID | 누락 항목 | 우선 | 영향 기능 | 산출 문서 | 상태 |
|---|---|---|---|---|---|
| **G-122** | **미디어 코덱·품질 파라미터** (오디오+비디오) | P1 | ROOM-04 WebRTC 음질·DUB 녹음 품질·VGEN 출력 해상도·쇼츠 9:16 포맷 | `specs/MediaConfig.md` (LiveKit AudioConfig: Opus·48kHz·모노; VGEN 출력: 720p/1080p·비트레이트·H.264; DUB: 샘플레이트·WAV→MP4) | `DONE` |
| **G-123** | **TURN/STUN/ICE 서버 구성 명세** | P1 | ROOM-04 WebRTC 연결 안정성·나트 통과·셀프호스트 대비 | `PLATFORM-ARCHITECTURE.md` §7.7 WebRTC-ICE 신설 (LiveKit Cloud 기본 TURN·셀프호스트 coturn 포트·인증 방식·연결 실패 디버깅 절차) | `DONE` |
| **G-124** | **MediaPipe 모델 버전·WASM 변종·로드 전략** | P1 | MOD-03 얼굴 트래킹·iOS Safari 폴백 (PLATFORM-ARCH §5.2 1줄이 전부) | `specs/MediaPipeConfig.md` (FaceLandmarker Lite/Full 선택·WASM 변종·모델 파일 크기·CDN 사전 캐시·iOS 미지원 시 키보드 표정 트리거 폴백) | `DONE` |
| **G-125** | **Error logging PII 필터링 정책 + 로그 보존 기간** | P0 | 개인정보보호법·GDPR — Sentry에 채팅 내용·user_id·room_id·blendshape 노출 위험 | `specs/SecurityPolicies.md` §17 신설 (Sentry `beforeSend` PII 마스킹 규칙·채팅 내용 제외 명시·audit_logs 보존 90일·Sentry 이벤트 90일·console.log PII 금지 규칙) | `DONE` |
| **G-126** | **Sentry 환경별 상세 설정** | P1 | 모니터링 운영·오류 추적 — 샘플링·소스맵·env별 DSN·성능 트레이싱 미정 | `specs/SentryConfig.md` (dev 10%·prod 1% `tracesSampleRate`·소스맵 Vercel CI 업로드·dev/staging/prod DSN 분리·`beforeSend` PII 훅 인터페이스) | `DONE` |
| **G-127** | **Progressive Enhancement 폴백 정책** | P1 | WebGL 미지원·MediaPipe 미지원·JS 비활성화 엣지 사용자 | `PLATFORM-ARCHITECTURE.md` §7.6 폴백 신설 (WebGL 미지원→Canvas2D 아바타 또는 정적 이미지·MediaPipe 미지원→키보드 트리거·`<noscript>` 안내 메시지) | `DONE` |

### 8차 분석 — 구현 진입장벽·런칭 준비·플랫폼 경제 (2026-06-30)

> **COVERED (기존 문서 대응):** Item 2(.env.example) → G-80 PLATFORM-ARCH §Env 변수 목록 존재 | Item 8(환경 전환 전략) → G-80 dev/staging/prod 3단계 명시 | Item 14(크레딧 경제성) → G-118 VgenCostAnalysis.md | Item 17(인시던트 대응) → G-120 BackupDisasterRecovery.md §5 시나리오 5개.

| ID | 누락 항목 | 우선 | 영향 기능 | 산출 문서 | 상태 |
|---|---|---|---|---|---|
| **G-128** | **플랫폼 셋업 가이드** (Vite SPA 첫 커밋까지 단계별) | P1 | 신규 개발자 진입 — npm create vite·Supabase 연동·LiveKit 설정·dev 서버 기동 | [[DEVELOPMENT-GUIDE]] (사전 요구사항·저장소 클론·env 설정·서비스 연동·첫 실행 체크리스트) | `DONE` |
| **G-129** | **빌드 순서·Feature 의존성 트리** (101개 Feature ID 구현 순서) | P1 | 코딩 착수 시 무엇부터 만들지 불명확 — AUTH→LOBBY→ROOM 의존 체인 미정 | [[IMPLEMENTATION-ORDER]] (P0 Feature 의존성 DAG·스프린트 블록 3~5개·병렬 가능 Feature 명시) | `DONE` |
| **G-130** | **Vite SPA(플랫폼) 배포 명세** | P1 | Cloudflare Pages 배포·환경 변수 주입·CDN 캐시·Edge Function 동시 배포 미문서화 | [[DEPLOY-PLATFORM]] (Cloudflare Pages 빌드 설정·`wrangler.toml`·Supabase Edge Function 배포 순서·Vercel 랜딩과 분리 운영) | `DONE` |
| **G-131** | **랜딩↔플랫폼 URL·라우팅 전환 전략** | P1 | snack-web-khaki.vercel.app(Next.js) ↔ Vite SPA — 동일 도메인? 서브도메인? 분기 라우팅? 미정 | `PLATFORM-ARCHITECTURE.md §7.4` URL전략 신설 (MVP 별도 URL·프로덕션 서브도메인·Cloudflare DNS CNAME·동일도메인 Workers 필요) | `DONE` |
| **G-132** | **시드 데이터 전략** (데모룸·기본 모델·템플릿 대본) | ~~P2~~ **P1** | 런칭 첫날 방 0개·모델 0개 → 첫인상 최악. **⚠️ 우선순위 역전 해소(21차):** 파생 G-184/G-188(연습방·시드대본팩)이 P1인데 그 선행조건인 본 항목이 P2였음 → **P1로 승격.** LOB-10/CNT-09(FEATURE-SPEC P1)의 선행 | `SEED-DATA.md` 예정 (seed SQL·기본 모델 에셋 목록·템플릿 대본 2~3개·데모룸 운영 일정) | `RESEARCH` |
| **G-133** | **전체 인프라 월별 비용 추정** (DAU 100/1K/10K 스케일) | P1 | Supabase Pro·LiveKit Cloud·fal.ai·OpenAI Whisper·R2 합산 월 청구액 미산출 — 수익 모델 성립 여부 불투명 | [[COST-ESTIMATE]] (서비스별 단가표·DAU 3시나리오 비용표·fal.ai 95% 점유·손익분기 분석·비용 제어 전략) | `DONE` |
| **G-134** | **운영 모니터링 대시보드 설계** | P1 | 실시간 방 수·동시 접속자·생성 요청·API 지연·에러율 — Sentry만으론 부족, 운영 가시성 無 | `specs/MonitoringDashboard.md` (Supabase Realtime 지표·LiveKit 방 통계·fal.ai 큐 길이·Sentry 에러율 집계·대시보드 툴 선택) | `DONE` |
| **G-135** | **DB 스키마 마이그레이션 전략** | P1 | 스키마 변경 시 `supabase migration`·기존 데이터 변환·롤백·제로다운타임 방법 미문서화 | `specs/MigrationStrategy.md` (supabase migration 워크플로·로컬→staging→prod 순서·3단계 제로다운타임 패턴·DOWN 마이그레이션) | `DONE` |
| **G-136** | **API/SDK 버저닝 정책** | P2 | 향후 Edge Function 인터페이스 변경 시 클라이언트 하위호환 전략 미정 | `specs/APIVersioning.md` (URL 버저닝 vs 헤더 버저닝·deprecation 공지 채널·클라이언트 핀닝 규칙) | `LATER` |
| **G-137** | **Definition of Done (기능 완료 기준)** | P1 | "완료"의 정의 없음 — 계약서 작성?·테스트 통과?·QA?·배포? 기준 없으면 PR 검토 불가 | [[DEFINITION-OF-DONE]] (기본 DoD 5항목·카테고리별 추가 항목·PR 템플릿·CI 자동화·긴급 배포 예외) | `DONE` |
| **G-138** | **외부 서비스 가입 절차 + 개발 워크플로** (브랜치·커밋·PR) | P2 | Supabase/LiveKit/fal.ai/OpenAI 계정 생성 단계·팀 개발 규칙 미문서화 | `CONTRIBUTING.md` 예정 (서비스별 가입 링크·API 키 발급 경로·브랜치 전략·커밋 컨벤션·PR 템플릿) | `LATER` |

### 9차 분석 — 어떻게 만들지·어떻게 운영할지 (G-139~G-149)

> **COVERED (기존 문서 대응):** Item 5(P0 의존성 그래프)→G-129 IMPLEMENTATION-ORDER.md | Item 13(유닛 테스트)→G-111 TestStrategy.md | Item 17(운영 메트릭)→G-134 MonitoringDashboard.md | Item 19(비용 알림)→G-133+G-134 | Item 24(지원 채널)→G-114 FeedbackChannel.md | Item 29(커뮤니티 집행)→G-121 CommunityGuidelines.md | Item 30·31·32(비용 예산·모델·크레딧)→G-133+G-118.

| ID | 누락 항목 | 우선 | 영향 기능 | 산출 문서 | 상태 |
|---|---|---|---|---|---|
| **G-139** | **Vite SPA repo 결정 + 플랫폼 폴더 구조** (모노레포 vs 별도·src/ 구조·barrel exports) | P1 | 개발 착수 시 폴더 배치·import 경로·feature grouping 기준 없음 | `PLATFORM-ARCHITECTURE.md §스캐폴드-폴더구조` 신설 (모노레포 결정·src/stores·hooks·services·types·utils 구분·feature-based grouping·barrel export 정책) | `DONE` |
| **G-140** | **vite.config.ts + Tailwind 4 config 구체 코드** (@vitejs/plugin-react·path alias·proxy·토큰 주입) | P1 | vite.config.ts 없이 `npm run dev` 불가·Tailwind에 stage-night·fire-amber·warm-white 미주입 시 디자인 토큰 깨짐 | [[VITE-CONFIG]] (vite.config.ts 전체·tailwind.config.ts 전체·CSS 변수 매핑·@tailwindcss/vite 플러그인·경로 alias @/) | `DONE` |
| **G-141** | **단계별 마일스톤 + Acceptance Criteria** (Phase별 완료 기준) | P1 | "Phase 1 완료"의 정의 없음 — PR 검토 기준·배포 결정·팀 보고 불가 | [[MILESTONES]] (Phase 0~5·각 마일스톤 정의·acceptance criteria·검증 시나리오·예상 기간) | `DONE` |
| **G-142** | **코딩 컨벤션 문서** (파일명·Zustand 패턴·DataChannel 디스패처·에러 처리·컴포넌트 체크리스트) | P1 | 29개 계약서를 코드로 옮길 때 개발자마다 패턴 달라짐 위험 | [[CODING-CONVENTIONS]] (PascalCase·camelCase 규칙·Zustand slice 패턴·DataChannel switch-case 템플릿·async 에러 처리·컴포넌트 구현 순서 체크리스트) | `DONE` |
| **G-143** | **통합·E2E·Mock 테스트 전략 심화** (G-111 TestStrategy.md 확장) | P1 | TestStrategy.md 기본 있지만 "ChatPanel→DataChannel→Supabase→Realtime" 크로스 컴포넌트 시나리오·Playwright E2E 플로우·LiveKit/MediaPipe Mock 패턴 없음 | `specs/TestStrategy.md` §§통합시나리오·E2E플로우·Mock-Fixture 확장 | `DONE` |
| **G-144** | **모니터링 알림 임계값·수신자 정의** (MonitoringDashboard.md 확장) | P1 | "WebRTC 연결 실패율 > 5% → Slack #alerts" 같은 구체 룰 전무 — 장애 발생 시 아무도 모름 | `specs/MonitoringDashboard.md` §알림규칙 추가 (메트릭별 임계값·수신 채널·에스컬레이션 경로) | `DONE` |
| **G-145** | **인시던트 플레이북** (심각도 정의·공지 템플릿·런북·포스트모템) | P1 | 서버 장애 시 누가 뭘 하는지 정의 없음 — 같은 장애 반복 위험 | [[INCIDENT-PLAYBOOK]] (P0~P3 심각도·SLA·장애 공지 템플릿·API 키 만료/DB 복구/LiveKit 이슈 런북·포스트모템 템플릿) | `DONE` |
| **G-146** | **고객 지원 플레이북** (FAQ 스크립트·버그 리포트 프로세스) | P1 | FeedbackChannel.md는 채널만 정의. "방 입장 불가·소리 안 들림" 대응 스크립트·우선순위 결정 프로세스 없음 | [[SUPPORT-PLAYBOOK]] (FAQ 대응 스크립트 10개·버그 접수→재현→우선순위→수정 프로세스·응답 시간 SLA) | `DONE` |
| **G-147** | **모더레이션 운영 워크플로** (Admin Console 사용법·검토 주기·이의제기 SLA) | P1 | G-47 Admin Review Console 계약 있지만 실제 운영자가 어떻게 큐를 처리하는지 절차 없음 | [[MODERATION-OPS]] (일일 검토 주기·거절 기준 세분화·이의제기 처리 72h SLA·에스컬레이션·주간 리포트 형식) | `DONE` |
| **G-148** | **시드 데이터 갱신 주기** (데모룸·프리셋 모델·템플릿 대본 업데이트 일정) | P2 | 한 번 만들고 방치 위험 — 월별 갱신? 분기별? 담당자? | `SEED-DATA.md` §갱신정책 예정 (G-132 연계) | `LATER` |
| **G-149** | **보안 운영** (API 키 로테이션·CVE 스캔·프로덕션 액세스 리뷰) | P1 | LiveKit/Supabase/fal.ai/OpenAI 키 교체 주기 없음·정기 패치 프로세스 없음·프로덕션 접근자 리뷰 없음 | [[SECURITY-OPS]] (키 로테이션 90일 정책·`npm audit` 월별 스케줄·의존성 업데이트·프로덕션 액세스 리스트·긴급 패치 절차) | `DONE` |

### 10차 분석 — 사용자 여정 전체 시뮬레이션 + 문서 간 모순 (G-150~G-164)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-150** | **ProfilePage / 계정 관리 Feature ID 신설** (PROFILE-01~02) | P0 | FEATURE-SPEC에 프로필 수정 Feature ID 없음. SettingsPage는 디바이스·핫키만 다루고 닉네임·자기소개·프로필 사진 변경 진입점 부재 | [[ProfilePage]] 계약서 작성 완료 (PROFILE-01: display_name·bio·avatar_url·profile_visibility·R2 업로드·RLS) + FEATURE-SPEC PROFILE-01~03 섹션 신설 | `DONE` |
| **G-151** | **이메일/비밀번호 변경 UI** (AUTH-04) | P0 | 비밀번호 재설정(G-54)은 로그인 화면 플로우만. 로그인 후 이메일·비밀번호 변경 UI가 FEATURE-SPEC·SettingsPage에 없음 | SettingsPage.md Tab 6 Security 추가 완료 (이메일 변경: `updateUser({ email })` 인증 이메일 발송·비밀번호 변경: 재인증 → `updateUser({ password })`·OAuth 계정 감지 로직) | `DONE` |
| **G-152** | **앱 내 계정 삭제 + 데이터 내보내기 UI** (AUTH-05/06) | P0 | G-85(PP)·G-88(DATA-EXPORT 정책) 법률문서는 DONE이지만 앱 안에서 누를 버튼·흐름 없음. SUPPORT-PLAYBOOK이 "기능 준비 중"으로 직접 인정 | SettingsPage.md Tab 7 Account 추가 완료 (데이터 내보내기: `POST /functions/v1/data-export-request`·계정 삭제: 2단계 모달+재인증+`rpc('soft_delete_user')` 인자 없음·`users.deleted_at` 소프트 삭제·30일 pg_cron) | `DONE` |
| **G-153** | **Discord/Twitter OAuth Feature ID 미등록** (AUTH-02b/02c) | P1 | PLATFORM-ARCHITECTURE §4에 "버튜버 커뮤니티 친화"로 언급되지만 FEATURE-SPEC AUTH-02b/02c 없음 — 문서 간 범위 불일치 | FEATURE-SPEC AUTH-02b/02c P1 등록 완료 ✓ + PLATFORM-ARCHITECTURE §4에 "P1 Phase 2 — AUTH-02b·02c" 주석 추가 완료 | `DONE` |
| **G-154** | **손들기/발언 큐 + 무대 초대 Feature ID 없음** (ROOM-20·21) | P1 | PLATFORM-ARCHITECTURE에 Zoom 패턴 언급이지만 FEATURE-SPEC에 ROOM-20(손들기·큐)·ROOM-21(관객→무대 초대) 없음 | FEATURE-SPEC ROOM-20/21 P1 등록 완료 ✓ + HostConsole.md G-154 RaiseHandQueue 섹션 추가 완료 (raise_hand_at Realtime·invite_to_stage DataChannel·room_participants 컬럼 명세) | `DONE` |
| **G-155** | **호스트 채팅 관리 도구 미비** (HOST-08~11) | P1 | HOST-01(강퇴)·HOST-02(비활성화)만 있음. mute timeout·slow mode·금칙어 필터·채팅 클리어 없음 | FEATURE-SPEC HOST-08~11 P1 등록 완료 ✓ + HostConsole.md G-155 Chat Safety 섹션 추가 완료 (HOST-09 슬로우모드·HOST-10 금칙어 필터·HOST-11 채팅 클리어·rooms 테이블 컬럼·slow_mode/chat_clear DataChannel 타입) | `DONE` |
| **G-156** | **알림 설정 센터 없음** (SET-14 / PROFILE-03) | P1 | 예약 방 알림(G-59 wait-list 토스트)·초대 알림은 산발적으로 있지만 통합 알림 ON/OFF 설정 UI 없음 | SettingsPage.md Tab 8 Notifications 추가 완료 + ProfilePage.md §알림 설정 공유 + `users.notification_prefs JSONB` SSOT. DATA-SCHEMA 반영됨 | `DONE` |
| **G-157** | **서비스 상태 페이지 없음** | P1 | 장애 시 사용자 대면 공개 상태 페이지 없음. INCIDENT-PLAYBOOK(G-145)은 내부 런북이지만 외부 공개 페이지는 별도 | Cloudflare Pages + BetterUptime/instatus.com 연동 결정 + INCIDENT-PLAYBOOK §상태페이지 절차 추가 | `RESEARCH` |
| **G-158** | **Viewer Gate 컴포넌트 계약서 없음** | P1 | ONBOARDING-FLOW.md에 Viewer Gate(무대/객석 분리 진입 조건) 명시되었지만 별도 Component Contract 없음. MobileViewer.md·LobbyPage.md 경계 불명확 | contracts/ViewerGate.md 신규 작성 완료 (입장 조건 매트릭스 8항목·resolveRole() 타입스크립트·모바일 판정 기준·Room FSM 전이 시점·_INDEX.md 31개 갱신) | `DONE` |
| **G-159** | **[CONFLICT] OAuth 범위 불일치** — PLATFORM-ARCHITECTURE §4 vs FEATURE-SPEC AUTH-02 | P1 | PLATFORM-ARCHITECTURE: Discord/Twitter OAuth "추가 예정". FEATURE-SPEC AUTH-02: Google OAuth만 P0. 두 문서가 다른 범위를 가리킴 | G-153으로 해소 완료 + PLATFORM-ARCHITECTURE §4 "P1 Phase 2 — AUTH-02b·02c" 주석 추가 완료 | `DONE` |
| **G-160** | **[CONFLICT] 모바일 P0 동작 미결정** — 차단 vs 뷰어 제한 | P1 | MOB-01 "데스크톱 우선" P0 + MOB-02 "모바일 뷰어 P1". P0 MVP에서 모바일 접속 시 정책이 문서에 없음 | FEATURE-SPEC MOB-01에 "모바일 접속 = 뷰어 전용 리다이렉트(차단 에러 아님)" 명시 완료 ✓ | `DONE` |
| **G-161** | **호스트 임시 음소거 Feature ID 공백** | P1 | Participant.md FSM에 `muted_by_host` 상태 존재. HOST-01(강퇴)·HOST-02(비활성화) 있음. 임시 음소거 UI/Feature ID 없음 | FEATURE-SPEC HOST-08(임시 음소거 + duration) P1 등록 완료 ✓ (G-155와 통합) | `DONE` |
| **G-162** | **콘텐츠 라이브러리 검색·태그·재생목록** | P2 | vgen_jobs/recordings 갤러리는 있지만 내부 검색·태그 필터·재생목록 기능 없음 | FEATURE-SPEC VGEN-13(라이브러리 검색/태그) P2 등록 — 시간 여유 시 착수 | `LATER` |
| **G-163** | **관객 투표/폴** | P1 | PLATFORM-ARCHITECTURE "선택 기능"으로 언급. 일본 모바일 viewer가 2등 시민처럼 느끼지 않게 하는 참여 루프 필요 | FEATURE-SPEC ROOM-22(관객 투표/폴) P1 등록 — ROOM-20/21 안정화 이후 Japan alpha 후보 | `LATER` |
| **G-164** | **팁·후원·구독제** | P2 | 현재 크레딧 소진형만. REALITY식 gift/tip과 VRChat식 creator economy 표면이 약함 | FEATURE-SPEC.md `ECON-01~03` 등록 — 관객 선물/후원, creator payout ledger, 멤버십/구독 패스. 실제 결제·KYC·세금·환불 계약은 P2 구현 직전 별도 승격 | `DONE` |

### 11차 분석 — 불안 해소 UX 보강 (G-165~G-169)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-165** | **GreenRoom 최종 미리보기 카드** | P0 | 첫 입장 직전 "내가 친구에게 어떻게 보이는지" 불안. 현재 검증 체크는 있으나 최종 3초 자기 확인 루프 부족 | `contracts/GreenRoom.md` FinalPreviewCard 추가 — avatar/audio/role/device 요약 + 3초 live preview + voice-only/viewer 폴백 재확인 | `DONE` |
| **G-166** | **초대 메시지 템플릿 + 준비물 안내** | P0 | 초대 받은 사용자가 Actor/Viewer 차이·PC/모바일·마이크/웹캠 필요 여부를 모름 | `contracts/LobbyPage.md` InviteMessageTemplate 추가 — host copy 버튼, role/device/prep checklist 포함 | `DONE` |
| **G-167** | **호스트 단계적 조치 UX** | P1 | 막말/방해 상황에서 강퇴만 있으면 과잉 대응. 경고→임시 뮤트→강퇴 사다리 필요 | `contracts/HostConsole.md` ParticipantSafetyLadder 추가 — warning/system message, timed mute, kick 순서 | `DONE` |
| **G-168** | **모바일 관객 반응 툴바** | P1 | 모바일 viewer가 채팅 외에 함께 있다는 표현 수단 부족 | `contracts/MobileViewer.md` AudienceReactionToolbar 추가 — viewer 권한 유지, Edge Function 경유 reaction 발송 | `DONE` |
| **G-169** | **VGen/녹화 최종 확인·취소 경로** | P0 | 크레딧·데이터가 걸린 액션에서 실수 복구가 약함 | `contracts/VgenPanel.md` CostActionConfirmDialog + `DATA-SCHEMA.md §recordings` 취소/폐기 상태 보강 | `DONE` |

### 12차 분석 — 일본 런칭·피치·신뢰·결제·분석 (G-170~G-179)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-170** | **피치 전 엔드투엔드 데모 시나리오** | P0 | 현재 저장소는 랜딩 중심이라 심사위원이 묻는 "실제로 돌아가나?"에 답할 증거가 약함 | `MILESTONES.md` Pitch Demo Gate 추가 — 2인 30초 방 시연·스크린샷·녹화·랜딩 CTA 분리 | `DONE` |
| **G-171** | **투자자용 1페이지 요약 패킷** | P0 | TAM/SAM/SOM, unit economics, roadmap, 실제 구현 증거가 문서별로 흩어져 있음 | `MILESTONES.md` Pitch Evidence Packet 추가 — 시장·경제성·로드맵·데모 증거 체크리스트 | `DONE` |
| **G-172** | **일본 가격·결제 준비** | P1 | Stripe/KRW 중심 가정은 일본 출시에서 JPY 표시·현지 결제 수단 검토가 빠짐 | `COST-ESTIMATE.md` Japan Pricing Readiness 추가 — JPY 표시·현지 결제 후보·세금/영수증 검토 | `DONE` |
| **G-173** | **일본 콘텐츠 규제·로컬 모더레이션 기준** | P1 | 글로벌 커뮤니티 가이드라인은 있으나 일본 출시용 법무 검토·동인/二次創作 기준이 없음 | `MODERATION-OPS.md` Japan Policy Review Gate 추가 — 출시 전 법무 체크리스트와 로컬 카테고리 | `DONE` |
| **G-174** | **일본 모바일·익명·지원 채널 준비** | P1 | 일본 사용자는 모바일 퍼스트·匿名 커뮤니티·X/LINE/메일 문의 기대가 큰데 Discord 중심 | `FeedbackChannel.md` Japan Support Readiness 추가 — X DM·LINE·메일폼·일본어 템플릿 | `DONE` |
| **G-175** | **사용자 조작 가능한 신뢰·안전 UI** | P0 | 신고·차단·appeal 정책은 있으나 버튼 위치·사유 선택·차단 목록·계정 제재 appeal UI가 약함 | `MODERATION-OPS.md` User Safety Controls 추가 — report/block/account appeal/recording consent UI 플로우 | `DONE` |
| **G-176** | **데이터 투명성 인디케이터** | P1 | 개인정보 문서는 있으나 fal.ai 전송·웹캠/마이크 녹화 여부·데이터 저장 위치가 UI에서 보이지 않음 | `MODERATION-OPS.md` Data Transparency UI 추가 — AI 전송 확인·not recording 배지·저장 위치 요약 | `DONE` |
| **G-177** | **크레딧·결제 소비 통제 UX** | P1 | 비용 구조가 VGEN에 쏠려 있는데 일일/방별/1회 한도, 환불/사용내역/무료체험 종료 UX가 부족 | `COST-ESTIMATE.md` Credit Control UX 추가 — 한도·사용내역·환불/폐기 정책·결제 실패 복구 | `DONE` |
| **G-178** | **제품 분석 이벤트·퍼널·코호트 설계** | P1 | MonitoringDashboard는 운영 지표 중심. 온보딩/GreenRoom/VGEN/초대/리텐션 분석 이벤트가 없음 | `MonitoringDashboard.md` Product Analytics Layer 추가 — 이벤트 스키마·퍼널·코호트·invite attribution | `DONE` |
| **G-179** | **일본/APAC 리전·레이턴시 준비** | P1 | LiveKit/Supabase 리전과 일본 사용자 WebRTC 품질 검증 기준이 문서에 없음 | `MonitoringDashboard.md` APAC Launch Quality Gate 추가 — 지역별 WebRTC/MediaPipe/VGEN 성공률 체크 | `DONE` |

### 13차 분석 — 브라우저 방송/원격 게스트 UX 벤치마크 (G-180~G-183)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-180** | **15초 초대 링크 직입 플로우** | P0 | 초대 링크는 있으나 VDo.Ninja식 "URL 하나로 바로 붙는" 체감이 약함 | `ONBOARDING-FLOW.md` Track A Quick Ready + `LobbyPage.md` InviteMessageTemplate 준비물/모바일 안내 강화 | `DONE` |
| **G-181** | **호스트 Stage Manager Overlay** | P1 | HostConsole 기능은 많지만 StreamYard식 전체 무대 상태 대시보드가 부족 | `FEATURE-SPEC.md HOST-12` + `contracts/HostConsole.md` Stage Manager Overlay 추가 | `DONE` |
| **G-182** | **로컬 백업 녹화 + 복구 업로드** | P1 | ROOM-13/DUB-04 녹화가 브라우저 충돌·네트워크 단절 시 유실될 수 있음 | `FEATURE-SPEC.md ROOM-23` + `DubRecorder.md` local backup chunks + `API-SURFACE.md` chunk upload endpoints + `DATA-SCHEMA.md` manifest 컬럼 | `DONE` |
| **G-183** | **항상 켜진 Watch-only 데모 룸** | P0 | 랜딩→Tally만 이어져 "지금 체험"이 약함. LOB-07은 있지만 운영 방식이 불명확 | `FEATURE-SPEC.md LOB-09` + `LobbyPage.md` AlwaysOnDemoRoom 추가 — 녹화 루프/시스템 채팅/30초 anonymous viewer | `DONE` |

### 14차 분석 — 사용자 감정·불안 기반 UX 갭 (G-184~G-190)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-184** | **혼자 시작 방지 연습 방 / AI 파트너** | P1 | LOB-07/09는 관전 데모 중심. 사용자가 방을 만들었는데 친구가 없으면 "서비스가 비어 있다"는 감정이 남음 | `FEATURE-SPEC.md LOB-10` + `SEED-DATA.md` 예정 — 공개 연습 방 1개 이상, AI/스태프/녹화 루프 파트너, 매칭 대기 social proof | `LATER` |
| **G-185** | **리허설 피드백 루프** | P1 | ROOM-14는 역할/모드 토글 중심. 사용자가 "내 연기가 잘 들렸나/타이밍이 맞았나"를 확인하는 개인 피드백이 약함 | `FEATURE-SPEC.md ROOM-24` + `contracts/RoomView.md` 예정 — 10초 다시듣기, 대사 겹침, 내 차례 타이밍, 리액션 하이라이트 | `LATER` |
| **G-186** | **트래킹 품질 게이지 + 표정 리플레이** | P1 | GreenRoom은 8동작 테스트와 FinalPreviewCard가 있으나 "이 정도면 충분한가"라는 품질 판정이 시각화되지 않음 | `FEATURE-SPEC.md MOD-07` + `contracts/GreenRoom.md` 예정 — 얼굴 인식/조명/표정 매핑 신뢰도, 1초 지연 표정 리플레이 | `LATER` |
| **G-187** | **호스트 이탈/재접속 승계 UX** | P1 | HOST-06/HostAuthority는 권한 위임을 다루지만, 방장이 튕긴 순간 참가자가 보는 토스트·임시 호스트·복귀 복원 UX가 부족 | `FEATURE-SPEC.md HOST-13` + `state-machines/HostAuthority.md` 예정 — 30초 임시 호스트, 자동 승계, 호스트 복귀 시 권한 복원 | `LATER` |
| **G-188** | **시드 대본 팩 5~10개** | P1 | CNT-08 첫 방 템플릿은 있으나 "무슨 대본으로 하지?"를 바로 해결할 최소 콘텐츠 세트가 구체화되지 않음 | `FEATURE-SPEC.md CNT-09` + `SEED-DATA.md` 예정 — 1인/2인/4~6인 대본, 난이도/시간/인원 태그, seed SQL | `LATER` |
| **G-189** | **방송용 클린 모드 + OBS 이전 가이드** | P1 | OBS-01~03은 P2 토큰 출력 모드. 그 전까지 VTuber/스트리머가 바로 방송 캡처하는 경로가 비어 있음 | `FEATURE-SPEC.md OBS-04` + `docs/contracts/OBSViewer.md` 예정 — 전체화면 클린 무대, UI 크롬 숨김, 브라우저 캡처 권장 해상도 | `LATER` |
| **G-190** | **작품함 검색·태그 Feature ID 실제 등록** | P2 | G-162가 VGEN-13을 해결 방향으로 언급했지만 FEATURE-SPEC에 ID가 빠져 추적이 끊겨 있었음 | FEATURE-SPEC.md line 118 VGEN-13 등록 확인 완료 — `★ VGEN-13 작품 라이브러리 검색·태그` P2 | `DONE` |

### 15차 분석 — 경쟁사 성장·수익화 표면 보강 (G-191~G-194)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-191** | **극단/크루/Creator Club** | P2 | Rec Room식 creator events/clubs처럼 창작자 조직 표면이 필요하지만 현재 방/프로필 단위에 머묾 | FEATURE-SPEC.md `COM-01` 등록 — 극단/크루 프로필, 멤버 역할, 공유 대본·씬·템플릿 묶음. DB/API는 P2 구현 직전 승격 | `DONE` |
| **G-192** | **공식 이벤트/컨테스트** | P2 | 방 예약과 작품함은 있으나 운영자가 시즌/주제/심사 기준을 열고 제출을 받는 성장 루프가 없음 | FEATURE-SPEC.md `COM-02` 등록 — 공식 이벤트/컨테스트, 공연/클립 제출, 심사/수상/홍보 루프 | `DONE` |
| **G-193** | **창작자용 공연 분석 대시보드** | P1 | MonitoringDashboard는 운영 지표 중심. Stage TEN식 live/replay analytics처럼 방장·극단이 볼 관객/리액션/클립 성과 대시보드가 없음 | FEATURE-SPEC.md `ANA-01` 등록 + MonitoringDashboard.md creator-facing metrics 추가 | `DONE` |
| **G-194** | **Twitch/YouTube 외부 방송 트리거** | P2 | 내부 채팅/리액션은 강하지만 VTube Studio/Animaze식 외부 subscribe/chat/redeem/raid → avatar/action 트리거가 없음 | FEATURE-SPEC.md `EXT-01` 등록 — OAuth/webhook allowlist, safe action mapping, no raw external payload execution | `DONE` |

### 16차 분석 — 친구/일본화/환불정책/네트워크 표시 (G-195~G-203)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-195** | **친구/팔로우 시스템** | P1 | 초대는 URL/코드 중심. 방장이 팔로우한 사용자·친구 온라인 상태·차단 등의 사회 그래프가 약함 | `FEATURE-SPEC.md PROFILE-04/05` 등록 + `contracts/FriendSystem.md` 신규 작성 — friendships 테이블(from_user_id·to_user_id·relation_type='follow'\|'friend'\|'block'), 친구 추가 UI, 팔로우 알림, RLS 정책 | `DONE` |
| **G-196** | **JPY 통화 표시 + 자동 환율** | P1 | 크레딧 표시는 KRW 기준. 일본 사용자가 JPY로 보고 결제하려면 환율 변환 자동화가 필수 | `FEATURE-SPEC.md JAPAN-01` 등록 — 한국(KRW)/일본(JPY) 자동 감지, 크레딧 표시 시 환율 API 적용, 결제 통화 선택, 실시간 환율 캐시 전략 | `DONE` |
| **G-197** | **일본 결제 수단** | P1 | Stripe 기본은 카드 중심. 일본은 편의점 결제(Rakuten Pay, au PAY), 휴대폰 결제 기대 | `FEATURE-SPEC.md JAPAN-02` 등록 — Stripe Billing Portal에서 일본 locale, 현지 결제 provider 옵션 추가, 결제 실패·환전 정책 일본어 명시 | `DONE` |
| **G-198** | **강화된 연령확인(일본 법규)** | P1 | SEC-05는 한국 기준. 일본 미성년자(15세 이상/미만) 동의·보호자 인증 경로가 별도 필요 | `FEATURE-SPEC.md JAPAN-03` 등록 — 15세 구간 별도 동의, 보호자 이메일 인증, 월별 재인증, 법무 체크리스트 추가 | `DONE` |
| **G-199** | **자동 환불 정책** | P1 | VGEN/DUB 생성 실패 시 크레딧 복구가 정책 문서와 구현 절차가 분리되어 있음 | `FEATURE-SPEC.md INF-08` 격상(자동 환불 명시) + `specs/RefundPolicy.md` 신규 작성 — 실패 트리거 3가지(fal.ai 5xx·timeout·Whisper STT 거절), 자동 복구 Edge Function, 분쟁신청 48시간, 월별 환불 리포트 | `DONE` |
| **G-200** | **네트워크 상태 표시 UX** | P1 | ROOM-25는 정의되었으나 우상단 인디케이터 구현·색상·정보 수준이 구체화되지 않음 | `FEATURE-SPEC.md ROOM-25` 격상(기존 P1) + `contracts/NetworkStatusIndicator.md` 신규 작성 — 3단계(좋음/보통/나쁨), RTT/packet loss 측정, 재연결 중 깜박임, hover tooltip(ms/%), 우상단 6px 원형 고정 | `DONE` |
| **G-201** | **비인증 게스트 연령 확인 게이트** | P1 | LOB-07/09 익명 demo room은 30초 체험. 콘텐츠가 15세+ 중심일 경우 비인증 게스트도 연령 확인 필수 | SEC-05에서 games/VGEN/DUB는 인증자만→LOB-07/09 데모룸도 연령 확인 추가. 모달: "만 14세 이상 확인" 체크박스 1개, localStorage 저장, 매 방문 재확인 | `DONE` |
| **G-202** | **연령대별 콘텐츠 태깅** | P1 | 모더레이션이 프롬프트/프레임 검사만 있고, 이미 생성·업로드된 작품의 연령 구간이 없음 | DATA-SCHEMA.md vgen_jobs·recordings·dub_sessions에 `age_rating TEXT` 컬럼 추가 (all|12+|15+|18+ enum), CNT-07 작품함 필터에 연령 필터 추가 | `DONE` |
| **G-203** | **연령층별 크레딧 한도/요금** | P2 | 미성년자 과소비 방지가 아직 정책으로만 있고, 구현 코드경로가 정의되지 않음 | 추후 결정. 현재는 JAPAN-03 법무 체크리스트에 "연령층별 월 한도" 포함 | `LATER` |

### 17차 분석 — 온보딩·씬 이벤트 Feature ID 보강 (G-204~G-209)

| 항목 | 설명 | P | 현황 / 근거 | 해결 방향 | 상태 |
|---|---|---|---|---|---|
| **G-204** | **시네마틱 인트로 Feature ID** | P0 | ONBOARDING-FLOW.md §Step 1에 "시네마틱 인트로" 명시되었으나 Feature ID가 없어 추적 불가 | `FEATURE-SPEC.md ONBOARDING-01` 신규 등록 — 15~20초 플랫폼 컨셉 영상, public/onboarding/intro.mp4, 스킵 가능, onboarding_step='intro' 기록 | `DONE` |
| **G-205** | **장르 취향 선택 Feature ID** | P0 | ONBOARDING-FLOW.md §Step 2에 "장르 선택" 명시·users.preferred_genres 컬럼 정의되었으나 Feature ID 부재 | `FEATURE-SPEC.md ONBOARDING-02` 신규 등록 — 6개 장르 최대 3개 선택, 나중에 선택 버튼, 로비 필터·정렬 반영 | `DONE` |
| **G-206** | **테스트/개발용 온보딩 스킵 플래그** | P1 | 개발 중 매번 온보딩을 거쳐야 해 반복 테스트 비용 증가 | `FEATURE-SPEC.md ONBOARDING-03` 신규 등록 — localStorage `SKIP_ONBOARDING=true` 또는 `VITE_SKIP_ONBOARDING=true` 환경변수, onboarding_step='done'으로 자동 설정 | `DONE` |
| **G-207** | **씬 대화형 레이어 — 클릭/호버 상호작용** | P1 | PLATFORM-REFERENCE-GAP-MAP.md §1 "씬이 아직 배경 이미지"라고 지적. contracts/SceneBackground.md가 `sound_trigger`·`hover`를 정의했으나 FEATURE-SPEC ID 부재 | `FEATURE-SPEC.md ROOM-26` 신규 등록 — 배경 아래 PNG 레이어 파츠 클릭/호버 감지, Pixi 스프라이트, 파티클·사운드 트리거 이벤트, 모닥불/전광판/스포트라이트 예시 | `DONE` |
| **G-208** | **앰비언트 사운드 온/오프** | P1 | SceneBackground.md에서 `ambient_sound_id`가 언급되었으나 UI 통제 또는 ON/OFF 정책이 FEATURE-SPEC에 없음 | `FEATURE-SPEC.md ROOM-27` 신규 등록 — 숲/비/도시 소음, 호스트만 통제, 기본값 OFF 또는 낮은 볼륨(20%), AudioMixer 레벨 조절 | `DONE` |
| **G-209** | **씬 레이어 사운드 매핑** | P1 | 레이어별 효과음(fire_crackle 등)이 설계는 있으나 데이터 구조가 ROOM-26과 분리 | DATA-SCHEMA.md scenes.layers_json에 `sound_trigger TEXT` 필드 추가(파일경로 또는 사운드ID), 사운드 라이브러리와 foreign key 검증 | `DONE` |

### 18차 분석 — 상태머신·컴포넌트·운영 회복탄력성 (G-210~G-246)

| **G-ID** | **항목** | **우선** | **근거/산출문서** | **상태** |
|---|---|---|---|---|
| **G-210** | **HostAuthority TRANSFERRING 상태 다이어그램/표 반영** | P1 | state-machines/HostAuthority.md에 정의되었으나 시각 다이어그램 미반영 | `DONE` |
| **G-211** | **WebRTC ICE_TIMEOUT 상태 다이어그램 반영** | P1 | state-machines/WebRTC.md §ICE_TIMEOUT 상태 텍스트 정의만 존재·전이 다이어그램 미반영 | `DONE` |
| **G-212** | **WebRTC CODEC_FAILED/NEGOTIATING/CONNECTED_AUDIO_ONLY 다이어그램 반영** | P1 | state-machines/WebRTC.md §3 3개 상태 표로만 명시·Mermaid 그래프 없음 | `DONE` |
| **G-213** | **Avatar MEMORY_ERROR 전이표 추가** | P1 | state-machines/Avatar.md 엣지케이스 목록 §Edge Case 4 메모리부족 있으나 정식 상태 테이블 행 누락 | `DONE` |
| **G-214** | **Avatar RENDERING→UNLOADED 전이표 추가** | P1 | state-machines/Avatar.md RENDERING 상태에서 UNLOADED 전이 가능하나 매트릭스에 명시 없음 | `DONE` |
| **G-215** | **Participant CONNECTED↔ACTIVE 모순 해소** | P1 | state-machines/Participant.md CONNECTED·ACTIVE 상태 정의 중복·조건 불명확 | `DONE` |
| **G-216** | **Participant 카메라만 허용시 상태 정의** | P1 | state-machines/Participant.md 오디오 비활성화 시나리오 누락·camera_only_state 정의 필요 | `DONE` |
| **G-217** | **Participant 늦참 슬롯협상 상태 명확화** | P1 | state-machines/Participant.md 늦참 입장 프로토콜 있으나 슬롯 배정 중 상태 정의 미흡 | `DONE` |
| **G-218** | **Room+Participant epoch 레이스 방지(stale 요청 드롭)** | P1 | state-machines/Room.md·Participant.md authority_epoch 증가 정의·stale 요청 드롭 시나리오 누락 | `DONE` |
| **G-219** | **Onboarding vs Participant 뷰어 진입경로 명확화** | P1 | state-machines/Onboarding.md·Participant.md viewer/voice_only 게이트 중복 정의·우선순위 불명확 | `DONE` |
| **G-220** | **Participant vs DATA-SCHEMA state/role 개념 구분** | P1 | state-machines/Participant.md state 컬럼과 DATA-SCHEMA.md room_participants.role 컬럼 개념 혼재 | `DONE` |
| **G-221** | **StageMode 복귀경로(* → NORMAL) 추가** | P1 | state-machines/StageMode.md KEYNOTE/SPOTLIGHT/SPOTLIGHT_DUO 상태→NORMAL 복귀 조건 명시 필요 | `DONE` |
| **G-222** | **Script cue_advance 순서규칙 명시** | P1 | state-machines/Script.md cue_advance 메커니즘 정의·중복 진행(race condition) 방지 규칙 누락 | `DONE` |
| **G-223** | **Script vs HostAuthority 동시편집 충돌규칙 교차참조** | P1 | state-machines/Script.md·HostAuthority.md 동시 수정 시 우선순위(LWW vs 호스트 override) 명시 필요 | `DONE` |
| **G-224** | **Avatar vs AvatarCanvas webglcontextlost 서술 일치** | P1 | state-machines/Avatar.md 엣지케이스·contracts/AvatarCanvas.md webglcontextlost 처리 서술 이원화 | `DONE` |
| **G-225** | **Tracking vs Avatar PAUSED 시 프레임 고정 명시** | P1 | state-machines/Tracking.md·Avatar.md PAUSED 상태 시 프레임 업데이트 중지 메커니즘 불명확 | `DONE` |
| **G-226** | **WebRTC TURN 재정렬버퍼 담당계층 명확화** | P1 | state-machines/WebRTC.md TURN 서버 선택·재시도 로직·버퍼 관리 계층(browser vs app) 불명확 | `DONE` |
| **G-227** | **HelpPanel 12섹션 콘텐츠** | P2 | contracts/HelpPanel.md 구조 정의·실제 12개 섹션(VGEN·DUB·트래킹·채팅·역할·대본·반응·설정·법·크레딧·피드백·단축키) 콘텐츠 작성은 Phase 2 이후 별도 진행 | `LATER` |
| **G-228** | **DubRecorder 전체재촬영 상태전이(전원 assigned 리셋) 정의** | P1 | contracts/DubRecorder.md 재촬영 시 모든 참가자 track_assigned→false 리셋 로직 명시 필요 | `DONE` |
| **G-229** | **DubSessionSelector 모더레이션 threshold 구체화** | P1 | contracts/DubSessionSelector.md Whisper 신뢰도(confidence) 임계값·언어 감지 오류 처리 규칙 추가 필요 | `DONE` |
| **G-230** | **VgenPanel 프롬프트 최대 2000자 제한** | P1 | contracts/VgenPanel.md §VgenPromptPanel 입력 검증·maxLength=2000 명시 + character count UI 추가 필요 | `DONE` |
| **G-231** | **GreenRoom 늦참 진입 준비상태 동기화** | P1 | contracts/GreenRoom.md 늦참 사용자 is_ready 기본값·동기화 타이밍(join 즉시 vs 카메라켐) 정책 불명확 | `DONE` |
| **G-232** | **MainViewComponent signed URL 재발급 UX** | P1 | contracts/MainViewComponent.md signed URL 만료 시 자동 재발급·UX(토스트·자동 갱신 vs 클릭) 정책 추가 필요 | `DONE` |
| **G-233** | **MobileViewer 반응 분당 rate limit** | P1 | contracts/MobileViewer.md 반응(reaction) 전송 rate limit(예: 분당 5개) 명시 + 초과 시 안내 메시지 필요 | `DONE` |
| **G-234** | **OBSViewer 토큰발급 플로우 명시** | P1 | contracts/OBSViewer.md obs_viewer_token 생성·검증·만료(기본값·갱신정책) 상세화 + Edge Function 링크 필요 | `DONE` |
| **G-235** | **VgenExport 변환실패 UX** | P1 | contracts/VgenExport.md 9:16 변환 실패(ffmpeg.wasm 오류) 시 UX(재시도·원본 다운로드·오류메시지) 정의 추가 필요 | `DONE` |
| **G-236** | **ErrorBoundary 에스컬레이션 사용자경험 표** | P1 | contracts/ErrorBoundary.md 5단계 경계 배치 정의·각 단계 사용자 안내문·복구 경로(리로드·호스트연락·버그리포트) 명확화 필요 | `DONE` |
| **G-237** | **DEPLOY 배포 롤백 절차 신설** | P1 | DEPLOY.md 배포 후 긴급 롤백 절차(git revert·이전 배포 이미지 재활성화·RTO·검증 단계) 신설 필요 | `DONE` |
| **G-238** | **DEPLOY-PLATFORM 배포후 검증 자동화 방향 명시** | P1 | DEPLOY-PLATFORM.md Cloudflare Pages 배포 후 자동 헬스체크(ping·E2E 스모크테스트) 실행 정책·alert 규칙 명시 필요 | `DONE` |
| **G-239** | **MigrationStrategy 배치실패 복구절차** | P1 | specs/MigrationStrategy.md 대량 마이그레이션 중 일부 행 실패 시 rollback·재시도·부분 성공 정책 상세화 필요 | `DONE` |
| **G-240** | **MigrationStrategy rollback SQL 리뷰체크리스트화** | P1 | specs/MigrationStrategy.md DOWN 마이그레이션 작성 시 체크리스트(외래키 삭제·인덱스·RLS·테스트) 추가 필요 | `DONE` |
| **G-241** | **SentryConfig 소스맵 업로드 실패감지 절차** | P1 | specs/SentryConfig.md 배포 시 소스맵 업로드 실패 감지·재시도·폴백(미니파이 코드 추적) 절차 명시 필요 | `DONE` |
| **G-242** | **COST-ESTIMATE 일별 비용급증 알림** | P1 | specs/COST-ESTIMATE.md pg_cron 일일 비용 집계·임계값(어제 대비 +30% 등) 초과 시 Sentry Alert 규칙 추가 필요 | `DONE` |
| **G-243** | **PLATFORM-ARCHITECTURE 환경변수 사전검증 프로세스** | P1 | specs/PLATFORM-ARCHITECTURE.md §Env 배포 전 필수 환경변수 존재·타입·값 검증 자동화(스크립트·.env 파서·CI 게이트) 정책 추가 필요 | `DONE` |
| **G-244** | **TestStrategy E2E 배포후 재실행+alert** | P1 | specs/TestStrategy.md 본공연·배포 후 자동 E2E 재실행(5분 delay·5회 재시도·실패 시 Sentry+Discord alert) 플로우 명시 필요 | `DONE` |
| **G-245** | **TestStrategy 동시성 lock timeout 테스트케이스** | P1 | specs/TestStrategy.md DATABASE 동시성 트래픽 시뮬레이션(200 concurrent·30초)·FOR UPDATE timeout 감지 테스트케이스 추가 필요 | `DONE` |
| **G-246** | **VITE-CONFIG 번들크기 수동확인 절차** | P1 | docs/specs/VITE-CONFIG.md rollup-plugin-visualizer 결과 수동 검증 정책(빌드 후 .html 확인·200KB gzip 초과 경고·목표 설정) 추가 필요 | `DONE` |

### 19차 분석 — 홍보·그로스 준비도 (G-247~G-259)

| **G-ID** | **항목** | **우선** | **근거/산출문서** | **상태** |
|---|---|---|---|---|
| **G-247** | **GO-TO-MARKET 문서 부재** | P1 | 사전등록→채널 전환 계획 없음. `docs/GO-TO-MARKET.md` 신규 작성 (채널전략·세그먼트·예산틀) | `DONE` |
| **G-248** | **MILESTONES 홍보/그로스 Phase 없음** | P1 | 제품 가시성 확대 Phase 누락. `MILESTONES.md` Phase 5 추가 | `DONE` |
| **G-249** | **랜딩 카피-구현상태 검증 게이트 없음** | P1 | 웹사이트 카피와 실제 기능 미매칭 위험. `CONTENT-GUIDE.md` 카피 검증 규칙 섹션 추가 | `DONE` |
| **G-250** | **일본 마케팅 규제(경품표시법) 체크리스트 없음** | P1 | APAC 규제 미준수 법적 위험. `CONTENT-GUIDE.md` 일본 카피 검수 체크리스트 추가 | `DONE` |
| **G-251** | **SNS 공유 OG이미지(G-75) 우선순위 재검토** | P1 | 바이럴 루프 핵심 채널 미완. 기존 G-75 행에 재확인 메모 추가(이 클러스터가 직접 함) | `DONE` |
| **G-252** | **AI 생성 콘텐츠 공개배포 고지 의무 없음** | P1 | 법적 공시 누락. `legal/TERMS-OF-SERVICE.md` 고지 조항 추가 | `DONE` |
| **G-253** | **이차창작(二次創作) 정책 미완성** | P1 | G-173 TODO 실행 필요. `legal/FANART-POLICY.md` 신규 | `DONE` |
| **G-254** | **홍보 스파이크 CS 확장 계획 없음** | P1 | 대량 신규 사용자 대응 불가. `SUPPORT-PLAYBOOK.md` § 홍보 이벤트 CS 모드 추가 | `DONE` |
| **G-255** | **이벤트/컨테스트(G-192) 운영 계획 미정** | P2 | 주기·심사기준 미정. 운영 주체 확정 후 착수 | `LATER` |
| **G-256** | **초대 캠페인 추적(campaign_id) 없음** | P2 | 성장 분석 불가. room_invites 스키마 확장은 Phase 2 이후 | `LATER` |
| **G-257** | **인플루언서 협업 고지/계약 가이드 없음** | P2 | 협찬 스팸 시 법적 책임. `MODERATION-OPS.md`에 협찬표시 서브섹션 추가(담당자 미정) | `LATER` |
| **G-258** | **일본 APPI 담당자·기한 미명시** | P2 | 법무 SSOT 부재. `PITCH-READINESS.md` 담당자표 추가(담당자 배정 대기) | `LATER` |
| **G-259** | **카피-스펙 추적 필드(specId) 없음** | P2 | 콘텐츠 검증 불가. content.ts 스키마 확장은 실제 코딩 착수 후 | `LATER` |

### 20차 분석 — UX 디테일 보강 (G-260~G-267)

> gap-find 5라운드: 4역할 병렬 Find(콜드스타트/세션중 상호작용/실패카피/복귀·리텐션) → 직접검증(자체분류 P0 5건 전부 다운그레이드·기각 — HelpPanel 콘텐츠 부재는 이미 G-227로 추적 중인 의도된 범위제한, 초대역할선택은 원문 대조 결과 과대판정으로 기각) → 4클러스터 Opus 병렬 Fix.

| **G-ID** | **항목** | **우선** | **근거/산출문서** | **상태** |
|---|---|---|---|---|
| **G-260** | **호스트 조치(뮤트·경고·강퇴) 후 참가자 실시간 피드백 부재** | P1 | `HostConsole.md` ParticipantSafetyLadder(G-167) 확장 — 뮤트 카운트다운 배지·경고 토스트·강퇴 broadcast 문구 + `ParticipantSlot.md` 카운트다운/unmount 반영 | `DONE` |
| **G-261** | **호스트 모드전환(normal/vgen/dub) broadcast 부재** | P2 | `HostConsole.md`/`RoomView.md` stageStore.mode 변경 시 room-authority broadcast + 전체 배너 | `DONE` |
| **G-262** | **모바일 관객 반응 전송 즉시 피드백 부재** | P1 | `MobileViewer.md` AudienceReactionToolbar(G-168) 확장 — 펄스 애니메이션·전송 토스트·rate limit 경고 | `DONE` |
| **G-263** | **에러 메시지 기술용어 노출 + 재시도 한계·분류 불명확** | P1 | `ErrorBoundary.md` 에러코드 매핑표 + `state-machines/WebRTC.md` ICE 재시도 한계·FAILED 사유별 분류 + `VgenPanel.md` 서버오류 세분화·반복거절 경고 | `DONE` |
| **G-264** | **NetworkStatusIndicator 상태별 조언 문구 부재** | P2 | `NetworkStatusIndicator.md` 초록/노랑/빨강 hover 조언 문구 | `DONE` |
| **G-265** | **콜드스타트 UX 디테일(마이크실패·배경기본값·매칭대기) 미상세** | P1 | `GreenRoom.md` Step2 마이크 실패 복구경로 + Step4 배경 기본값 + `ONBOARDING-FLOW.md` Step3 매칭 대기 카운트다운·실패유형별 복구 | `DONE` |
| **G-266** | **친구·크리에이터 알림 트리거 스펙 부재 + CTA 불명확** | P1 | `FriendSystem.md` L75 스텁 → `friend_joined`/`followed_creator_stream_start` 트리거 확정 + `SettingsPage.md` 필드 추가 + `LobbyPage.md` 초대수락 알림 + 크레딧부족 CTA 명시 | `DONE` |
| **G-267** | **리텐션 UX(재방문 연결·온보딩후 가이드·성취시각화) 부재** | P1 | `LobbyPage.md` PastRoomsSection CTA + 신규유저 배너 + `ProfilePage.md` §활동 요약(G-79 해소) | `DONE` |

### 21차 분석 — 착수 전 향후취약점·미리설계 seam 리뷰 (G-268~G-279)

> 방법: Haiku 8병렬 스캔(섹션별 미래리스크 씨앗) → Fable 4클러스터 리뷰 → Opus 충돌검증(원본직접) + Haiku 4 외부조사. 상세·출처는 [[FORWARD-REVIEW-2026-07]].
> **COVERED / 중복 아님(확인함):** G-152(계정삭제·내보내기) UI계약 DONE·백엔드는 Phase1 구현 항목 | G-135(마이그레이션 3단계) DONE·강제는 G-137 DoD 범위 | token_version 3중방어 `SecurityPolicies §8.2·8.6` 기존 커버.
> **우선순위 재검토 권고(주인님 판단):** i18n(G-17 LATER)·API버저닝(G-136 LATER)·rate-limit 저장소는 외부조사상 "지금이 저렴" 신호 있으나 단일 1st-party 클라 단계에선 defer 방어 가능.
> **오탐 기각:** rig-format §7 ↔ VGEN 출력 충돌 → `STACK-COMPARE-VIDEOGEN.md:108`이 단일 WebGL 캔버스 텍스처 합성으로 이미 정합. 조치 없음.

| **G-ID** | **항목** | **우선** | **근거/산출문서** | **상태** |
|---|---|---|---|---|
| **G-268** | **VGEN provider 어댑터 인터페이스 + 모델·단가 app_config 외부화** ⭐ | P1 | `VideoGenProvider` 추상화 + `app_config.VGEN_MODELS`(단가·최대길이). Seedance 2.5 단가 미발표·소송 리스크 대비 무배포 스왑. 근거 [[FORWARD-REVIEW-2026-07]] §2·§4.1 | `RESEARCH` |
| **G-269** | **STT provider 추상화 (Whisper→diarization 지원 provider)** | P1 | whisper-1 diarization 미지원 확인. **최저가(2026-07 조사)**: Groq whisper-large-v3-turbo(**$0.00067/분·현 Whisper 대비 9×↓·고속**, diarization 없음→화자수동배정 유지·분리 별도). **저비용 최소전환**: `gpt-4o-transcribe-diarize`(동일 OpenAI 키·diarization 내장·segment 타임스탬프면 충분). **대용량/async**: AssemblyAI(webhook·화자분리 포함) 또는 Deepgram Nova-3(한국어 강점). word-level 타임스탬프는 사람 재녹음이라 불필요. 근거 [[dub-stt-provider-decision]]·`COST-ESTIMATE.md` 현행 as-built 섹션·`DubSession.md` | `DRAFT` |
| **G-270** | **크레딧/구독 가격 지속가능성 재설계** | P0 | $9.99/100cr가 원가 하회, fal.ai 비용 지배. 단일 벤더 스왑(30~50%)으론 손익분기 불가 → 가격+어댑터 병행. `COST-ESTIMATE.md`·`specs/VgenCostAnalysis.md` | `RESEARCH` |
| **G-271** | **idempotency_key 단일 공식 통일** | P1 | 메시지·VGEN 포맷 산재 → 이중 차감/환불. `SHA256(entity+user+action+floor(ts/10000))` 전 mutable API. `DATA-SCHEMA.md §1.6·1.8` | `RESEARCH` |
| **G-272** | **크레딧 남용 카운터 + 환불 남용 임계값** | P1 | 120초 timeout·10초 버킷 우회 → 조직적 환불 루프. refund/generation count 컬럼 + `VGEN_REFUND_ABUSE_THRESHOLD`. `specs/RefundPolicy.md` | `RESEARCH` |
| **G-273** | **모더레이션 카테고리 공유 enum SSOT 통일** | P1 | `vgen_jobs.flagged_categories TEXT[]`(제약없음)·유저신고 category·CommunityGuidelines 3곳 드리프트 → 필터/통계 붕괴. `CommunityGuidelines.md`를 SSOT로 참조 통일 + DoD 체크 | `RESEARCH` |
| **G-274** | **GDPR 공동저작물 삭제 처리 명세** | P1 | Art.17 "1인 요청=전체 삭제" 아님(외부조사). FK cascade에서 공동저작물은 **user_id만 제거·영상 보존**, 익명화 경로. `legal/UGC-OWNERSHIP.md`·`legal/DATA-EXPORT.md` | `RESEARCH` |
| **G-275** | **일본 미성년(16세미만) 보호자 동의 — APPI 2026-04 법적 의무** | P0 | 이메일 인증만으론 위법(본인+보호자 인증 필요). `users.parental_consent_status`+`parental_consent_tokens` seam + 일본 법무 자문. `contracts/AgeGate.md`·G-258 연계 | `RESEARCH` |
| **G-276** | **Phase 1 PoC 게이트 — MediaPipe SAB fps + 저사양 6인 렌더 실측** | P0 | L1 교차격리 켜면 서드파티 로드 차단 위험·L4 저사양 WebGL 손실. PoC fps 실측이 아키텍처 확정 게이트. `PLATFORM-SECURITY-RISKS-B.md §2.2` | `RESEARCH` |
| **G-277** | **런타임 구현 스펙 상세화 — blendshape 재정렬 버퍼 + 메모리 완화 정책** | P1 | TURN 폴백 seq 역전 버퍼·메모리 부족 해상도 감소 로직이 규칙만 있고 세부 미정. `state-machines/WebRTC.md §6`·`Avatar.md §6`·`RUNTIME-HARDENING-REVIEW.md` H7/H10 | `RESEARCH` |
| **G-278** | **확장 버전 필드 seam (format_version·minClientVersion·epoch 토큰가드)** | P1 | blendshape `format_version`·rig.json `minClientVersion`·authority_epoch 토큰 metadata 가드 각 1~3줄. 없으면 프로토콜 재협상/재연결 강제. `specs/rig-format.md`·`state-machines/HostAuthority.md` | `RESEARCH` |
| **G-279** | **모더레이션 규모화·법적 면책 요건** | P1 | 자동필터 30~60% 누락·"AI 사용"은 정보통신망법상 비면책. 감사로그+이의제기 기록(면책요건) + 외주 계획(DAU 500~1,000, 필리핀 $400~600/인). `MODERATION-OPS.md`·`PRODUCT-READINESS.md` | `RESEARCH` |
| **G-280** | **더빙 음원분리 (원본 대사 제거 → 배경음/효과음 stem)** | P1 | 합성이 "원본 영상+더빙"만이라 애니 등 원 대사(일본어)와 더빙이 **이중음성**으로 깨짐. 합성 전 음원분리 필요 — fal.ai Demucs(시작·~$0.04/분·스택內)→AudioShake(대사특화 승급). Edge 불가·외부 API. **STT는 분리 불필요(원본 믹스로 동작·실증)** — 분리는 출력 전용. 근거 [[dub-audio-separation-anime]]·`DubCompositor.md`. **구현(3b, 2026-07-03)**: `separate-dub-audio`(fal `fal-ai/demucs`·호스트·비보컬 5스템 URL)→`mixAndMux` 배경 amix. fal 실증(mp4 수용·분리품질·$0.0007/s)·실 ffmpeg 합성 실증·게이트/deno PASS. **프로덕션 배포·풀 클릭스루 완료**(배포판 실브라우저 [합성]→분리→wasm→ffprobe 유효 mp4 5/5). | `DONE` |
| **G-281** | **더빙 대사 번역 (JP→KR 등)** | P2 | 애니 KR더빙 시 참가자가 무엇을 말할지 원문 번역 필요. STT segments → 번역(GPT/DeepL) 표시, 또는 "번역 안 함(팬섭 참조)" 결정 명시. 신규 단계 — 현재 파이프라인 부재. 근거 [[dub-audio-separation-anime]] | `RESEARCH` |
| **G-282** | **무대사 소스 STT/음원분리 스킵 분기** | P2 | 대사 없는 소스(무음·BGM·무대사 클립)는 STT/분리 불필요 → UPLOADED→READY 직행으로 비용 0. **결정 필요**: 대사유무 감지 방식(자동 no_speech_prob/VAD vs 호스트 [대사 없음] 토글). `state-machines/DubSession.md` Edge case 9 | `RESEARCH` |
| **G-283** | **DUB-04 녹음 하드닝 (청크/resume·로컬백업·calibration·Realtime·재촬영)** | P2 | 슬라이스2 MVP는 단일업로드·수동 새로고침. ROOM-23 IndexedDB 백업·청크/resume 업로드·calibration ±200ms·Realtime 자동갱신·전체 재촬영(reset-dub-session)·비프/자동차례 미구현. `contracts/DubRecorder.md` §4.1·§5·§6 | `RESEARCH` |
| **G-284** | **DUB-05 합성 하드닝 (3b 음원분리·3c 아바타·Realtime·공유·리셋)** | P2 | 슬라이스3a는 무분리 재더빙 MVP(원음 드롭·클라 ffmpeg.wasm st·동기 진행·CDN 코어). **3b 배경음 stem 합류(fal Demucs·G-280) 완료(2026-07-03)** — 배포 게이트. 미구현: 3c 아바타 오버레이 출력, Realtime 진행구독(dub_outputs UPDATE), 공유링크(generate-share-link), 오디오전용 소스 합성, loudness 정규화, 완료 후 새 더빙(closeSession/reset), pg_cron 보존 자동삭제, 코어 자가호스팅(오프라인), 스템 Storage 캐시(재합성 재과금 방지)·2-stem 대역폭↓. `contracts/DubCompositor.md` | `RESEARCH` |
| **G-285** | **아바타 유저 업로드/소유 (MOD-02)** | P1 | 현재 아바타는 큐레이션 프리셋 선택만(`avatars/manifest.json`). 유저가 자기 PNG→AUTORIG→mini_cubism export→개인 아바타를 못 만듦. 매니페스트→DB `avatars` 테이블 승급, 유저별 `avatars/<userId>/` 쓰기 RLS, 업로드 UI + rig 검증 필요. 관리자 배포 `scripts/deploy-avatar.mjs`·렌더검증 스킬 `avatar-deploy` 는 완비. `lib/avatars.ts`(fetchAvatarPresets·isValidAvatarUrl) | `RESEARCH` |
| **G-286** | **대본 텔레프롬프터 하드닝 (서버권한·DB·씬선택·sync-on-join)** | P1 | MVP는 seed 대본 1개·cue 진행 **클라 게이트만**(호스트=slot0)·ephemeral DataChannel. 미구현: 서버 권한(scripts 테이블 host-only UPDATE + Edge 검증·`authority_epoch`/seq 순서, `state-machines/Script.md`)·대본 업로드/라이브러리(CNT-02·CNT-09)·DB 저장(cues_json·current_cue_index)·씬 선택·역할 브로드캐스트·완전한 sync-on-join(현재 호스트 warm-up 재브로드캐스트만). `contracts/ScriptPanel.md` | `RESEARCH` |
| **G-287** | **무대 레이아웃 하드닝 (드래그·정밀좌표·균형배치·glow 연결선)** | P2 | 원형 무대 MVP는 개략 좌표(§6.1 정밀화 PENDING)·identity 정렬 좌석. 미구현: 드래그 순서 변경·정밀 좌표·아바타→센터 glow 연결선(별자리)·DB `slot_index` 기반 배정·희소 인원 균형배치(2명 top-heavy)·인원변동 spring 애니(motion)·remote 호스트 crown(host_id 클라 미노출)·센터 프레임 콘텐츠(공유 비디오/씬). `contracts/StageLayout.md`·`contracts/ParticipantSlot.md`·DESIGN-DIRECTION §6.1/§6.4 | `RESEARCH` |

---

## 진행 로그

| 날짜 | 항목 | 내용 |
|---|---|---|
| 2026-07-04 | **DUB 저장소 Supabase Storage→Cloudflare R2 통일 (egress $0)** | 다운로드가 본질인 더빙 결과물의 egress 지뢰를 봉쇄(Supabase Storage egress $0.09/GB → R2 $0). **드리프트 해소**: `COST-ESTIMATE`·`DATA-SCHEMA`(R2 Cascade·result_object_key)는 이미 R2 전제였는데 **구현만 Storage(`dub-assets`)였음** — 코드가 문서를 따라잡음. **헬퍼** `supabase/functions/_shared/r2.ts`(Deno Web Crypto **자체 SigV4** presign — esm.sh/npm 외부의존 0: 첫 배포서 esm.sh 522 CDN장애로 실패→자체구현 전환) + **Edge 8 배선**(업로드 3 `presignPut`·다운로드 4 `presignGet`·서버fetch 1 `r2Get`) + 프론트 `lib/dub.ts` `putToR2`. 인터페이스: 업로드 `{path,token}`→`{path,uploadUrl}`(클라 `fetch` PUT), 다운로드 `{url}` 동형(클라 무변경). **검증**: deno check 8·tsc0·lint·test30/30·build + **실 R2 왕복 E2E 9/9**(create-room→create-dub-upload→**R2 PUT 200**→create-dub-session→get-dub-source-url→**R2 GET 200**→바이트 46B 일치). 인프라: 버킷 `chatterbox-media`·`R2_*` Edge 시크릿(VITE 금지·성역). **Edge 8 프로덕션 배포 완료.** defer: 프론트 CF Pages 재배포(라이브 정합·`DUB_ENABLED=false`)·커밋·`dub-assets` 버킷 잔존(무해)·기존 Storage 데이터 미이관(테스트단계)·아바타 `avatars` 버킷은 Storage 유지(작은 public·egress 미미·스코프 밖). **Fable 5 교차리뷰 반영**: ①R2 버킷 CORS 설정(origins=`chatterbox-7r8.pages.dev`+`*.`+localhost·methods GET/PUT·headers content-type·maxAge 3600) — **node E2E가 못 잡은 브라우저 preflight 갭**, curl OPTIONS 검증(허용 204+ACAO·미허용 origin 403) ②`_shared/r2.ts` env 명시 throw(누락 시 undefined coerce 방지) ③`get-dub-recordings` 은폐 catch 제거(presignGet 로컬계산이라 부분 발급 누락 방지). Fable 10건 중 CORS(high)만 실질 blocker; Content-Type 미서명은 SigV4 query-auth 표준이라 오탐. |
| 2026-07-03 | **프론트 CF Pages 배포 + 3b 프로덕션 검증 + 배포판 E2E 14/14 + 스킬** | `separate-dub-audio` 프로덕션 배포(FAL_KEY 시크릿 기존)·라이브 통합 **5/5**(호스트200·비호스트403·허위404·CORS `v3b.fal.media` ACAO=`*`). **프론트 Vite SPA→Cloudflare Pages** 첫 배포(프로젝트 `chatterbox`·`chatterbox-7r8.pages.dev` unlisted·계정 gmdqn2tp). 함정 고정: 2계정 non-interactive→`CLOUDFLARE_ACCOUNT_ID` env·Pages설정 `account_id` 거부·`pages project create` 선행·`--commit-dirty`. **번들 비밀키 감사 통과**(서버키 0·anon만). **배포판 실렌더 E2E 14/14**: 헤드리스 React 마운트·콘솔0(9) — 미인증 로그인게이트·2탭 입장·상호 프레즌스·아바타 렌더·채팅 A→B·ffmpeg CDN·딥링크 폴백; **더빙 3b 풀 클릭스루 5** — 시드(recording·synced)→실브라우저 [합성]→분리 fal ~42s→ffmpeg.wasm 합성→세션 `completed`→dub_outputs ready→**ffprobe h264+aac 7.0s 유효 mp4**. 남은 실기기(웹캠·마이크·폰)는 사용자. 신규 스킬 **`cf-pages-deploy-verify`**(+render-check 템플릿)·`wrangler.toml`. MILESTONES Phase 4 "CF Pages 배포" `[x]`. |
| 2026-07-03 | **DUB-05 3b 음원분리 배경합류 구현 + fal 실증** | fal 잔액 충전 확인(probe status 200) 후 착수. **Edge `separate-dub-audio`**(호스트·소스 signed URL→fal `fal-ai/demucs`→비보컬 5스템[drums·bass·other·guitar·piano] URL 반환·DB 무변경 순수컴퓨트·크레딧 host gate) + `lib/dub.ts` `separateDubAudio` + `DubCompositor.run()` 배선(분리를 소스/녹음 조회와 병렬→비보컬 스템 다운로드→`mixAndMux(src,cues,background)` amix). **fal 실증 2회**: ①분리품질(원본 mix -19.5dB 음성이 vocals -19.6dB로·톤이 other로 정확 분리, 스템별 volumedetect) ②mp4 직접 수용(status 200)·$0.0007/초. **합성 실증**: 실 ffmpeg로 mixAndMux 배경필터(adelay+amix 비보컬+더빙·`-map 0:v` 원음드롭) 재현→유효 mp4(h264 copy+aac·7.4s). 게이트 tsc0·lint·build·docs:check·deno check PASS. **프로덕션 배포·검증은 다음 행 참조**(배포 5/5·풀 클릭스루 5/5). G-280 DONE·G-284 3b 완료. defer(ponytail): 스템 Storage 캐시·2-stem 대역폭↓·긴클립 fal 큐/웹훅·노래보컬 손실→AudioShake. |
| 2026-07-03 | **원형 6석 무대 레이아웃 (ROOM-02) + 2탭 실렌더 검증** | 방 참가자 렌더를 밋밋한 `<ul>`→**원형 3×3 그리드 무대**(센터 프레임을 상/중/하 × 좌·우 6석이 둘러쌈, DESIGN-DIRECTION §6.1 원형이 §6.4 E형 좌3·우3 대체). 기능별 컴포넌트화: `features/stage/{stageLayout,StageSlot,SelfAvatar,Stage}`(한 파일 비대 방지). 좌석=identity 안정정렬(전 클라 동일). **active-speaker**=말하는 참가자 z↑·확대·amber glow(LiveKit `isSpeaking`). self 파이프라인(rig·트래킹·송신)은 `SelfAvatar` 로 분리·`AvatarLayer` 삭제·`RemoteAvatar` size prop. **2탭 실 LiveKit E2E 16/16 실렌더**(양 클라 좌석 일관성·6슬롯 원형·아바타 렌더·active-speaker glow·데이터경로 회귀 A→B `ParamMouthOpenY=1.00`·빈자리4·센터프레임, 스크린샷 확인; 1 FAIL은 아바타 대기 임계 아티팩트—뒤 단언 반증). 게이트 tsc0·lint·test30/30·build·docs:check PASS. `contracts/StageLayout.md` as-built 노트·PLATFORM-ARCH §12(`features/stage`)·MILESTONES Phase3(active-speaker `[x]`). defer→G-287. |
| 2026-07-03 | **현행 as-built 스택 비용 분석 (하이쿠 조사 + Opus 판정)** | 기존 `COST-ESTIMATE.md`는 VGEN 포함 전체 스택(fal 지배 77~90%) 기준인데, **현재 구현·배포된 스택은 VGEN 미구현**이라 곡선이 완전히 다름을 명시. 아바타=DataChannel(영상 없음)·클라 ffmpeg 합성·R2(egress $0)라 **egress 지뢰 원천봉쇄**, 유일 변수 = LiveKit 연결분. 3구간 모델(**MVP ~$50·소규모 ~$250·성장 ~$2,650**/월, LiveKit 75~85% 지배). `COST-ESTIMATE.md`에 "현행 as-built 스택 비용" 섹션 추가. **더 나은 선택지(판정)**: STT Groq(9×↓, G-269 갱신)·프론트 CF Pages(무료)·미디어 R2 유지·3b Replicate Demucs·Supabase/LiveKit 유지(Neon/100ms 이전은 통합가치 손해라 기각). 미검증: fal Demucs 공개가·Groq JP 품질. |
| 2026-07-03 | **아바타 참가자별 선택 + 원터치 배포 파이프라인 + 대본 텔레프롬프터 (+ 프로덕션 배포)** | (1)**아바타 소유**: 방 전원 하드코딩 Aria→유저가 고른 아바타(`users.avatar_url`·RLS `users_update_own`)로 **참가자별 렌더**. `lib/avatars.ts`(매니페스트 동적 로드 `fetchAvatarPresets`·`isValidAvatarUrl`)·`AvatarPreview`·`SettingsPage` 선택UI·`userStore.setMyAvatar`·`list-room-members` `auth_id`+`avatar_url` 반환·`AvatarLayer`/`RoomPage` 참가자별 `projectUrl`(identity=auth uid 매핑). **마이그레이션 0**(avatar_url 재사용). 통합 10/10. (2)**엔진 범용 리네임**: `lib/pixi/aria`→`rig`·`AriaAvatar`→`RigAvatar`·`loadAriaProject`→`loadRigProject`·`AriaNativePage`→`AvatarInspectorPage`(`/avatar-inspect`·`?project=` 임의 rig 검사). 캐릭터 Aria(Storage `avatars/aria`)는 불변. (3)**원터치 배포**: `avatars/manifest.json` 레지스트리(재빌드 없이 반영)+`scripts/deploy-avatar.mjs`(character.json+mini_rig.json 병합·업로드·매니페스트·원격검증). 아바타 **4종 배포**(아리아·아카네·루비·유키), 각 네이티브 렌더 6/6 시각확인. `avatar-deploy` 스킬 신설. (4)**대본 텔레프롬프터**(ROOM-06): `features/script/{cues.ts,ScriptPanel.tsx}`·`useLiveKitRoom` `'script-cue'` reliable DataChannel·`RoomPage` cue 동기(호스트=slot0). **2탭 실 LiveKit E2E 12/12**(호스트 진행→상대 실시간 동기·순서보존·내 차례 역할매칭). **검증이 실버그 발견·수정**: reliable 채널 첫 메시지 유실(=모든 세션 첫 진행 유실)→호스트 연결/입장 시 현재 cue 재브로드캐스트. 페이블 리뷰(cueIndex 경계·sceneId 가드 수정, 서버권한은 defer). (5)**프로덕션 배포**: dub 마이그(`20260702060001`)+Edge 19개+시크릿(OPENAI/FAL), 프로덕션 통합 20/20. 게이트 tsc0·lint·test30/30·build·docs:check PASS. 커밋 `fc2424a`·`588a1f1`·`cbf1dda`(+`6d0dfc6` ffmpeg 배경음 준비). defer→G-285(아바타 업로드)·G-286(텔레프롬프터 하드닝). |
| 2026-07-02 | **DUB-05 합성 슬라이스 3a (무분리 재더빙) 구현 + 실 ffmpeg 브라우저 E2E** | Edge 4(create-dub-output-upload·submit-dub-output·get-dub-output-url·get-dub-recordings, 호스트=rooms.host_id) + `lib/ffmpeg.ts`(ffmpeg.wasm 단일스레드 코어 CDN·adelay+amix·`-map 0:v` 원음드롭·`-c:v copy`) + `features/dub/DubCompositor.tsx`(게이트→합성→업로드→미리보기·다운로드) + DubPanel/DubRecorder 배선. tsc0·lint·test30/30·build·docs:check PASS. 통합테스트 **20/20**. **헤드리스 Chrome E2E 10/10**: 실 ffmpeg.wasm 믹스→완성본 mp4 ffprobe 실측(h264 320x240 + aac·3.0s 원본길이 유지; unpkg 코어·kong 서명URL은 로컬 라우트 재작성, 배포는 CDN 그대로). **COOP/COEP는 단일스레드 코어로 회피**(vite 변경 0). defer→G-284. |
| 2026-07-02 | **DUB-05 합성 스코프 확정 + 문서 정합화** | 착수 전 문서정합. **스코프 결정(주인님)**: 코어 = **원본 영상 재더빙**(원본 비디오 유지 + 원본 대사 제거 stem + 더빙 오디오 mux), **버튜버 아바타 오버레이는 옵션/확장(P2)** — FEATURE-SPEC "아바타 오버레이" ↔ DubCompositor "원본 재더빙" 모순 해소. **수정**: FEATURE-SPEC DUB-05 문구(코어 재더빙+아바타 옵션, dep ffmpeg.wasm/Egress)·DubCompositor.md(스코프 확정 노트 + 구현방향 노트: dubStore 생략 로컬상태·서명URL `get-dub-output-url` 신설·ffmpeg.wasm 믹스+mux·G-280 분리 선행·Realtime P1 옵션). **dubStore 드리프트**(9문서 111줄)는 DubRecorder가 세운 "계약서=forward 스펙 + 구현노트=as-built" 패턴으로 이미 정합 → 일괄 재작성 안 함. 재더빙은 음원분리(G-280)가 코어 전제로 승격. |
| 2026-07-02 | **DUB-04 녹음 슬라이스 2 구현 + 실 브라우저 E2E** | Edge 4(get-dub-source-url·create-dub-recording-upload·submit-dub-track·confirm-dub-track) + `DubRecorder.tsx`(MediaRecorder·미리보기 필수). 로컬 통합 18/18. **헤드리스 Chrome+가짜 마이크 E2E 9/9**: 실 MediaRecorder→30KB webm Storage 업로드→submit→synced·DB/스토리지 실측. defer→G-283. |
| 2026-07-02 | **JP STT 실증 (합법 합성 클립)** | 저작권 애니 다운로드 대신 `say -v Kyoko`(일본어)+합성 BGM ffmpeg 믹스 클립으로 실제 Whisper STT 실행 → 2.5s 정확 전사(speaker 없음 확인). **발견: STT는 배경음 섞인 원본 믹스로 동작 — 음원분리(G-280) 선행 불필요, 분리는 최종 출력(원본 목소리 제거)용.** 음원분리·합성은 코드 부재(DUB-05 defer)라 그 실증은 슬라이스 착수 때. |
| 2026-07-02 | **DUB STT/분리 스펙 정합화 + G-280·G-281 등록** | 하이쿠 STT·음원분리 웹조사 → 오푸스 판정. **사실정정(P0)**: whisper-1 화자분리 불가인데 스펙 4곳이 "diarization 포함"으로 오기 → DubSession.md·DubRoleAssigner.md·DATA-SCHEMA §1.12/1.13·MediaConfig §4 정정(segments만·화자 수동배정). MediaConfig §4.1 `srt`+parseSRT 내부모순 → `verbose_json` 통일. **합성 P0 갭**: DubCompositor 가 "원본영상+더빙"만이라 애니 원음+더빙 이중음성 → 음원분리(원본 대사 제거) 단계 명시. **신규 G-280**(음원분리 fal Demucs→AudioShake)·**G-281**(대사 번역 JP→KR). **G-269** RESEARCH→DRAFT(gpt-4o-transcribe-diarize 최소전환·word-level 불필요 결론). 근거 [[dub-stt-provider-decision]]·[[dub-audio-separation-anime]]. |
| 2026-07-02 | **아바타 에셋 → Supabase Storage 이관 (레포 bloat 방지)** | 앞 행(아리아 정적 임베드)의 3.6MB 에셋을 레포 커밋 시 "수십 개 누적→push 지옥" 우려(1인 2.1MB×N + git 히스토리 영구 누적). 주인님 결정으로 **즉시 Storage 전환**. 설계 정합: `AvatarCanvas.md`·`DATA-SCHEMA`(models 테이블)가 이미 아바타=오브젝트 스토리지 URL 로드로 규정 — `public/aria-player`는 PoC 지름길이었음. **작업**: ①Supabase 버킷 `avatars`(public, 10MB 제한) 생성 ②아리아 `project.json`(base_url을 Storage 절대 URL로 굽기)+파츠 WebP 54장 업로드(service_role, 인라인노출0) ③런타임 패치: `utils.js` `image.crossOrigin="anonymous"`(크로스오리진 WebGL 텍스처 tainted 방지), `main.js` `?project=<url>` 파라미터 로드, `drive.html` project 파라미터 모델 iframe 전달(캐릭터 무관), `AriaPocPage` src를 `VITE_SUPABASE_URL` 기반 Storage project URL로 ④`public/aria-player`에서 로컬 `project/`·`api/` 제거(3.7MB→**1.5MB 런타임만**) + `.gitignore` 등록. **검증**: 공개 GET 200·`access-control-allow-origin: *`·content-type 정상. 로컬에셋 제거 후 헤드리스에서 아리아가 Storage에서 완전 렌더+구동+콘솔에러0(=순수 Storage 확정). 게이트 tsc0·lint·test17/17. **효과**: 레포는 아바타 수 무관 1.5MB 고정. 아바타 추가 = Storage 업로드 + `?project=<url>`(레포 증가 0). |
| 2026-07-02 | **Phase 1 — 실 rig 아바타(아리아) 통합** | 앞 행(절차적 PoC)에서 이어짐. 주인님이 `/Users/family/jason/Vtube`(성숙한 AUTORIG VTuber 프로젝트)의 실 모델·배포버전을 지목 → 절차적 얼굴을 진짜 rig으로 승격. Explore 정찰: 런타임 `mini_cubism_app`가 **PixiJS v8.19.0**(ChatterBox와 동일 버전)·Cubism 파라미터 25개(ParamAngleX/Y/Z·EyeLOpen/ROpen·MouthOpenY/Form·EyeBallX/Y…)·구동 API `__miniProbe.setParameterValues()`·검증된 MediaPipe→Cubism 매핑(`mini_cubism_drive.html`)·배포버전(Ruby vercel). **경로 결정**: rig이 메시 변형(character.json deformer/keyform/mesh)이라 PNG 스프라이트 스왑 불가 → `rig.js` 필요. 위험/시간 최소 위해 **정적 빌드 임베드(A)** 채택(`rig.js` 네이티브 이식(B)은 멀티플레이어 단계 유보). `build_player_webapp.py --project experiments/snack-aria-001/rig_v0_project --model-src "index.html?renderer=pixi&clean=1"`로 아리아 정적 빌드(WebP 54파츠·api/project 260KB) → `public/aria-player/`(3.6MB). **서브디렉토리 호스팅 패치**: 절대경로 `/api/project`·`/src/*`·`_project_base_url:/project/` → 상대경로(중첩 iframe `new URL(src,location)` 정상 해결). 신규 `pages/AriaPocPage.tsx`(drive.html?panel=1 iframe, `allow=camera`)·라우트 `/avatar-aria`(공개)·절차적↔아리아 교차링크. eslint ignore·vitest exclude에 `public/aria-player` 추가(벤더 `test/*.mjs` 오수집 방지). **헤드리스 실증**: 단독 플레이어(`__miniProbe` 25파라미터·중립↔표정 픽셀 상이 PASS·아리아 렌더 육안 확인) + `/avatar-aria` 중첩 iframe 체인(모델 렌더+`setParameterValues` 구동·콘솔에러0). 게이트 tsc0·lint클린·test 17/17. MILESTONES "blendshape→PixiJS 매핑" AC를 실 rig로 강화. **잔여**: 웹캠 실얼굴 구동은 주인님 실기 확인(헤드리스 가짜카메라 한계). **다음(B)**: `rig.js`+`draw_pixi.js` ChatterBox 네이티브 이식 → 단일 PixiJS 컨텍스트·LiveKit DataChannel 원격 파라미터 구동. |
| 2026-07-02 | **Phase 1 — 표정 트래킹 PoC (MediaPipe→PixiJS, 로컬)** | 빌드 다음 본편으로 MediaPipe 표정을 선검증(타임라인 표가 지목한 Phase 1 최대 블로커 "MediaPipe↔PixiJS 리그 매핑"). 선행 `specs/MediaPipeConfig.md`·`reference/patterns/pixijs-v8-avatar-render.md`·`state-machines/Tracking.md`·`contracts/AvatarCanvas.md` 검증 후 구현. **범위 결정(미니멀)**: ①**절차적 PixiJS v8 Graphics 얼굴**(43-PNG rig 아님 — rig 에셋·autorig 미존재) ②**로컬 전용**(DataChannel 전송·DB 없음) ③**메인스레드 rAF**(Web Worker 아님 — 문서 예제는 HTMLVideoElement postMessage 불가로 실제 깨짐) ④COOP/COEP 미설정(Supabase/LiveKit/CDN COEP 파손 회피)→non-SIMD 자동폴백 ⑤blendshape은 categoryName 조회(index 배열 불완전). 신규: `src/lib/mediapipe/faceLandmarker.ts`(FilesetResolver+52 blendshape 맵+headRoll 행렬추출), `src/lib/pixi/proceduralAvatar.ts`(Application v8·EMA 스무딩·눈/입/눈썹/머리기울임 draw), `src/stores/trackingStore.ts`(Tracking FSM 부분집합·순수), `src/hooks/useFaceTracking.ts`(웹캠+rAF+cancelled 가드), `src/features/avatar/AvatarStage.tsx`, `src/pages/AvatarPocPage.tsx`, App 라우트 `/avatar-poc`(공개). `pixi.js@8.19`·`@mediapipe/tasks-vision@0.10.21` 설치. **근본원인 수정(SSOT)**: MediaPipeConfig.md 모델 URL `mediapipe-tasks/vision/...`가 **404** → 정본 `mediapipe-models/face_landmarker/face_landmarker/float16/1/`(200/3.75MB)로 코드+문서 5곳 정정. **자기리뷰(Opus)**: useFaceTracking 리소스 누수(getUserMedia/landmarker가 cleanup 이후 resolve 시 카메라 안 꺼짐) → cancelled 가드 강화. **헤드리스 실증**: `/avatar-poc` 상태 `트래킹 중` 도달(모델로드+웹캠+detect 루프), 아바타 캔버스 360² WebGL, 중립↔표정(눈감음·입벌림·미소·눈썹·기울임) 픽셀 상이 PASS, 콘솔 실에러 0(XNNPACK INFO 로그뿐). 게이트: tsc 0·lint 클린·test 17/17(trackingStore 5+faceParams 5 신규)·docs:check. MILESTONES Phase 1 "52 blendshape 추출"·"blendshape→PixiJS 매핑" AC [x]. **ponytail 유보(Phase 2~3)**: 실 43-PNG rig+ParameterDriver·DataChannel `blendshape` 전송·캘리브레이션 위저드·Web Worker+OffscreenCanvas·GPU delegate·iOS 키보드 폴백·60fps 측정. |
| 2026-07-02 | **Phase 1B — 배포 완료 + 채팅(ROOM-05) 추가 + 2탭 실증** | 앞 행(코드완성)에서 이어짐. **배포**: `supabase link owfcrolbvikkqrotmleq`(=SNACK 백엔드, 낡은 SUPABASE_ACCESS_TOKEN 우회) + secrets(LIVEKIT_API_KEY/SECRET/SERVER_URL) + `functions deploy livekit-token --no-verify-jwt`. **E2E**: 인증 201(server_url wss + JWT grants{room,canPublish,roomJoin}) · 무인증 401. **오디오 2탭 실증**: 헤드리스 Chrome 2계정(+운영자 실탭) 같은 방 `연결됨`·각 탭 원격 오디오 트랙 상호수신(`[data-lk-audio]` attach)·마이크 발행 확인. **채팅 추가(ROOM-05)**: LiveKit DataChannel `chat` 토픽(reliable) — Edge Function 불필요(P2P data). `roomStore.messages`+`addMessage`, `useLiveKitRoom`에 `DataReceived`(sender는 participant에서 취득·payload 신뢰 안 함)+`sendChat`(publishData, 자기 echo 없어 로컬 직접 추가), RoomPage 채팅 패널(입력/목록, 출력 XSS는 React 이스케이프). **채팅 2탭 실증**: A→B·B→A 양방향 송수신 확인(PASS). **ponytail 유보(Phase 2)**: messages 테이블 영속화·sanitize 3단계(SecurityPolicies §6.4)·§4.1 DB 게이트·영상(ROOM-04B)·blendshape/script-cue/room-authority 채널·재연결UX. 게이트: lint·tsc 0·test 7/7·docs:check PASS. MILESTONES Phase 1 "2인 음성 수신" AC [x]. |
| 2026-07-02 | **Phase 1B — LiveKit 2인 음성 PoC (코드 완성, 배포 대기)** | 빌드 블록 Phase 1B(ROOM-04/04A) 착수. 선행 G-01(`specs/livekit-edge-fn.md`) 완비·클라이언트 패턴(`reference/patterns/livekit-client.md`)·`WebRTC.md` FSM 검증 후 구현. **결정: Path A(PoC-최소 토큰함수)** — rooms/room_participants/users(Phase 2 INFRA-06 미존재)를 끌어오지 않고 Auth 로그인 검증만. §4.1 5-게이트(온보딩·방존재·방자격·강퇴무효화·차단)·token_version·refresh/kick/leave/webhook(§6~7)은 `ponytail:` 주석으로 §원문 가리키며 Phase 2 유보. 시크릿은 함수 내 서명만(보안 성역·인라인노출 0). 신규: `supabase/functions/livekit-token/index.ts`(auth→JWT, canPublish=true, ttl 600, 브라우저 CORS preflight 추가), `src/lib/livekit.ts`(fetchRoomToken+mapParticipant boundary), `src/hooks/useLiveKitRoom.ts`(연결 라이프사이클·마이크 발행·원격오디오 attach·StrictMode cancelled 가드·ConnectionStateChanged→FSM 매핑), `src/stores/roomStore.ts`(연결상태 FSM 부분집합·참가자·순수 컨테이너), `pages/RoomPage`(연결배지·참가자·마이크토글·나가기 재작성)·`LobbyPage`(임시 방입장 폼). `livekit-client@2.20.0` 설치, eslint ignore에 `supabase/functions`(Deno) 추가. **범위: 오디오만** — 영상(ROOM-04B)·채팅relay(ROOM-05)·재연결오버레이·ICE재시도·연결품질·blendshape는 Phase 2. **테스트**: `tests/unit/roomStore.test.ts` 4케이스(상태전이·참가자·reset). 게이트: lint 클린·tsc 0·test 6/6(config 2+room 4)·docs:check PASS. deno check는 `npm:livekit-server-sdk` 로컬 미해결(배포 시 Supabase 번들러 처리, 코드 오류 아님). **런타임 실증 대기(사용자·클라우드)**: `supabase link`+secrets set(LIVEKIT_API_KEY/SECRET/SERVER_URL)+`functions deploy livekit-token --no-verify-jwt` 후 2계정·2탭 오디오 왕복 확인 → MILESTONES Phase 1 PoC AC. |
| 2026-07-02 | **인증 런타임 실증 (Auth REST)** | 대시보드 Confirm email OFF 후 실 백엔드 검증: `signUp`→session 즉시 발급(PENDING 아님)·`token?grant_type=password`→access_token·`/auth/v1/user`→세션 유효(email_confirmed_at 있음)·오답 비번→거부(에러 분기). 테스트유저 admin API 삭제(HTTP 200)+재로그인 불가 확인. 키·토큰 마스킹. MILESTONES 로그인 AC [x]. 잔여: 브라우저 새로고침 세션유지·Realtime 배너 SQL 반영은 인-브라우저 실증. |
| 2026-07-02 | **Phase 0 인증 축 — 이메일 로그인/회원가입 + 세션유지 + Realtime 배너 + Vitest/ESLint** | SSOT `contracts/AuthPage.md`·`state-machines/Auth.md` 기준 구현. `userStore` 확장(authState·error·`login`(signInWithPassword)·`signUpWithEmail`(signUp)·`logout`, init에 authState 반영), `pages/{LoginPage·RegisterPage}`(이메일/비번, 강도검증 8자+대문자+숫자, enumeration 방지 generic 에러), `components/shared/{ProtectedRoute(ready 게이트로 깜빡 리다이렉트 방지)·MaintenanceBanner(config.MAINTENANCE_MODE)}`, App에 `userStore.init()` 연결+보호 라우트 3개 가드+`/login`·`/register` 추가, Landing CTA→로그인/가입, Lobby 로그아웃+이메일 표시. **Realtime 배너**: MILESTONES 검증 시나리오 2용 컴포넌트 완료(subscribeRealtime 기존 배선 재사용) — 실 SQL UPDATE 반영 실증은 대기. **Vitest 첫 테스트**: `tests/unit/configStore.test.ts`(getFlag 2케이스, supabase 목킹) `npm run test` 2/2. **ESLint 9 flat**(eslint·typescript-eslint·react-hooks·react-refresh·globals) `eslint.config.js` 신설+`lint` 스크립트, `docs/`(marketing-automation 참고코드)는 앱 lint 제외. 게이트: tsc 0·lint 클린·test 2/2·build gzip 145KB·docs:check PASS. **범위 밖(Phase 2)**: OAuth(AUTH-02)·비번재설정(G-54)·이메일인증 UI(G-55). **런타임 실증 대기**: 실 로그인/세션유지(대시보드 Confirm email 설정 필요)·Realtime SQL 반영·CI 워크플로. |
| 2026-07-02 | **Phase 0 착수 — Vite 앱 스캐폴드 + app_config 원격 마이그레이션** | 코드 미착수 → 실제 앱 골격 세움. Vite 8+React 19.2+TS 6+Tailwind 4 초기화(@/ alias·디자인토큰 §8), react-router 8 라우트 4개(/ /lobby /rooms/:roomId /settings), `lib/supabase.ts`, `stores/{configStore(FeatureFlags SSOT)·userStore}`. supabase CLI 마이그레이션 `20260702041152_create_app_config`(테이블+public_read RLS+updated_at 트리거+플래그 12개 시드) 원격 적용, anon REST 12행/enabled 10 검증. **스펙 정합 3건(코드↔문서, 왜→어떻게→검증)**: ①`react-router-dom→react-router`(§2.1 v8 단일패키지 확정인데 설치·청크·마일스톤이 구 -dom 표기→설치 어긋남, 4곳 정합) ②VITE-CONFIG `manualChunks` 객체형→Vite 8은 함수형만 허용(build TS2769)이라 제거+문서노트 ③tsconfig `references+composite`→`TS6310`(referenced project may not disable emit)이라 단일 tsconfig+`tsc --noEmit`로 단순화. tsc 0·build(gzip 148KB)·dev 200 검증. **DB 적용 우회(재현용)**: 자동화셸 keychain 잠금 해제 불가 + IPv4(direct는 IPv6-only)라 `db push --db-url`+서울 session pooler(`aws-1-ap-northeast-2:5432`). 커밋 `34cc805`. |
| 2026-07-02 | **구현 레퍼런스 패턴 4종 신설 + WebRTC RT-02 오타 수정** | 커버리지 감사(Haiku): 11영역 중 7 충분·4 부족(버전민감). 신설 `reference/patterns/`{livekit-client·pixijs-v8-avatar-render·falai-vgen-pipeline·react-router-routing}.md (현행 공식문서 기반·버전고정). **Opus 검수 수정**: PixiJS §4.3 `room.onDataReceived`(존재X)→`room.on(RoomEvent.DataReceived)`+바이너리, fal 크레딧차감 비원자성·`supabase.sql` 오용 노트, react-router `Outlet` import 누락·패키지명 불일치(react-router↔-dom) 노트. **SSOT 버그 수정**: `state-machines/WebRTC.md §RT-02` blendshape 검증 `!==208`→`!==220`(총 프레임 220B, §207 정합). INDEX §ⓕ·CODING-CONVENTIONS §4 등록. |
| 2026-07-02 | **G-268~G-279 등록 + G-132 P1 승격 (21차 분석)** | 착수 전 향후취약점·미리설계 seam 리뷰. Haiku 8병렬 스캔 → Fable 4클러스터 리뷰 → Opus 충돌검증(원본직접) + Haiku 4 외부조사. 신규 [[FORWARD-REVIEW-2026-07]] 문서. 신규 갭 12개(P0 3: G-270 가격지속성·G-275 일본미성년동의·G-276 PoC게이트 / P1 9). **우선순위 역전 수정**: G-132 시드데이터 P2→P1(RESEARCH), LATER 목록서 제거 — 파생 G-184/G-188(P1)의 선행조건. **중복 아님 확인**: G-152·G-135·token_version 기존 커버. **오탐 기각**: rig↔VGEN 충돌(STACK-COMPARE-VIDEOGEN:108 단일캔버스 정합). 외부조사 결론: STT는 Whisper→AssemblyAI/Deepgram(비용↓품질↑), 일본 APPI 2026-04 16세미만 부모동의 법적의무, 자동모더 30~60%누락+비면책. |
| 2026-06-30 | **G-153·154·155·158·159·190 DONE** | P1 RESEARCH 6개 완결. G-153/159: PLATFORM-ARCHITECTURE §4 Discord/Twitter OAuth "P1 Phase 2" 주석 추가. G-154: HostConsole.md RaiseHandQueue 섹션 (손들기 Realtime + invite_to_stage DataChannel + room_participants.raise_hand_at). G-155: HostConsole.md Chat Safety 섹션 (HOST-09 슬로우모드·HOST-10 금칙어·HOST-11 채팅 클리어 + DataChannel slow_mode/chat_clear 타입 등록). G-158: contracts/ViewerGate.md 신규 작성 (입장 조건 매트릭스·resolveRole() 타입스크립트·Room FSM 전이·_INDEX.md 31개). G-190: VGEN-13 FEATURE-SPEC 등록 확인. CONTRACT-HEALTH RESEARCH 카운트(7개) 추가. |
| 2026-06-30 | **G-184~G-190 등록** | 2차 사용자 감정 분석 반영 — cold start, 리허설 피드백, 트래킹 품질 불안, 호스트 이탈, 시드 대본, 방송용 클린 모드, 작품함 검색 ID 누락을 FEATURE-SPEC/GAP-MATRIX에 연결. |
| 2026-06-30 | **G-180~G-183 DONE** | VDo.Ninja·StreamYard·Riverside식 UX 벤치마크 반영. 15초 초대 직입, Stage Manager Overlay, 로컬 백업 녹화, 항상 켜진 데모룸을 Feature ID/계약/API/스키마/제품 준비도 문서에 연결. |
| 2026-06-30 | **G-170~G-179 DONE** | 일본 런칭·Alibaba 피치·신뢰안전·결제·제품분석 관점의 신규 갭 10개 등록 및 기존 문서에 얇게 반영. `MILESTONES.md`에는 피치 데모/증거 패킷, `COST-ESTIMATE.md`에는 일본 가격·결제/크레딧 통제, `FeedbackChannel.md`에는 일본 지원 채널, `MODERATION-OPS.md`에는 일본 정책 검토·사용자 안전 UI·데이터 투명성, `MonitoringDashboard.md`에는 제품 분석·APAC 품질 게이트를 추가. |
| 2026-06-29 | G-01~13 | Haiku 공식문서 조사 시작 (3 에이전트 병렬) |
| 2026-06-29 | G-01 | livekit-edge-fn.md 완성 (Supabase Edge Function 코드 포함) |
| 2026-06-29 | G-02, G-13 | supabase-auth.md 완성 (models 테이블·RLS·auth-ui-react 폐기 확인) |
| 2026-06-29 | G-03 | rig-format.md 완성 (ChatterBox rig JSON v1 + ARKit 52 매핑표) |
| 2026-06-29 | G-04, G-05, G-07 | Opus가 AuthPage·LobbyPage·GreenRoom 계약서 작성 완료 (총 17개) |
| 2026-06-29 | G-11 | 온보딩 플로우 확정 — ONBOARDING-FLOW.md 작성 완료 (3트랙+공통게이트) |
| 2026-06-29 | G-18~23 | 전수 교차검증 — 계약서 미생성 3종(DUB·LOB-06·07), 스키마 누락 3종 신규 등록 |
| 2026-06-29 | G-14 | VgenPanel 계약서 작성 완료 (현재 SSOT: 섹션별 LWW + VgenStatusTab) |
| 2026-06-29 | DESIGN §6 | 메인뷰 레이어 스택(§6.7), VGen 프롬프트 패널(§6.8), DUB 오버레이(§6.9) 추가 |
| 2026-06-29 | 교차참조 감사 | A(§3 obsolete 표시), B(RoomAuthorityMessage 타입 3개 추가), C(§6.9 링크 수정), D(§4.2 PENDING→§1.7), E(G-24 등록), F·G(계약서 수 18개 갱신) |
| 2026-06-29 | G-06, G-08 | SettingsPage.md(SET-01~08)·StageLayout.md(ROOM-02) 계약서 작성 완료 |
| 2026-06-29 | 신규 계약서 | RightPanel.md(§6.3 4탭)·MainViewComponent.md 갱신(stageStore.mode z-index 레이어) — 총 20개 |
| 2026-06-29 | G-09, G-10 | Vgen.md 상태머신(IDLE→MODERATING→GENERATING→DONE/FAILED, 엣지8개)·Onboarding.md 상태머신(3트랙 통합, 엣지8개) 완료 |
| 2026-06-29 | G-12 | 아바타 포맷 확정 — PNG 파츠 리그 채택(Live2D 제외). Vtube 파이프라인 강제 통과(프롬프트→Codex→See-through→43개 파츠→rig.json). rig-format.md §7 신규 작성. |
| 2026-06-29 | SceneBackground | 레이어 분리 인터랙티브 씬 스펙 작성 — 하스스톤 맵처럼 PNG 레이어 분리·PixiJS 스프라이트·click/hover/idle 이벤트. DATA-SCHEMA scenes.layers_json 추가. scene-prompts.md 레이어별 재작성(17개 레이어). |
| 2026-06-29 | G-16 DONE | SecurityPolicies.md §5에서 커버 확인 (프롬프트 사전·프레임 사후 모더레이션) |
| 2026-06-29 | G-25~G-32 | FEATURE-SPEC SSOT 전수 비교 — ROOM-12·13·14·15·18·19, OBS-01~03, MOB-02 8개 미추적 기능 GAP-MATRIX 등록 |
| 2026-06-29 | G-33 | P0 보안 감사 반영 — LiveKit 토큰 참가자 검증, RLS room 상관 검증, room_secrets/room_invites, DataChannel 허용 채널은 이후 SSOT 기준 4개(`room-authority`, `chat`, `script-cue`, `blendshape`)로 확정, StageMode FSM, FAL/R2 서버 전용 규칙 문서화 |
| 2026-06-29 | G-34 | H1-H16 런타임 하드닝 반영 — host transfer/empty room, token refresh replay, signed URL 403 재발급, uplink ack, WebGL/context loss, DUB role lock, reactions TTL, OBS 비인증 차단 |
| 2026-06-29 | G-35~G-39 | docs:check:strict 충돌 감사 — SSOT 4개 항목 수정(DataChannel 4번째 blendshape 공식화, VGen status='flagged' 추가, output_url vs result_url 명확화) + 신규 갭 5개 등록(rate limit·sanitize·token revoke·invite flow·consent) |
| 2026-06-29 | G-37·G-44 DONE | 클러스터 1 (토큰 무효화·replay 방어) 닫기 — SecurityPolicies.md §8 신설(3단계 방어: Edge Function 게이트·LiveKit webhook·클라이언트 self-check, jti 추적 전용·블랙리스트 없음·token_version YAGNI) + livekit-edge-fn.md §6(kick-participant·leave-room·livekit-webhook 3개 Edge Function) + DATA-SCHEMA.md §1.3 주석. Grill v2 C1·C7·G-44 해소. |
| 2026-06-29 | G-36·G-38·C9·C13·C16 DONE | 클러스터 6+2+3 동시 닫기 — (6) ParticipantSlot.md room-authority에 authority_epoch 추가(C9)·cleanup을 key prop 강제 remount로 명시화(C13)·Avatar.md WebGL context loss를 H7/AvatarCanvas.md와 일치(C16). (2) SecurityPolicies.md §6.4 3단계 채팅 sanitize 신설(입력·서버 RLS·출력, javascript:/data: 프로토콜 차단) + ChatPanel/ChatOverlay MUST NOT 갱신(G-36·C2). (3) LobbyPage.md ?invite={room_id} → ?invite={invite_code}로 변경, verify-invite-code Edge Function 신설(G-38·C3). |
| 2026-06-29 | G-15·G-39·G-43·C4·C6·C10·C11·HIGH DONE | 클러스터 4+5+HIGH 동시 닫기 — (4) DATA-SCHEMA.md recordings·dub_sessions에 consent_json·retention_expires_at 추가(C4·G-39)·state-machines/DubSession.md 신규 작성(8상태, C6 Whisper 롤백)·SecurityPolicies.md §11 녹화/DUB 동의 정책(2단계: 사전+사후, G-43 독립성 원칙). (5) dub_sessions UPDATE WITH CHECK 절 추가(C10 room_id 변조 방어)·public_rooms 뷰에서 host_id 제거, host_display_name으로 대체(C11 신원 추적 방지). HIGH: livekit-edge-fn.md §7 refresh-livekit-token Edge Function 신설(H2 순서 준수)·voice_tracks UPDATE RLS에 WITH CHECK room 검증 추가(강퇴 후 수정 차단)·SecurityPolicies.md §2.2에 users·room_invites RLS 정책 추가(이메일·auth_id 노출 금지). |
| 2026-06-29 | G-40~42·G-45·G-47~53·C5·C12·C14·C15·C17·HIGH DONE | 3묶음 동시 닫기 — CRITICAL: messages.idempotency_key+seq 추가(C5·HIGH)·VgenPanel triggerGenerate 원자성(실패 시 setMode 금지, C12)·Vgen.md FLAGGED/ADMIN_REVIEW FSM(C14·G-48)·pg_cron output_9x16_url 정리(C15)·room_participants 멀티탭 UNIQUE 정책(C17·G-51). HIGH+GAP: SecurityPolicies §12 크레딧 격리·동시성·할당량(G-40~42)·§13 초대코드 brute-force rate limit·authority_epoch 12타입 완전화(G-45)·Admin Review Console(G-47)·WebGL SOP(G-49, C16)·R2 Cascade(G-50)·scene-prompts 재확인(G-52)·OBS는 H15와 동일 BLOCKED(G-53). |
| 2026-06-29 | G-18 DONE | DUB 4개 계약서 작성 — DubSessionSelector(DUB-01/01b, MP4 업로드+YouTube URL+Whisper STT)·DubRoleAssigner(DUB-03, 역할 배정+H12 잠금+consent 게이트)·DubRecorder(DUB-04, 원본 영상 동기+내 차례 녹음+MediaRecorder)·DubCompositor(DUB-05, ffmpeg.wasm/Egress 합성+다운로드+90일 보존). dubStore 신설, _INDEX.md 22→26개, FEATURE-CONTRACT-MAP 계약 공백 해소, STORE-DEPENDENCY-MATRIX dubStore 추가. |
| 2026-06-29 | G-31·G-53·G-32·H15 조정 | OBS는 P2 방송 송출 옵션으로 격하. DATA-SCHEMA.md §1.17·SecurityPolicies.md §7·OBSViewer.md 계약은 토큰 기반 구현 시 참고용이며 P0/MVP 스캐폴딩 금지. MobileViewer.md는 MOB-02 계약 유지. |
| 2026-06-30 | G-46 DONE | VgenExport.md 계약서 존재 확인 → GAP-MATRIX 등록. grill v2 T25(VgenExport 완전 미작성) 해소 완료. 모든 P0 갭 DONE 상태 확인. |
| 2026-06-30 | G-54~G-79 등록 | 2차 사용자 여정 감사(29개 허점 → Opus 대조) — COVERED 3개·LATER 2개·NEW-GAP 24개. G-54~67(P1 14개: 비번재설정·이메일인증·게스트이관·장르추천·대기열·필터·언어·GreenRoom참가자·즉흥모드·PiP·늦참·공개범위·아카이브)·G-68~79(P2 12개: LATER 등록). |
| 2026-06-30 | G-54, G-55 DONE | Auth.md 상태머신 확장 (RESET_REQUEST·RESET_NEW_PW·PENDING_VERIFICATION 추가, 전이 5개 신설, 엣지케이스 6개 추가). AuthPage.md 컴포넌트 3개 계약 신설 (ForgotPasswordForm·ResetPasswordForm·EmailVerificationPending, Props·흐름·Supabase 접근 명시). supabase-auth.md §8·§9·§10 이메일 설정 추가 (확인 링크 유효 7일, 재설정 링크 유효 1시간, Site URL·Redirect URL). 검증 체크리스트 각 15개·10개 항목. |
| 2026-06-30 | G-58·G-59·G-60·G-62 DONE | 4개 로비/GreenRoom 스펙 추가. (G-58) LobbyPage.md: preferred_genres 배너 + RoomCard "당신의 장르" 배지 + 정렬 구현 (Onboarding.md는 이미 명시). (G-59) DATA-SCHEMA.md: room_waitlist 테이블 신설 (CASCADE·RLS·자동 정리) + LobbyPage.md: "마감(대기 신청)" UI·대기 취소·알림 플로우. (G-60) LobbyPage.md: RoomFilterPanel (genres·language·minParticipants·maxParticipants·searchQuery) + Supabase 다중 필터 쿼리. (G-62) GreenRoom.md: ParticipantReadyList (우측 패널, avatar_thumbnail·role·is_ready) + DATA-SCHEMA.md: room_participants.is_ready 컬럼 추가 (기본 false, 사용자만 갱신 가능). |
| 2026-06-30 | G-56, G-57, G-61 DONE | 3개 스펙 동시 추가 (총 32줄 신규·기존 수정): (G-56) DATA-SCHEMA.md users.anonymous_session_id 컬럼 추가; livekit-edge-fn.md §8 migrate-guest-history Edge Function 스펙 신설 (room_participants·recordings·user_room_history 이관, non-blocking 실패, clien-side 호출 패턴·실패 처리 명시). (G-57) Onboarding.md 상태머신에 AUTH→INTRO 전이(restart_requested 조건) 추가, INTRO→LOBBY 전이 추가(재시청 사용자 GENRE 스킵); SettingsPage.md 접근성 탭에 "첫 방문 가이드 다시 보기" 버튼 명세 신설 (userStore.restart_requested 설정, /onboarding/intro 네비게이션, 리셋 정책). (G-61) DATA-SCHEMA.md rooms.language (VARCHAR(10), default='ko') 컬럼 추가; LobbyPage.md 컴포넌트 구조에 RoomCard 우상단 언어 뱃지 명시, CreateRoomModal language 드롭다운 입력 추가. |
| 2026-06-30 | G-63, G-64 DONE | 2개 스펙 추가 (RoomView·ScriptPanel·HostConsole): (G-63) ImpromptuModePanel 분기 명세 추가 — script_id 조건부 렌더, "🎭 대본 없이 즉흥 연기 중" 헤더, 리액션 버튼 5개(박수·웃음·놀람·슬픔·분노) + 커스텀 텍스트, "오늘의 즉흥 주제 카드" 랜덤 생성·새로고침, ImpromptuStore 신규 정의 (impromptu_topic·reaction_history·refreshTopic). RoomView.md 컴포넌트 다이어그램 업데이트. ScriptPanel.md §G-63 조건부 렌더 명시. (G-64) FloatingSelfMonitor PiP 명세 추가 — 우상단 고정, 100~200px 리사이즈 드래그, PixiJS 로컬 아바타 렌더링, stageStore.showSelfMonitor 토글(기본 false), CONNECTED 상태 조건, 모바일 WebGL 제한 처리, SettingsPage 또는 HostConsole 토글 UI 옵션. RoomView.md §G-64 + HostConsole.md §G-64 참고 섹션 추가. |
| 2026-06-30 | G-65, G-66, G-67 DONE | 3개 스펙 동시 추가 (데이터·상태머신·계약): (G-65) DATA-SCHEMA.md rooms.playback_position_ms INT (호스트 주기 업데이트 5초, 늦참 영상 동기); Participant.md "늦참 입장 프로토콜" 섹션 신설 (room_participants INSERT 후 영상 동기·슬롯 배정·토스트 알림); GreenRoom.md "늦참 입장 시 GreenRoom 건너뜀" 섹션 신설 (rooms.status='live' 조건부 바로 RoomView 진입, 얼굴 검증만 실시). (G-66) DATA-SCHEMA.md vgen_jobs·recordings에 visibility TEXT DEFAULT 'members_only' 추가 (public|private|members_only); RLS 게이트 문서화 (public 모든 사용자·members_only 방 참가자·private 본인/호스트); VgenExport.md §3.5 공개 범위 선택 UI 추가 (RadioGroup: 공개·방 멤버만·비공개, [확인] 클릭 시 UPDATE). (G-67) LobbyPage.md §컴포넌트 구조에 PastRoomsSection 추가 (로그인 사용자만·rooms.status='ended' 필터·recording LEFT JOIN·썸네일·무한 스크롤 cursor); §Supabase 접근에 쿼리 상세 명시. |
| 2026-06-30 | G-80, G-84 DONE | 2개 P0 스펙 작성 (환경·차단): (G-80) PLATFORM-ARCHITECTURE.md §Env 신설 (3단계 환경 dev/staging/prod, .env.{development\|staging\|production} 구조, 필수 변수 목록 12개, 환경 보호 규칙, Vercel 자동 적용). (G-84) SecurityPolicies.md §14 신설 (user_blocks 입장 게이트: A가 B 차단 시 같은방 입장 원천 차단, 3개 시나리오 매트릭스, livekit-token Edge Function에서 404 또는 403 구현). |
| 2026-06-30 | G-81·G-82·G-83 DONE | 3개 P1 스펙 추가 (사용자명·시간대·저장소): (G-81) display_name 동명이인 구분 정책 — DATA-SCHEMA.md users.display_name 주석 추가(글로벌 UNIQUE 없음, 방 내 slot_index로 구분)+room_participants.slot_display_name 컬럼 추가("Jason#2" 형태 자동 생성, 동명이인 감지 로직)+contracts/ParticipantSlot.md "§동명이인 이름 표시" 섹션 신설(Edge Function 검증·UI 표시 우선순위·스타일링). (G-82) UTC 타임존 통일 — DATA-SCHEMA.md users.timezone 컬럼 추가(IANA 포맷, 기본 'Asia/Seoul')+모든 pg_cron 스케줄 UTC 기준 주석(KST = UTC+9, 예시 '0 15 * * *'=매일 00:00 KST)+SecurityPolicies.md §12.3 크레딧 할당 주석 업데이트(15:00 UTC=00:00 KST). (G-83) R2 스토리지 쿼터 — DATA-SCHEMA.md §1.11.1 user_storage_quota 테이블 신설(user_id·used_bytes·limit_bytes 10GB 기본, RLS 본인 SELECT only, pg_cron 일일 갱신)+SecurityPolicies.md §15 새 섹션 신설(경고 80%·차단 100%, 경고 배너·VGEN/녹화 차단, pg_cron 고아 객체 정리+재집계, 구현·검증 체크리스트 8개). |
| 2026-06-30 | G-85~G-104 등록 | 5그룹 감사(법적·아바타·모더·계약·상태머신) → 20개 신규 갭 등록. (그룹A 법적/규제 P0 4개) G-85 이용약관·개인정보처리, G-86 DMCA 신고, G-87 UGC 소유권, G-88 데이터 반출 경로. (그룹B 아바타 P1~P2 2개) G-89 AUTORIG 계약, G-90 모델마켓(LATER). (그룹C 모더레이션 P1 3개) G-91 거절 시 수정가이드, G-92 FLAGGED 통보·appeal, G-93 신고 피드백. (그룹D 계약 표준화 P1 1개) G-94 loading/error 표준화. (그룹E 상태머신 엣지 P1 10개) G-95 방인원초과, G-96 방삭제중참가자, G-97 2기기동시접속, G-98 ICE타임아웃, G-99 코덱실패, G-100 메모리부족, G-101 호스트위임거절, G-102~104 스크립트(동시편집·삭제중·버전). 판정: COVERED 2개(B-5·B-7 Avatar.md), LATER 2개(B-8·G-90), NEW-GAP P0 4개·P1 15개·P2 1개 총 20개. |
| 2026-06-30 | G-108~G-122 등록 | 5차 분석 — 인프라·품질·지속가능성 감사 (16개 항목 대조). PLATFORM-ARCHITECTURE.md·FEATURE-SPEC.md·SettingsPage.md·LobbyPage.md·SecurityPolicies.md 기존 문서와 대조. 판정: COVERED 1개(D-15 G-67 방 아카이브), NEW-GAP P0 5개(Q-1 ErrorBoundary, Q-4 테스트전략, D-12 VGEN단가, D-14 DB백업, D-16 커뮤니티가이드), P1 8개(Q-2 Feature Flag, Q-3 코드스플리팅, Q-5 FSM검증, S-6 인앱도움말, S-7 고객문의, A-9 Accessibility탭, A-10 WCAG레벨, D-13 SET-05구체화), P2 2개(S-8 FAQ, A-11 다크/라이트테마). G-108~G-121: RESEARCH, G-122 실제 커뮤니티가이드 아이템 (D-16과 동일). 각 신규 항목별 산출 문서·해결 방향 2줄 명시. 총 15개 신규 갭 등록 (G-108·G-109·G-110·G-111·G-112·G-113·G-114·G-115·G-116·G-117·G-118·G-119·G-120·G-121). |
| 2026-06-30 | **G-118 DONE** | VgenCostAnalysis.md 신규 작성 (§1 모델 단가표: Seedance 2.0 Fast $0.2419/초 vs 2.5 예상 30~40% 상향·§2 크레딧 = 1초 생성·§3 티어별 손익분기·§4 `VGEN_MODEL_ID` 환경변수 설계·§5 2.5 전환 체크리스트) + VgenPanel.md §영상길이설정 섹션 신설 (모델별 옵션 매핑·30초 2.5 조건부 잠금·크레딧 검증·MUST NOT 4개) + GAP-MATRIX 상태 전환. |
| 2026-06-30 | **G-122~G-127 등록** | 7차 분석 — 기술 구현 깊이·미디어·로깅·점진적향상 (20개 허점 → 6개 신규 GAP). 판정: (1군 코덱/ICE/MediaPipe) G-122 미디어코덱·품질파라미터(P1)·G-123 TURN/STUN/ICE 명세(P1)·G-124 MediaPipe 모델버전/WASM(P1); (2군 로깅·PII) G-125 Error logging PII 필터링+보존기간(P0)·G-126 Sentry 환경별설정(P1); (4군 점진적향상) G-127 Progressive Enhancement 폴백정책(P1). COVERED: 3군 접근성 8-13항목 → G-116 AccessibilityPolicy.md 범위 내 처리, 5군 i18n 18-20 → G-17 LATER 범위, WebRTC 미지원 폴백 → LATER(앱 핵심 기능). |
| 2026-06-30 | **G-109·G-130·G-131·G-133·G-137 DONE** | P1 5개 스펙 완성 (Haiku 4개 병렬 조사 → Opus 리뷰 + 초안 작성). [[DEPLOY-PLATFORM]](Cloudflare Pages 배포), `PLATFORM-ARCHITECTURE.md §7.4`(URL전략), [[COST-ESTIMATE]](DAU별 비용표·fal.ai 95% 점유 확인), `specs/FeatureFlags.md`(Supabase Realtime), [[DEFINITION-OF-DONE]](5항목 기본+카테고리별). |
| 2026-06-30 | **G-113·G-114·G-115·G-128·G-129·G-134 DONE** | P1 6개 스펙 완성. `contracts/HelpPanel.md` 신규 (12개 섹션 도움말, F1 키 단축키, helpStore). `specs/FeedbackChannel.md` 신규 (Discord+Tally MVP, Crisp 확장경로, FeedbackDropdown 컴포넌트). `contracts/SettingsPage.md` 확장 (SET-09~13: 자막·모션감소·고대비·폰트·깜빡임경고, accessibility 슬라이스 추가). [[DEVELOPMENT-GUIDE]] 신규 (Node 18+, npm install, .env 설정, 30분 시작 체크리스트). [[IMPLEMENTATION-ORDER]] 신규 (Phase 0~4, 5.5주 일정, 병렬 가능 작업 명시, ASCII 의존성 트리). [[MonitoringDashboard]] 신규 (Supabase+LiveKit+Cloudflare+Sentry 무료 스택, SQL 쿼리 3개, pg_cron 비용 알림, 5항목 체크리스트). |
| 2026-06-30 | **G-128~G-138 등록** | 8차 분석 — 구현 진입장벽·런칭 준비·플랫폼 경제 (20개 허점 → 11개 신규 GAP). COVERED 4개: Item 2(.env.example)·Item 8(환경전환)→G-80, Item 14(크레딧경제성)→G-118, Item 17(인시던트)→G-120. NEW-GAP P1 7개(G-128 셋업가이드·G-129 빌드순서·G-130 SPA배포·G-131 URL전환·G-133 비용추정·G-134 모니터링·G-135 마이그레이션·G-137 DoD)·P2 4개(G-132 시드데이터·G-136 버저닝·G-138 `CONTRIBUTING.md` 예정). |
| 2026-06-30 | **G-95~G-104 DONE** | 상태머신 엣지케이스 10개 + 스크립트 버전 히스토리 스펙 완성 (총 11개 파일 수정). (1~6) Room.md(G-95 방인원초과·G-96 방삭제중참가자)·Participant.md(G-97 2기기동시접속)·WebRTC.md(G-98 ICE타임아웃·G-99 코덱협상실패)·Avatar.md(G-100 메모리부족)·HostAuthority.md(G-101 호스트위임거절)·Script.md(G-102 동시편집충돌·G-103 삭제중사용) 각 Edge Case 추가. (7~8) ScriptPanel.md(G-104 VersionHistoryPanel 계약서 신규 섹션)·DATA-SCHEMA.md(script_versions 테이블 신설, UNIQUE(script_id, version_num), 버전 생성 정책 명시). (9) GAP-MATRIX.md: G-95~G-104 상태 DRAFT→DONE으로 변경 + 진행 로그 추가. 모든 P0/MVP 엣지케이스 커버 완료. |
| 2026-06-30 | **G-122·G-123·G-124·G-126 DONE** | 4개 기술 스펙 완성 (미디어·ICE서버·MediaPipe·Sentry). (G-122) [[MediaConfig]] 신규 작성 — 8섹션 (LiveKit Audio/Video 설정·fal.ai 출력 포맷·Whisper API·MediaRecorder 코덱 감지·ffmpeg.wasm 합성·Vite 주의사항·파이프라인 체크리스트). (G-123) `PLATFORM-ARCHITECTURE.md` §7.7 WebRTC ICE 서버 신설 — 5항 (MVP 판정·ICE 우선순위 표·LiveKit 설정 코드·coturn 셀프호스트 기본 설정·연결 실패 디버깅·스케일 판정 기준). (G-124) [[MediaPipeConfig]] 신규 작성 — 8섹션 (Full vs Lite 선택·WASM 변종·자동 선택·브라우저 확인·로드 전략·FaceLandmarker 초기화·iOS Safari 키보드 폴백·Vite 설정·MUST NOT 체크리스트). (G-126) [[SentryConfig]] 신규 작성 — 13섹션 (설치·환경별 설정·초기화·플러그인·환경변수·에러바운더리·PII 필터링·성능추적·Replay·무료/유료 판단·배포 체크리스트·MUST NOT). 합계 3,200줄 신규 작성. |
| 2026-06-30 | **G-85~88·G-108·G-111·G-116·G-120·G-121·G-125 DONE** | P0 7개 일괄 완료 (Opus 6 병렬 에이전트). (G-85~88) docs/legal/ 신규 생성, 법적 문서 5개 1,575줄 (ToS·PP·DMCA·UGC-OWNERSHIP·DATA-EXPORT) — 개인정보보호법·GDPR·저작권법 조문 기반, fal.ai/LiveKit/R2/Stripe 제3자 명시. (G-108) contracts/ErrorBoundary.md 신규 — 5단계 경계 배치·정적 폴백·Sentry PII 필터·리셋 메커니즘. (G-111) specs/TestStrategy.md 신규 — Vitest+Playwright 3층 70% coverage, MSW·supabase test project·PixiJS canvas-mock 전략. (G-116) specs/AccessibilityPolicy.md 신규 — WCAG 2.1 AA 선언, 6개 색상 대비 실수치(warm-white/stage-night 19.5:1), 컴포넌트별 ARIA 매핑, prefers-reduced-motion 훅. (G-120) specs/BackupDisasterRecovery.md 신규 — Supabase PITR·R2 버저닝·RPO 24h·RTO 4h·시나리오별 복구 절차. (G-121) specs/CommunityGuidelines.md 신규 — 허용/금지 콘텐츠·3단계 조치·14일 이의제기·AI 영상 특별정책. (G-125) SecurityPolicies.md §15→§16 번호 수정 + §17 신설(Sentry beforeSend PII 마스킹·90일 보존·console 금지 패턴). |
| 2026-06-30 | **G-110·G-112·G-119·G-135 DONE** | P1 4개 스펙 완성 (번들전략·FSM검증·네트워크적응·마이그레이션). (G-110) PLATFORM-ARCHITECTURE.md §7.5 번들 전략 신설 (Vite manualChunks 청크 분리·React.lazy Suspense·rollup-plugin-visualizer·목표 200KB gzip). (G-112) docs/specs/_FSM-VALIDATION.md 신규 (Zustand FSM 자동 검증, @xstate/test 미채택 이유, Vitest 전이 매트릭스 패턴, RoomFSM/DubSessionFSM 예시, TypeScript 디스크리미네이티드 유니언, robot3 옵션). (G-119) docs/specs/NetworkAdaptiveQuality.md 신규 (LiveKit setPublishingQuality() API·VideoQuality enum, ConnectionQualityChanged 이벤트·ConnectionQuality enum, Simulcast 3단계 레이어, 자동 조정 전략·useNetworkQuality 훅·UI 표시). (G-135) docs/specs/MigrationStrategy.md 신규 (supabase migration 워크플로·링크 프로젝트 배포·DOWN 마이그레이션 수동관리·드리프트감지·3단계 제로다운타임 패턴·배치 UPDATE·실제 예시). |
| 2026-06-30 | **G-89·G-91·G-92·G-93·G-94·G-127 DONE** | P1 6개 스펙 완성 (아바타·모더레이션·신고·폴백). (G-89) contracts/AvatarAutorig.md 신규 — 3탭(업로드·프리셋·선택) 아바타 획득 UI, Vtube 파이프라인 위임, rig.json 전달. (G-91) VgenPanel.md §3.1 거절 UX 추가 — VIOLENCE/EXPLICIT/HATE/COPYRIGHT/UNCLEAR 5개 카테고리, 수정 가이드, 빨간 테두리 프롬프트. (G-92) Vgen.md 상태 전이 확장(FLAGGED→APPEAL_PENDING→DONE/FLAGGED_FINAL) + VgenPanel.md §1.2 appeal UI 추가 — Realtime 토스트, appeal 모달, 최소 20자 검증, 72시간 SLA. (G-93) SecurityPolicies.md §18 신고 피드백 루프 신설 — 접수 확인(즉시)·처리 상태(5가지)·SLA(P1 24h, P2 72h)·피신고자 통보·이의 제기·reports_appeals 테이블. (G-94) contracts/_INDEX.md 로딩·에러 표준 추가 — StandardLoadingErrorProps 인터페이스, Skeleton UI, 에러 메시지 패턴, 24개 비동기 컴포넌트 대상. (G-127) PLATFORM-ARCHITECTURE.md §7.6 Progressive Enhancement 폴백 신설 — WebGL2→1→정적, MediaPipe Full→Lite→키보드, JS/WebRTC 필수, 구현 체크리스트 포함. |
| 2026-06-30 | **G-139~G-149 등록+완료 (G-148 LATER)** | 9차 분석 — 어떻게 만들지·어떻게 운영할지 35개 항목 → 10개 신규 P1 + 1개 P2 LATER. COVERED 9개: G-129(의존성)·G-111(테스트)·G-134(모니터링)·G-133(비용)·G-114(지원채널)·G-121(커뮤니티)·G-133+G-118(비용모델). 산출 10개: (G-139) PLATFORM-ARCHITECTURE.md §12 폴더구조·별도 레포 결정·feature폴더·barrel export 정책. (G-140) VITE-CONFIG.md 전체 — @tailwindcss/vite 플러그인·manualChunks·path alias·tsconfig·.env.example. (G-141) MILESTONES.md — Phase 0~4 AC·검증 시나리오·타임라인. (G-142) CODING-CONVENTIONS.md — 파일명·Zustand 슬라이스·DataChannel 디스패처·async 에러처리·컴포넌트 체크리스트. (G-143) TestStrategy.md §10 크로스컴포넌트 통합 시나리오 5개 (Chat→Realtime·VGEN폴링·크레딧동시성·FeatureFlag·HostAuthority). (G-144) MonitoringDashboard.md §알림임계값 — 8개 메트릭 임계값·Sentry Alert 룰 3개·수동 확인 주기. (G-145) INCIDENT-PLAYBOOK.md — P0~P3 정의·6단계 절차·런북 3개·포스트모템 템플릿. (G-146) SUPPORT-PLAYBOOK.md — FAQ 6개·버그리포트 프로세스·크레딧 환불 SQL. (G-147) MODERATION-OPS.md — 큐 처리 절차·조치 종류·거절기준 세분화·이의제기 72h SLA·주간 리포트. (G-149) SECURITY-OPS.md — API 키 90일 로테이션·npm audit 월간·RLS 분기 검토·초기 체크리스트 10항목. |
| 2026-06-30 | **G-150~G-164 등록 (G-160·G-161 즉시 DONE)** | 10차 분석 — 사용자 여정 전체 시뮬레이션 + 문서 간 모순 (Opus 분석). COVERED 5개: G-113(인앱도움말)·G-89(AUTORIG contract)·SEC-05(연령확인)·G-159(OAuth불일치→G-153으로 해소)·G-161(임시음소거→HOST-08 통합). 즉시 DONE 2개: G-160(MOB-01 모바일→뷰어 리다이렉트 정책 명시)·G-161(HOST-08 통합). FEATURE-SPEC 신규 항목 14개: AUTH-04/05/06(P0)·AUTH-02b/02c(P1)·PROFILE-01/02/03 섹션 신설·ROOM-20/21·HOST-08~11·SET-14·MOB-01 정책 명시·페이지맵 PROFILE 추가. RESEARCH 10개(G-150~158·G-159): ProfilePage 계약서·SettingsPage Account/Security탭·HostConsole 큐/채팅안전·서비스상태페이지·ViewerGate 계약서·PLATFORM-ARCHITECTURE §4 주석. LATER 3개(G-162~164): 콘텐츠라이브러리·투표폴·팁구독제. |
| 2026-06-30 | **G-150·G-151·G-152·G-156 DONE** | P0 3개 + P1 1개 스펙 완성. (G-150) contracts/ProfilePage.md 신규 작성 (PROFILE-01~03: display_name·bio·avatar_url·profile_visibility·R2 presigned URL 업로드·RLS·공개범위 3종·알림 SSOT). _INDEX.md 29→30개 갱신. (G-151) SettingsPage.md Tab 6 Security 신설 — 이메일 변경: updateUser({ email }) 인증 이메일 발송·비밀번호 변경: 재인증→updateUser({ password })·OAuth 전용 계정 identities 감지·비밀번호 항목 숨김. (G-152) SettingsPage.md Tab 7 Account 신설 — 데이터 내보내기: `POST /functions/v1/data-export-request`·계정 삭제: 2단계 모달(삭제 항목 미리보기+30일 유예 안내)+재인증+`rpc('soft_delete_user')` 인자 없음+signOut+navigate('/'); users.deleted_at 소프트 삭제+pg_cron 30일 영구삭제. DATA-SCHEMA 반영됨: users.deleted_at·notification_prefs·profile_visibility·bio. (G-156) SettingsPage.md Tab 8 Notifications 신설 + ProfilePage.md §알림 설정 SSOT 공유 — users.notification_prefs JSONB 단일 컬럼, 4개 토글(room_invite·room_scheduled·room_full·credit_low). |
| 2026-06-30 | **DATA-SCHEMA users 컬럼 4개 추가** (G-150~152·156 연계) | DATA-SCHEMA.md §1.1 users 테이블에 신규 컬럼 4개 추가: (1) `bio TEXT` — 최대 120자 CHECK, NULL 허용 (PROFILE-01). (2) `profile_visibility TEXT DEFAULT 'public'` — CHECK ('public'|'connected'|'private'), 공개범위별 RLS 정책 명시 (PROFILE-02). (3) `notification_prefs JSONB DEFAULT '{...}'` — room_invite/room_scheduled/room_full/credit_low 기본값 포함 SSOT (SET-14/PROFILE-03). (4) `deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL` — 소프트 삭제, 30일 유예 후 pg_cron 영구 삭제 스케줄 추가 (AUTH-05). RLS 정책 5개 추가: SELECT/UPDATE WHERE deleted_at IS NULL·public/connected/private 접근 매트릭스. |
| 2026-06-30 | **G-165~G-169 DONE** | 사용자 불안 해소 UX 5개를 기존 계약서에 얇게 반영. GreenRoom 최종 3초 미리보기, 초대 메시지 템플릿, 호스트 경고→임시뮤트→강퇴 사다리, 모바일 viewer 반응 툴바, VGen/녹화 최종 확인·취소/폐기 경로 추가. |

| 2026-07-01 | **Cluster 3: G-195~G-203 16차분석 + G-204~G-209 17차분석** | Phase 2 Fix. GAP-MATRIX.md (1) 16차 분석 섹션 신설(G-195~203, 8개 기능 갭+1개 LATER). (2) 17차 분석 섹션 신설(G-204~209, 온보딩·씬이벤트 Feature ID 6개). FEATURE-SPEC.md: ONBOARDING 섹션 신규 생성(ONBOARDING-01/02/03 P0/P0/P1), ROOM 섹션에 ROOM-26/27(P1) 추가, 기존 PROFILE-04/05/JAPAN-01~03/ROOM-25/INF-08 확정. 산출물: contracts/FriendSystem·NetworkStatusIndicator.md, specs/RefundPolicy.md 신규(이미 존재). |
| 2026-07-01 | **gap-find 3라운드: G-210~G-246 (18차 분석)** | 4역할 병렬 Find(보안 0건·정합성 17건·기능갭 10건·운영 10건) → 직접검증(자체분류 P0 10건 중 2건 오탐 판정 후 폐기, 8건 P1로 재분류) → 4클러스터 Opus 병렬 Fix. 상태머신 9개 파일(HostAuthority/WebRTC/Avatar/Participant/Room/Onboarding/StageMode/Script/Tracking+AvatarCanvas) 다이어그램·전이표 보강, 컴포넌트 10개 계약서(DubRecorder 전체재촬영 로직 등) 명세 보강, 운영 8개 문서(DEPLOY 롤백·마이그레이션 복구·비용알림 등) 보강. **부수 발견**: `scripts/check-contract-docs.mjs`의 GAP 카운터·BLOCKED 탐지 정규식이 볼드 ID(`**G-210**`)를 못 읽어 16~18차(139개 행)가 진행률 집계·구현착수게이트 양쪽에서 누락되던 버그 발견·수정(정규식 2곳). 수정 후 `docs:health` GAP 카운트 86/21 → 209/36/1(DONE/LATER/RESEARCH)로 정정. |
| 2026-07-01 | **문서관리 스킬 세팅 + 스코프 정합화** | harness-template의 doc-sync/big-task/change-impact-map/session-handoff(기존 미커스터마이징 복사본 발견→ChatterBox 경로로 전면 재작성) + thin-doc-update/evidence-review/api-contract-guard(신규 이식) 총 7종을 `.claude/skills/`·`.agents/skills/`에 세팅, `.claude/skills/README.md` 인덱스 신설. Vtube 프로젝트 관례(근본원인 로그·삭제금지 아카이브)를 `CODING-CONVENTIONS.md §10`에 반영. **부수 발견**: `docs/status/AGENT-OPS.md` 일간 체크리스트가 앱 구현 Phase 확인 시 랜딩페이지 전용 `docs/PROJECT-STATUS.md`를 잘못 참조 → `IMPLEMENTATION-ORDER.md`+`GAP-MATRIX.md`로 정정, `PROJECT-STATUS.md` 상단에 스코프 경고 추가. `doc-health-audit`/`doc-health-check` 중복은 README에 정리 예정으로만 기록(미해결). |
| 2026-07-01 | **gap-find 4라운드: G-247~G-259 (19차 분석, 홍보·그로스 준비도)** | 4역할 병렬 Find(채널전략/메시지정합성/콜드스타트-바이럴/리스크-CS) → 직접검증(자체분류 P0 4건 전부 근거는 정확했으나 '코딩 블로킹' 기준 미달로 P1 재분류) → 5클러스터 Opus 병렬 Fix. GO-TO-MARKET.md 신규, MILESTONES.md Phase5, CONTENT-GUIDE.md 카피검증규칙+일본규제체크리스트, legal/FANART-POLICY.md 신규+TERMS-OF-SERVICE.md AI고지조항, SUPPORT-PLAYBOOK.md 홍보스파이크CS모드, PITCH-READINESS.md 일본법무담당자표. (G-247~G-254, G-251 기존G-75 갱신: DONE 7개+1개갱신, G-255~G-259: LATER 5개) |
| 2026-07-01 | **G-247 보강: 홍보 자동화 사례 조사(Meta API/Manus)** | `/Users/family/jason/{mungmungfit,TaillogToss,vibehub-media}` 3개 자매 프로젝트의 실제 운영 중인 Instagram/Threads/YouTube 자동화를 직접 대조 조사 → `GO-TO-MARKET.md §5` 신설. 핵심 결론: (1) Manus 경유(mungmungfit)보다 Meta Graph API 직접 호출(TaillogToss·vibehub-media)을 채택 — Manus도 Claude와 동일하게 샌드박스 제약을 받아 "메타 특권 접근"이 검증 불가한 블랙박스이며, TaillogToss는 이를 "L4: Manus AI 미도입"으로 잠금 결정한 선례가 있음. (2) 채널 실현성(vibehub-media 실측): Threads 9/10(1순위, App Review 불필요)·YouTube 9/10(단 public 자동업로드는 OAuth 앱검증 2~6개월 소요 → private 자동업로드+수동 공개전환으로 우회)·Instagram Reels 6/10(App Review 필요, vibehub-media는 결국 폐기). (3) 공통 삽질: 자동화 프롬프트 작성 완료가 실제 cron 트리거 셋업과 별개(TaillogToss B5), 메타 앱 등록·토큰발급은 사람만 가능한 선행 단계. ChatterBox 실행순서: Threads 직접 API(Phase 0과 병행 착수) → Instagram 당분간 수동 → YouTube는 VGEN 클립 재활용(별도 TTS/Remotion 파이프라인 불필요). |
| 2026-07-01 | **G-247 보강: 홍보 자동화 레퍼런스 코드 이식** | `docs/reference/marketing-automation/`(신규 12개 파일) — TaillogToss `supabase/functions/{publish-to-threads,seed-threads-from-blog,collect-social-insights,publish-to-instagram,_shared/marketingPiiGuard}` + `.claude/automations/marketing-{threads-publish,threads-token-refresh,instagram-publish}.prompt.md` + `docs/marketing/env-vars.md`, vibehub-media `packages/media-engine/src/publish/{youtube-api,youtube-local}.ts` + `apps/backend/src/workers/run-youtube-setup.ts`를 원본 그대로 복사(Manus 경유 mungmungfit 코드는 §5 채택 근거에 따라 미이식). README.md에 이식 시 재작성 필요 항목(의존 파일 미이식·테이블명 재정의·PII 패턴 도메인 재정의·cron 트리거 별도 필요) 명시. `docs/INDEX.md`에 레퍼런스 항목 등록. 실제 코드 실행은 Phase 2 착수 후. |
| 2026-07-01 | **LATER 스캔 + 상태 모순 수정 + 검색성 개선** | "개발 예정인데 어떻게 만들지 없는 문서" 스캔 요청에 대응. (1) 파일 상단에 `## LATER 전체 목록` 요약 섹션 신설(40건, ID·항목·섹션 3열, grep 없이 한눈에 스캔 가능). (2) G-77(친구 온라인 상태) `LATER`→`DONE` 정정 — `contracts/FriendSystem.md` §Realtime `friends_presence` 채널로 이미 구현돼 있었는데 상태 갱신이 누락됐던 stale 항목(원문 대조로 확인). (3) G-78(크리에이터 팔로우·구독) 범위 축소 — "팔로우" 자체는 G-195로 DONE이지만 "구독" 개념과 "공연 시작 알림"은 FriendSystem.md L75 "알림 전송 (optional, P2)" 스텁만 있고 실제 트리거 스펙 없음을 명시. **범위 밖(의도적 보류)**: LATER 40건 중 이 둘을 제외한 38건은 P2/"지금 안 채워도 됨"으로 문서 자체가 이미 명시한 의도된 지연이라 스펙 선작성 안 함(YAGNI, Phase 0 미착수). `SEED-DATA.md`(G-132·148·184·188 참조)·`CONTRIBUTING.md`(G-138 참조) 2개 문서는 파일 자체가 없음을 `find`로 확인했으나 착수는 보류. |

---

## 회의 운용
