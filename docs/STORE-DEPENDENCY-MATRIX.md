---
tags: [guide]
---

# STORE-DEPENDENCY-MATRIX — Contract ↔ Zustand Store SSOT

> Status: SSOT (store 필드명·read/write 경계)
> Updated: 2026-06-29
> Rule: 계약서에 store 필드를 추가하면 이 표에 read/write 방향과 canonical field name을 함께 남긴다.

## 목적

컴포넌트 계약서가 어떤 store의 어떤 필드를 읽고 쓰는지 추적한다. 같은 개념이 `dubbingState`, `dubState`, `credit_balance`처럼 다른 이름으로 번지는 것을 막는 용도다.

## Canonical Field Names

| 도메인 | Canonical | 금지/별칭 | 비고 |
|---|---|---|---|
| Room id | `roomStore.currentRoomId` 또는 `roomStore.currentRoom.id` | `current_room_id`, `room_id` store 필드 | DB/API에서는 `room_id`, store/UI에서는 camelCase |
| Room connection | `roomStore.connectionState` | `connection_state` store 필드 | 값은 `'connecting' | 'connected' | 'disconnected'` |
| Current user | `userStore.userId` | `current_user_id`, `user_id` store 필드 | DB/API에서는 `user_id` |
| Stage background URL | `stageStore.backgroundUrl` | `stageStore.background_url`, `stageStore.background` | DB/API/DataChannel에서는 `background_url` |
| Stage mode | `stageStore.mode: 'normal' | 'vgen' | 'dub'` | `'dubbing'`, `'recording'` | VGen/DUB 동시 활성 금지. 전환은 `state-machines/StageMode.md` 기준 |
| Audio mixer (ROOM-08) | `audioStore.masterVolume`, `audioStore.participantVolumes` | store 에 SDK 객체·`volume_map` | 적용은 `useLiveKitRoom` 브리지(`RemoteParticipant.setVolume`) — store 는 SDK 미보유(§2) |
| VGEN-07 generated-video dubbing | `vgenStore.dubbingState` | `dubState` | 생성영상 위 더빙 전용. 값은 `'idle' | 'dubbing' | 'capturing' | 'done' | 'failed'` |
| DUB existing-video recording | `dubStore.recordingState` | `vgenStore.dubbingState` 재사용 | 기존 영상 기반 DUB-04 전용. VGEN-07과 store를 공유하지 않는다 |
| Credits | `credits.balance` | `credit_balance` | DB/edge RPC 반환도 nested `credits.balance`로 문서화 |
| VGen job status | `vgen_jobs.status` | `DONE`, `done`, `completed`, `ready`, `rejected` 혼용 | DB canonical은 `pending | generating | done | failed | flagged`. `moderating/storing`은 UI/FSM 파생 상태 |
| Media URL | `media_assets.r2_key` + signed URL RPC | `publicUrl`, `getPublicUrl()` | R2 공개 URL 금지 |

## Contract Store Matrix

