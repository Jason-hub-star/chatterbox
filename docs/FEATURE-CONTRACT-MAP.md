---
tags: [hub]
---

# FEATURE-CONTRACT-MAP — Feature ID ↔ 계약서 SSOT

> Status: SSOT (구현 진입 라우팅)
> Updated: 2026-06-29
> Rule: `FEATURE-SPEC.md`에 Feature ID를 추가하면 이 파일에 반드시 매핑한다. 계약서가 아직 없으면 `계약 공백`으로 명시하고 `GAP-MATRIX.md`에 갭을 남긴다.

## 목적

`FEATURE-SPEC.md`의 기능 ID가 어느 계약서·상태머신·스키마에 문서화됐는지 한눈에 찾기 위한 역색인이다. 특히 `ROOM-19`처럼 기능은 확정됐지만 계약 위치가 흩어지기 쉬운 항목은 여기서 먼저 확인한다.

## 매핑 규칙

- Feature ID는 이 문서에 backtick으로 남긴다. 자동 체크러가 누락을 잡는다.
- 계약서가 여러 개인 기능은 사용자 진입점 계약서를 먼저 쓰고, 데이터/상태 문서를 뒤에 둔다.
- `계약 공백`은 허용하되 방치 금지다. 구현 전에는 반드시 계약서 또는 상태머신으로 승격한다.

## Feature → Contract Map

| Feature ID | 계약서 | 상태/데이터 문서 | 상태 |
|---|---|---|---|
| `AUTH-01`, `AUTH-02`, `AUTH-03`, `AUTH-02b`, `AUTH-02c` | `contracts/AuthPage.md`, `contracts/AgeGate.md`, `contracts/LobbyPage.md`, `contracts/GreenRoom.md` | `state-machines/Auth.md`, `state-machines/Onboarding.md`, `specs/supabase-auth.md`, `DATA-SCHEMA.md` | 계약 있음. Discord/X OAuth는 Supabase provider 확장 |
| `AUTH-04`, `AUTH-05`, `AUTH-06` | `contracts/SettingsPage.md` | `state-machines/Auth.md`, `DATA-SCHEMA.md §users.deleted_at`, `docs/legal/DATA-EXPORT.md` | 계약 있음. 로그인 후 보안/계정 탭에서 처리 |
| `AUTH-07` | candidate: `contracts/TwoFactorAuth.md` | `DATA-SCHEMA.md §mfa_secrets`, `Supabase MFA API` | P1 DRAFT. TOTP 기반 2FA, 크리에이터/호스트 대상 우선 |
| `ONBOARDING-01`, `ONBOARDING-02`, `ONBOARDING-03` | `contracts/AuthPage.md` | `ONBOARDING-FLOW.md`, `state-machines/Onboarding.md`, `DATA-SCHEMA.md §users.onboarding_step/preferred_genres` | 계약 있음. ONBOARDING-01은 CinematicIntro, ONBOARDING-02는 GenreSelector, ONBOARDING-03은 dev skip flag |
| `PROFILE-01`, `PROFILE-02`, `PROFILE-03` | `contracts/ProfilePage.md`, `contracts/SettingsPage.md` | `DATA-SCHEMA.md §users.bio/profile_visibility/notification_prefs` | 계약 있음. 알림 설정은 PROFILE-03과 SET-14 공유 |
| `PROFILE-04`, `PROFILE-05` | `contracts/FriendSystem.md` | `DATA-SCHEMA.md §friendships`, `Supabase Realtime presence` | 계약 있음. 친구/팔로우/차단 + 팔로우 알림 |
| `MOD-01`, `MOD-02`, `MOD-03`, `MOD-04` | `contracts/ModelSelector.md`, `contracts/AvatarCanvas.md` | `specs/rig-format.md`, `DATA-SCHEMA.md §models` | 계약 있음 |
| `MOD-05`, `MOD-06`, `MOD-07` | `contracts/CalibrationWizard.md`, `contracts/GreenRoom.md`, `contracts/SettingsPage.md` | `state-machines/Tracking.md`, `ONBOARDING-FLOW.md` | 계약 있음. MOD-07 품질 게이지/표정 리플레이는 GreenRoom 세부 계약 보강 필요 |
| `MOD-08` | `reference/patterns/avatar-forge-pipeline.md`(UI 빌더 계약 겸용) | `DATA-SCHEMA.md §1.9 avatar_jobs`, `API-SURFACE.md` Avatar Forge | 구현 완료(2026-07-09, `features/avatar/CommissionCorner`·`useAvatarJobs`). 남용 게이트(크레딧/레이트리밋) 잔여 |
| `LOB-01`, `LOB-02`, `LOB-03`, `LOB-04` | `contracts/LobbyPage.md` | `state-machines/Room.md`, `DATA-SCHEMA.md §rooms` | 계약 있음 |
| `LOB-05`, `LOB-06`, `LOB-07`, `LOB-08`, `LOB-09`, `LOB-10` | `contracts/LobbyPage.md`, `contracts/GreenRoom.md`, `contracts/MobileViewer.md` | `ONBOARDING-FLOW.md`, `DATA-SCHEMA.md §room_invites/room_reservations/notifications/user_room_history`, `PRODUCT-READINESS.md` | 계약 있음. 초대 role은 actor/viewer만, 모바일/게스트는 viewer 권한. LOB-09는 항상 켜진 데모룸, LOB-10은 연습 방 계약 보강 필요 |
| `ROOM-01` | `contracts/RoomView.md`, `contracts/StageLayout.md`, `contracts/MainViewComponent.md` | `DESIGN-DIRECTION.md`, `state-machines/Room.md` | 계약 있음. 타임라인 동기(±200ms)는 MainViewComponent as-built(vod_sync) |
| `ROOM-02` | `contracts/StageLayout.md`, `contracts/ParticipantSlot.md` | `DESIGN-DIRECTION.md §6.4`, `DATA-SCHEMA.md §room_participants` | 계약 있음 |
| `ROOM-03` | `contracts/AvatarCanvas.md`, `contracts/ParticipantSlot.md`, `contracts/PresenceAvatarStack.md` | `state-machines/Avatar.md`, `state-machines/Tracking.md`, `specs/rig-format.md` | 계약 있음 |
| `ROOM-04`, `ROOM-10` | `contracts/RoomView.md`, `contracts/AudioMixer.md` | `state-machines/WebRTC.md`, `specs/livekit-edge-fn.md` | 계약 있음 |
| `ROOM-05`, `ROOM-06`, `ROOM-07`, `ROOM-08`, `ROOM-09` | `contracts/HostConsole.md`, `contracts/ScriptPanel.md`, `contracts/AudioMixer.md`, `contracts/TimedTurnsProgressBar.md` | `state-machines/HostAuthority.md`, `state-machines/Script.md`, `DATA-SCHEMA.md §scripts` | 계약 있음. ROOM-08 은 AudioMixer as-built(마스터+참가자, BGM defer) |
| `ROOM-11`, `ROOM-12`, `ROOM-13`, `ROOM-23` | `contracts/ParticipantSlot.md`, `contracts/AudioMixer.md`, `contracts/SettingsPage.md`, `contracts/DubRecorder.md` | `state-machines/Participant.md`, `state-machines/WebRTC.md`, `DATA-SCHEMA.md §recordings/dub_tracks`, `API-SURFACE.md` | 계약 있음. ROOM-23은 로컬 chunk 백업 후 R2 업로드 |
| `ROOM-14`, `ROOM-15` | `contracts/ScriptPanel.md`, `contracts/HostConsole.md` | `state-machines/Script.md`, `DATA-SCHEMA.md §scripts` | 계약 있음 |
| `ROOM-16` | `contracts/SceneBackground.md`, `contracts/MainViewComponent.md`, `contracts/HostConsole.md` | `DESIGN-DIRECTION.md`, `DATA-SCHEMA.md §scene_assets` | 계약 있음 |
| `ROOM-17` | `contracts/RightPanel.md`, `contracts/ChatPanel.md` | `DATA-SCHEMA.md §messages`, `contracts/_INDEX.md DataChannel 타입 레지스트리` | 계약 있음 |
| `ROOM-18`, `RT-05` | `contracts/MainViewComponent.md`, `contracts/VgenExport.md`, `contracts/SceneBackground.md` | `DATA-SCHEMA.md §media_assets`, `state-machines/WebRTC.md` | 계약 있음 |
| `ROOM-25` | `contracts/NetworkStatusIndicator.md` | `specs/NetworkAdaptiveQuality.md`, `LiveKit ConnectionQuality` | P1 DRAFT. 우상단 고정 인디케이터, 3단계 품질 표시 |
| `ROOM-26`, `ROOM-27` | `contracts/SceneBackground.md`, `contracts/HostConsole.md`, `contracts/AudioMixer.md` | `DATA-SCHEMA.md §scenes.layers_json/ambient_sound_id`, `PLATFORM-REFERENCE-GAP-MAP.md §1 씬 이벤트` | 계약 있음. ROOM-26은 PNG 레이어 클릭/호버+파티클·사운드 트리거, ROOM-27은 앰비언트 사운드 ON/OFF |
| `ROOM-19` | `contracts/ChatPanel.md`, `contracts/ChatOverlay.md`, `contracts/ReactionWheel.md` | `DATA-SCHEMA.md §messages`, `contracts/_INDEX.md DataChannel 타입 레지스트리`, `RUNTIME-HARDENING-REVIEW.md H13` | 계약 있음. 채팅 반응은 `chat` 채널 `message_type='reaction'`. **액터 라이브 리액션(우클릭 휠)은 별도 구현** `contracts/ReactionWheel.md` — 전용 `reaction` 토픽(chat 아님)·비영속 부동·reliable+rid dedupe(구현됨) |
| `ROOM-20`, `ROOM-21` | `contracts/HostConsole.md`, `contracts/MobileViewer.md`, `contracts/ParticipantSlot.md` | `state-machines/HostAuthority.md`, `specs/livekit-edge-fn.md`, `DATA-SCHEMA.md §room_participants` | 계약 있음. 관객 요청은 viewer 권한 유지 후 호스트 승인 시 actor 승격 |
| `ROOM-22` | `contracts/MobileViewer.md`, `contracts/ChatPanel.md`, `contracts/HostConsole.md` | `DATA-SCHEMA.md §messages`, `specs/SecurityPolicies.md §6.4` | 계약 있음. 관객 투표/폴은 viewer 권한을 넓히지 않고 Edge Function 경유 |
| `ROOM-24` | `contracts/RoomView.md`, `contracts/ScriptPanel.md`, `contracts/DubRecorder.md` | `DATA-SCHEMA.md §recordings/messages`, `state-machines/Script.md` | 계약 있음. 리허설 피드백은 rehearsal mode 전용, 최근 10초 preview 중심 |
| `VGEN-01`, `VGEN-02`, `VGEN-03`, `VGEN-04`, `VGEN-05`, `VGEN-06` | `contracts/VgenPanel.md`, `contracts/RightPanel.md` | `state-machines/Vgen.md`, `DATA-SCHEMA.md §vgen_jobs`, `STACK-COMPARE-VIDEOGEN.md` | 계약 있음 |
| `VGEN-07` | `contracts/VgenPanel.md`, `contracts/RightPanel.md` | `state-machines/Vgen.md`, `DATA-SCHEMA.md §vgen_jobs`, `RUNTIME-HARDENING-REVIEW.md H12` | 계약 있음. 생성영상 위 음성 더빙 (Egress/캡처) |
| `VGEN-08`, `VGEN-09`, `VGEN-10` | `contracts/VgenPanel.md`, `contracts/SettingsPage.md` | `state-machines/Vgen.md`, `DATA-SCHEMA.md §credits`, `specs/SecurityPolicies.md` | 계약 있음 |
| `VGEN-11`, `VGEN-12` | `contracts/VgenExport.md`, `contracts/VgenPanel.md` | `state-machines/Vgen.md §VGEN-11`, `DATA-SCHEMA.md §vgen_jobs` | 계약 있음 |
| `VGEN-13` | `contracts/VgenExport.md`, `contracts/ProfilePage.md` | `DATA-SCHEMA.md §room_artifacts/vgen_jobs/recordings` | 계약 있음. 작품 검색·태그·공개범위는 signed URL과 owner 권한 유지 |
| `DUB-01`, `DUB-01b`, `DUB-02`, `DUB-03`, `DUB-04`, `DUB-05`, `DUB-06` | `contracts/DubSessionSelector.md`, `contracts/DubRoleAssigner.md`, `contracts/DubRecorder.md`, `contracts/DubCompositor.md`, `contracts/RightPanel.md` | `DATA-SCHEMA.md §1.12-1.14`, `state-machines/DubSession.md`, `API-SURFACE.md (translate-dub-script)`, `specs/SecurityPolicies.md §2.2` | 계약 있음. DUB 6개 기능(+DUB-06 대본 자동번역 gpt-4o-mini) + 4개 계약서 + DubSession FSM 완성 |
| `HOST-01`, `HOST-02`, `HOST-03`, `HOST-04`, `HOST-05` | `contracts/HostConsole.md`, `contracts/RoomView.md`, `contracts/StageLayout.md` | `state-machines/HostAuthority.md`, `state-machines/Room.md` | 계약 있음 |
| `HOST-06`, `HOST-07` | `contracts/HostConsole.md`, `contracts/RoomView.md` | `state-machines/HostAuthority.md`, `RUNTIME-HARDENING-REVIEW.md H1/H14` | 계약 있음 |
| `HOST-08`, `HOST-09`, `HOST-10`, `HOST-11`, `HOST-12`, `HOST-13` | `contracts/HostConsole.md`, `contracts/ChatPanel.md`, `contracts/RoomView.md` | `DATA-SCHEMA.md §room_participants/messages`, `state-machines/HostAuthority.md`, `specs/SecurityPolicies.md §6.4`, `specs/livekit-edge-fn.md` | 계약 있음. 채팅/참가자 안전 조치는 호스트 전용. HOST-12는 Stage Manager Overlay, HOST-13은 승계 UX 계약 보강 필요 |
| `SET-01`, `SET-02`, `SET-03`, `SET-04`, `SET-05`, `SET-06`, `SET-07`, `SET-08`, `SET-14` | `contracts/SettingsPage.md`, `contracts/AudioMixer.md`, `contracts/CalibrationWizard.md`, `contracts/ProfilePage.md` | `DATA-SCHEMA.md §expression_presets`, `DATA-SCHEMA.md §users.notification_prefs`, `state-machines/Tracking.md` | 계약 있음 |
| `RT-01`, `RT-02`, `RT-03`, `RT-04` | `contracts/RoomView.md`, `contracts/AvatarCanvas.md`, `contracts/ParticipantSlot.md` | `state-machines/WebRTC.md`, `RUNTIME-HARDENING-REVIEW.md H10` | 계약 있음 |
| `CNT-01`, `CNT-02`, `CNT-03`, `CNT-04`, `CNT-05`, `CNT-06`, `CNT-07`, `CNT-08`, `CNT-09` | `contracts/ScriptPanel.md`, `contracts/ChatPanel.md`, `contracts/RightPanel.md`, `contracts/VgenExport.md` | `DATA-SCHEMA.md §scripts/messages/room_templates/room_artifacts`, `specs/SecurityPolicies.md` | 계약 있음. CNT-09 시드 대본 팩은 SEED-DATA 계약 보강 필요 |
| `OBS-01`, `OBS-02`, `OBS-03`, `OBS-04` | `contracts/OBSViewer.md` | `DATA-SCHEMA.md §obs_viewer_tokens`, `specs/SecurityPolicies.md §7`, `RUNTIME-HARDENING-REVIEW.md H15` | P2 방송 송출 옵션. P0/MVP 스캐폴딩 금지, 구현 시 obs_viewer_tokens 기반 URL만 허용. OBS-04는 임시 클린 모드/캡처 가이드 |
| `JAPAN-01`, `JAPAN-02`, `JAPAN-03` | candidate: `specs/JapanLocalization.md` | `FEATURE-SPEC.md §JAPAN`, `specs/RefundPolicy.md` | P1 DRAFT. JPY 환율·결제수단·연령확인 강화 |
| `ECON-01`, `ECON-02`, `ECON-03` | candidate: `contracts/CreatorEconomy.md` | `COST-ESTIMATE.md §Creator Economy P2 Guardrails`, `PLATFORM-REFERENCE-GAP-MAP.md §크리에이터 경제`, `GAP-MATRIX.md G-164` | P2 기능 ID 등록 완료. 결제·KYC·세금·환불 정책 확정 전 실제 ledger/API 작성 금지 |
| `COM-01`, `COM-02` | candidate: `contracts/CreatorClub.md`, `contracts/LobbyPage.md` | `PLATFORM-REFERENCE-GAP-MAP.md §극단/이벤트/컨테스트`, `GAP-MATRIX.md G-191~G-192` | P2 성장 루프 후보. 초기 구현은 운영자 수동 제출/선별부터 |
| `ANA-01` | `specs/MonitoringDashboard.md`, candidate: `contracts/CreatorDashboard.md` | `MonitoringDashboard.md §Creator Performance Dashboard`, `GAP-MATRIX.md G-193` | P1 제품 분석 표면. 운영 대시보드와 분리, JSONB analytics_events 집계 우선 |
| `EXT-01` | candidate: `contracts/ExternalStreamTriggers.md`, `contracts/HostConsole.md` | `PLATFORM-REFERENCE-GAP-MAP.md §외부 방송 트리거`, `GAP-MATRIX.md G-194` | P2 외부 이벤트 연동. OAuth/webhook allowlist action만 허용, raw payload 실행 금지 |
| `SEC-01`, `SEC-02`, `SEC-03`, `SEC-04`, `SEC-05`, `SEC-06`, `SEC-07`, `SEC-08` | `contracts/AuthPage.md`, `contracts/AgeGate.md`, `contracts/LobbyPage.md`, `contracts/RoomView.md`, `contracts/VgenExport.md` | `specs/SecurityPolicies.md`, `SECURITY-P0-REVIEW.md`, `DATA-SCHEMA.md` | 보안 게이트. SEC-05는 AgeGate UX + Edge Function 재검증 둘 다 필요 |
| `MOB-01`, `MOB-02` | `contracts/MobileViewer.md`, `contracts/StageLayout.md`, `contracts/RightPanel.md`, `contracts/ChatOverlay.md` | `DESIGN-DIRECTION.md`, `PLATFORM-ARCHITECTURE.md §5.2` | 계약 있음. MOB-01 PC 우선 + MOB-02 모바일 뷰어/관전/채팅 |
| `INF-01`, `INF-02`, `INF-03`, `INF-04`, `INF-05`, `INF-06`, `INF-07` | `contracts/SettingsPage.md`, `contracts/RoomView.md`, `contracts/VgenExport.md` | `PLATFORM-ARCHITECTURE.md`, `specs/SecurityPolicies.md`, `RUNTIME-HARDENING-REVIEW.md` | 운영/인프라 게이트 |
| `INF-08` (P1 격상) | `contracts/SettingsPage.md`, candidate: `contracts/PaymentFlow.md` | `specs/RefundPolicy.md` (자동 환불·분쟁신청), `specs/VgenCostAnalysis.md` | P1 DRAFT. 결제·크레딧 구매 + 자동 환불 (VGEN/DUB 실패 시 100% 복구) |

## Self Review

- [ ] `FEATURE-SPEC.md`의 모든 Feature ID가 이 문서에 있다.
- [ ] `계약 공백`으로 표시된 항목은 구현 전에 계약서 또는 상태머신으로 승격했다.
- [ ] `ROOM-19` 같은 DataChannel 확장은 `contracts/_INDEX.md`의 채널 레지스트리와 같은 채널/타입을 쓴다.
- [ ] 기능 구현 PR은 해당 Feature ID 행의 계약서와 데이터 문서를 함께 갱신한다.