| Contract | Reads | Writes | Notes |
|---|---|---|---|
| `AuthPage.md` | `userStore.session`, `userStore.profile` | `userStore.setSession`, `userStore.setProfile` | DataChannel 없음 |
| `AgeGate.md` | `userStore.id`, `userStore.ageBand`, `userStore.ageAttestedAt`, `routeStore.redirectTo` | `userStore.setAgeGateResult` | 생년월일 원문 저장 금지. 서버 재검증은 Edge Function별 필수 |
| `ViewerGate.md` | `userStore.id`, `userStore.isAnonymous`, `roomStore.currentRoomId` | `roomStore.setGateResult` | `/rooms/:id` role·device 판정. 모바일은 `MobileViewer`, actor는 `GreenRoom`, viewer는 read-only room 경로 |
| `LobbyPage.md` | `userStore.profile`, `roomStore.rooms`, `trackingStore.permissionState` | `roomStore.createRoom`, `roomStore.joinRoom`, `trackingStore.setPermissionState` | 방 생성/초대 링크는 서버 검증 우선 |
| `GreenRoom.md` | `userStore.profile`, `roomStore.currentRoom`, `trackingStore.calibration`, `audioStore.devices` | `trackingStore.saveCalibration`, `audioStore.setDevice`, `roomStore.markReady` | LiveKit 토큰 발급 전 onboarding gate |
| `AvatarCanvas.md` | `trackingStore.blendshapes`, `participantStore.participants`, `roomStore.connectionState` | `trackingStore.setRenderHealth`, `participantStore.setAvatarHealth` | PixiJS/WebGL health는 Ghost Speaker 감지에 사용 |
| `ParticipantSlot.md` | `participantStore.participants`, `stageStore.slots`, `stageStore.currentCue`, `audioStore.levels` | `participantStore.setSlotHealth`, `stageStore.ackSlotEvent` | 슬롯 수 canonical은 `StageLayout.md` 기준 |
| `ScriptPanel.md` | `scriptStore.script`, `stageStore.currentCue`, `roomStore.hostId` | `scriptStore.updateCue`, `stageStore.advanceCue` | `cue_advance` 권한은 host/backup host만 |
| `ReactionWheel.md` | `reactionStore.slots`, `reactionStore.floats` | `reactionStore.setSlots`, `reactionStore.addFloat`, `reactionStore.removeFloat` | 송신=`send-reaction` Edge 릴레이(서버 broadcast·sender auth 확정), 수신=`reaction` 토픽 **서버발만**. floats 휘발성·미영속, slots 는 localStorage 커스터마이즈 |
| `RoomView.md` | `roomStore.currentRoom`, `roomStore.hostId`, `stageStore.mode`, `participantStore.participants`, `vgenStore.activeJob` | `roomStore.setConnectionState`, `stageStore.applyAuthorityMessage`, `participantStore.upsertParticipant` | DataChannel dispatcher 단일 진입점 |
| `HostConsole.md` | `roomStore.hostId`, `stageStore.slots`, `stageStore.backgroundUrl`, `stageStore.mode`, `scriptStore.queue`, `participantStore.participants`, `vgenStore.activeJob`, `recordingStore.activeRecording` | `stageStore.setSlot`, `stageStore.setBackground`, `stageStore.advanceCue`, `roomStore.transferHost`, `participantStore.setMutedUntil`, `chatStore.sendSystemMessage`, `recordingStore.startStop`, `vgenStore.approveOrCancel` | host transfer epoch 필수. G-167 safety ladder는 warning/system message + timed mute. HOST-12 Stage Manager Overlay는 같은 action APIs 재사용 |
| `ChatPanel.md` | `chatStore.messages`, `roomStore.currentRoom`, `participantStore.participants` | `chatStore.sendMessage`, `chatStore.sendReaction` | `ROOM-19` reaction은 `message_type='reaction'` |
| `ChatOverlay.md` | `chatStore.overlayMessages`, `participantStore.positions` | `chatStore.expireOverlayMessage` | TTL 기반 표시, DB 원장과 분리 |
| `MainViewComponent.md` | `stageStore.mainViewSource`, `stageStore.mode`, `vgenStore.activeResult` | `stageStore.setPlaybackHealth`, `stageStore.refreshSignedUrl` | signed URL 403 재발급 필요 |
| `AudioMixer.md` | `audioStore.tracks`, `audioStore.levels`, `participantStore.participants` | `audioStore.setGain`, `audioStore.setUplinkHealth` | 로컬 UI와 원격 uplink health 분리 |
| `TimedTurnsProgressBar.md` | `stageStore.currentCue`, `scriptStore.queue` | 없음 | 파생 표시 전용 |
| `PresenceAvatarStack.md` | `participantStore.participants`, `participantStore.presence` | 없음 | 표시 전용 |
| `ModelSelector.md` | `userStore.models`, `userStore.selectedModel` | `userStore.setSelectedModel` | 모델 소유권 RLS 필요 |
| `AvatarAutorig.md` | `modelStore.uploadProgress`, `modelStore.uploadStatus`, `modelStore.uploadError`, `userStore.models` | `modelStore.startUpload`, `modelStore.cancelUpload`, `modelStore.retryUpload`, `modelStore.completeUpload`, `userStore.setSelectedModel` | 아바타 업로드/프리셋/선택 UI. 리깅 완료 전 렌더 금지 |
| `CalibrationWizard.md` | `trackingStore.permissionState`, `trackingStore.calibration` | `trackingStore.saveCalibration`, `trackingStore.setPermissionState` | 민감 카메라/얼굴 정보 최소 보존 |
| `SceneBackground.md` | `stageStore.backgroundUrl`, `stageStore.sceneParticles` | `stageStore.setBackgroundHealth` | 배경/파티클은 room-authority로만 동기화 |
| `VgenPanel.md` | `vgenStore.promptDraft`, `vgenStore.activeJob`, `vgenStore.dubbingState`, `stageStore.mode`, `credits.balance` | `vgenStore.patchPrompt`, `vgenStore.setActiveJob`, `vgenStore.setDubbingState`, `stageStore.setMode('vgen'|'dub'|'normal')` | 클라이언트 FAL 직접 호출 금지. `vgenStore.dubbingState`는 생성영상 더빙(VGEN-07)만 |
| `VgenExport.md` | `vgenStore.activeJob`, `vgenStore.roomArtifacts`, `credits.balance`, `roomStore.currentRoom` | `vgenStore.setExportState`, `vgenStore.refreshSignedUrl`, `vgenStore.upsertRoomArtifact` | R2 public URL 금지, 완성물은 `room_artifacts`로 방/내 작품함에 남김 |
| `RightPanel.md` | `chatStore.messages`, `scriptStore.script`, `vgenStore.activeJob`, `vgenStore.dubbingState`, `roomStore.hostId` | `chatStore.sendMessage`, `scriptStore.updateCue`, `vgenStore.patchPrompt`, `vgenStore.setDubbingState` | 5탭 컨테이너, 새 DataChannel 금지 |
| `SettingsPage.md` | `settingsStore.audio`, `settingsStore.hotkeys`, `settingsStore.quality`, `settingsStore.credits.balance`, `userStore.profile` | `settingsStore.saveAudio`, `settingsStore.saveHotkeys`, `settingsStore.saveQuality`, `userStore.updateProfile` | `credit_balance` 별칭 금지 |
| `StageLayout.md` | `stageStore.slots`, `stageStore.mode`, `participantStore.participants`, `roomStore.capacity` | `stageStore.setLayoutHealth`, `stageStore.applyResponsiveLayout` | MVP는 6 actor 슬롯. 8슬롯은 viewer/guest 확장용 P1 이후, OBS는 P2 방송 송출 옵션 |
| `DubSessionSelector.md` | `dubStore.uploadState`, `dubStore.transcriptionState`, `dubStore.activeSession`, `dubStore.uploadProgress`, `stageStore.mode`, `userStore.isHost` | `dubStore.startUpload`, `dubStore.startTranscription`, `dubStore.setUploadState`, `dubStore.setUploadProgress`, `dubStore.setActiveSession` | R2 업로드 + Whisper STT 자동 호출, C6 롤백 |
| `DubRoleAssigner.md` | `dubStore.activeSession`, `dubStore.tracks`, `dubStore.roleVersion`, `dubStore.rolesLockedAt`, `dubStore.consentStatus`, `roomStore.participants`, `userStore.isHost` | `dubStore.assignRole`, `dubStore.lockRoles`, `dubStore.requestConsent` | H12 역할 잠금 + consent 게이트 (§11) |
| `DubRecorder.md` | `dubStore.activeSession`, `dubStore.tracks`, `dubStore.recordingState`, `dubStore.currentTrackId`, `dubStore.currentTimeMs`, `localBackupStore.pendingChunks`, `stageStore.mode`, `userStore.userId` | `dubStore.startRecording`, `dubStore.stopRecording`, `dubStore.submitTrack`, `dubStore.setCurrentTimeMs`, `localBackupStore.persistChunk`, `localBackupStore.markUploaded` | 원본 영상 동기 + 내 차례 녹음, MediaRecorder WebM. ROOM-23 local backup chunks는 IndexedDB/File System Access 우선 |
| `DubCompositor.md` | `dubStore.activeSession`, `dubStore.tracks`, `dubStore.compositingState`, `dubStore.compositingProgress`, `dubStore.output`, `stageStore.mode`, `userStore.isHost` | `dubStore.startCompositing`, `dubStore.closeSession`, `dubStore.setCompositingState`, `dubStore.setOutput`, `stageStore.setMode('normal')` | ffmpeg.wasm/Egress 합성 + R2 다운로드, 90일 보존 |
| `OBSViewer.md` | `obsStore.tokenValid`, `obsStore.roomData`, `obsStore.participants`, `obsStore.expiresAt`, `stageStore.backgroundUrl` | `obsStore.setTokenValid`, `obsStore.setRoomData`, `obsStore.setParticipants`, `obsStore.setExpiresAt`, `obsStore.updateParticipants` | 읽기 전용, LiveKit 연결 없음, obs_viewer_tokens 인증 |
| `MobileViewer.md` | `roomStore.currentRoomId`, `roomStore.participants`, `roomStore.connectionState`, `stageStore.backgroundUrl`, `stageStore.mode`, `chatStore.messages`, `userStore.userId` | `chatStore.sendViewerMessage`, `chatStore.sendViewerReaction`, `roomStore.setConnectionState` | viewer 권한 (`canPublish=false`, `canPublishData=false`), 채팅/반응은 Edge 경유, 트래킹 미지원 (MOB-01), 3탭 레이아웃 |
| `FriendSystem.md` | `userStore.userId`, `friendStore.friends`, `friendStore.followers`, `friendStore.blocked`, `friendStore.onlinePresence`, `relationshipStore.pendingRequests` | `friendStore.setFriends`, `friendStore.setFollowers`, `friendStore.setBlocked`, `friendStore.setOnlinePresence`, `relationshipStore.setPendingRequests` | 친구/팔로우/차단 관리. Supabase Realtime presence 구독, RLS room 차단 검증 연계 |
| `NetworkStatusIndicator.md` | `roomStore.connectionState`, `roomStore.connectionQuality`, `audioStore.uplinkHealth`, `audioStore.downlinkHealth`, `networkStore.status`, `networkStore.latency`, `networkStore.packetLoss` | `roomStore.setConnectionQuality`, `networkStore.updateStatus` | LiveKit ConnectionQuality 이벤트 구독. 1초 moving average, 우상단 fixed overlay |
| `ErrorBoundary.md` | `roomStore.currentRoom`, `userStore.profile`, `stageStore.mode` | `errorStore.capture`, `roomStore.setConnectionState`, `stageStore.setRenderHealth` | 에러 격리와 Sentry 보고. PII 필터 필수 |
| `HelpPanel.md` | `helpStore.isOpen`, `helpStore.activeSection`, `helpStore.expandedSubsections`, `userStore.isHost`, `stageStore.mode` | `helpStore.setIsOpen`, `helpStore.setActiveSection`, `helpStore.toggleSubsection` | 인앱 도움말 전용. DataChannel 없음 |
| `ProfilePage.md` | `userStore.id`, `userStore.display_name`, `userStore.bio`, `userStore.avatar_url`, `userStore.profile_visibility`, `userStore.notification_prefs` | `userStore.patchProfile`, `userStore.setAvatarUrl`, `userStore.setNotificationPrefs` | PROFILE-01~03. 알림 설정은 SettingsPage SET-14와 같은 JSONB |

## Store Ownership

| Store | Owner 문서 | 쓰기 허용 경계 |
|---|---|---|
| `userStore` | `AuthPage.md`, `SettingsPage.md` | Auth/profile/model 선택 |
| `roomStore` | `RoomView.md`, `LobbyPage.md`, `HostConsole.md` | room metadata, host authority, connection state |
| `participantStore` | `RoomView.md`, `ParticipantSlot.md`, `PresenceAvatarStack.md` | participant presence/slot/avatar health |
| `stageStore` | `StageLayout.md`, `HostConsole.md`, `RoomView.md` | stage mode, slots, background, main view, cue state |
| `trackingStore` | `CalibrationWizard.md`, `AvatarCanvas.md`, `GreenRoom.md` | MediaPipe permission/calibration/blendshape health |
| `audioStore` | `AudioMixer.md`, `GreenRoom.md` | devices, gain, uplink health |
| `scriptStore` | `ScriptPanel.md`, `HostConsole.md` | scripts/cues/queue |
| `chatStore` | `ChatPanel.md`, `ChatOverlay.md`, `RightPanel.md` | messages, reactions, overlay TTL |
| `vgenStore` | `VgenPanel.md`, `VgenExport.md`, `RightPanel.md` | prompt draft, jobs, generated-video dubbing, export state |
| `dubStore` | `DubSessionSelector.md`, `DubRoleAssigner.md`, `DubRecorder.md`, `DubCompositor.md` | DUB 세션 생명주기: upload, transcription, roles, recording, compositing, consent |
| `obsStore` | `OBSViewer.md` | OBS 토큰 검증, 읽기 전용 room 데이터 미러 (쓰기 권한 없음) |
| `friendStore` | `FriendSystem.md` | 친구/팔로우/차단 목록, 온라인 presence |
| `relationshipStore` | `FriendSystem.md` | 친구 요청 대기 상태 |
| `networkStore` | `NetworkStatusIndicator.md` | 네트워크 메트릭 (latency, packet loss, quality) |
| `settingsStore` | `SettingsPage.md` | client settings + credits display cache |

## Self Review

- [ ] 새 store 필드는 canonical name 표에 추가했다.
- [ ] 계약서별 read/write 방향이 이 표와 일치한다.
- [ ] DB/API/DataChannel은 `snake_case`, store/props는 `camelCase` 경계를 지켰다.
- [ ] `stageStore.mode`는 `normal|vgen|dub`만 쓴다.
- [ ] 크레딧은 `credits.balance`만 쓴다.
- [ ] URL은 `r2_key`와 signed URL 재발급 경로로만 표현한다.
