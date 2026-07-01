---
tags: [contract]
---

# COMPONENT-CONTRACTS — 34개 컴포넌트 계약서

> 설계: 34개 컴포넌트의 Props·Store·DataChannel·금지 명세 (핵심 22 + DUB 4 + OBS 1 + Mobile 1 + 인프라 1 + 프로필 1 + 게이트 2)
> Updated: 2026-07-01 (AgeGate.md 신규 등록 — SEC-05 P0 계약 공백 해소)
> Related: state-machines/_INDEX.md, DATA-SCHEMA.md, PLATFORM-ARCHITECTURE.md, ../FEATURE-CONTRACT-MAP.md, ../STORE-DEPENDENCY-MATRIX.md
<!-- opencode: 2026-06-29 - OBSViewer·MobileViewer 등록 (26개 → 28개, OBS/MOB 계약 공백 해소). Coded with OpenCode; high-cost model review recommended. -->

---

## 목적

snack-web의 Vite+React SPA에서 PixiJS(WebGL) + LiveKit(RTC) + Supabase(DB) + Zustand(상태)가 만나는 핵심 컴포넌트의 **계약**을 명시한다.

- **구현자를 위한 필수 요건** (타입, 의존성, 금지)
- **리뷰어를 위한 경계** (뭘 허용하고 뭘 금지할 건지 한눈에)
- **통합 테스트 기준** (컴포넌트 간 메시지 흐름 검증)

---

## 컴포넌트 목록 (34개)

| 파일 | 역할 | Props 주요 입력 |
|---|---|---|
| [AuthPage.md](AuthPage.md) | 로그인/회원가입 orchestrator (이메일·Google OAuth) | 없음 (라우트) |
| [AgeGate.md](AgeGate.md) | 연령 확인 게이트 — 방/데모/녹화/DUB/VGEN/OBS 서버 재검증의 UX 진입점 (SEC-05) | `redirectTo?`, `mode` |
| [ProfilePage.md](ProfilePage.md) | 프로필 편집 (/profile) — 닉네임·자기소개·사진·공개범위·알림 설정 (PROFILE-01~03, G-150) | 없음 (라우트) |
| [ViewerGate.md](ViewerGate.md) | /rooms/:id 진입 role·디바이스 판정 게이트 — 호스트/배우/뷰어/모바일/에러 분기 (G-158) | `roomId`, `inviteCode?` |
| [LobbyPage.md](LobbyPage.md) | 방 탐색·생성·페이셜 게이트·초대링크 | `inviteCode?`, `onError?` |
| [GreenRoom.md](GreenRoom.md) | 입장 전 아바타·소리·배경 미리보기 + 디바이스 검증 | `roomId`, `onEnter`, `onCancel` |
| [AvatarAutorig.md](AvatarAutorig.md) | PNG 파츠 자동 리깅 — ARKit 52 blendshape 매핑 파이프라인 | `modelId`, `rigJson`, `onComplete` |
| [AvatarCanvas.md](AvatarCanvas.md) | 단일 participant 아바타 렌더링 (PixiJS) | `participantId`, `modelId`, `application` |
| [ParticipantSlot.md](ParticipantSlot.md) | participant 슬롯 컨테이너 (아바타+대사+오디오) | `participantId`, `slotIndex`, `roomId` |
| [StageLayout.md](StageLayout.md) | 2/4/6인 자동 배치 엔진 + 슬롯 위치 계산 | `participantCount`, `slots`, `stageMode` |
| [ScriptPanel.md](ScriptPanel.md) | 호스트/배우 공용 스크립트 UI | `roomId`, `scriptId`, `isOpen` |
| [RoomView.md](RoomView.md) | 룸 페이지 orchestrator | `roomId`, `livekitToken`, `livekitUrl` |
| [HostConsole.md](HostConsole.md) | 호스트 전용 제어판 (배경/슬롯/음성/큐) | `isHost`, `roomId`, `isOpen` |
| [ChatPanel.md](ChatPanel.md) | 우측 사이드바 채팅 | `roomId`, `isOpen` |
| [ChatOverlay.md](ChatOverlay.md) | 무대 위 채팅 오버레이 | `messageDuration`, `maxMessages` |
| [MainViewComponent.md](MainViewComponent.md) | 무대 중앙 배경영상 | `roomId`, `initialBackgroundUrl` |
| [AudioMixer.md](AudioMixer.md) | 채널별 음성 볼륨 제어 | `isVisible` |
| [TimedTurnsProgressBar.md](TimedTurnsProgressBar.md) | 큐 예상 소요시간 진행바 | `cueStartTime`, `duration` |
| [PresenceAvatarStack.md](PresenceAvatarStack.md) | 우상단 participant 썸네일 | `maxVisible`, `overflowStyle` |
| [ModelSelector.md](ModelSelector.md) | 아바타 선택 화면 | `onSelected`, `onClose` |
| [CalibrationWizard.md](CalibrationWizard.md) | MediaPipe 얼굴 추적 초기설정 | `onComplete`, `onSkip` |
| [SceneBackground.md](SceneBackground.md) | 배경 씬 + 파티클 오버레이 (개발 예정) | `roomId` |
| [VgenPanel.md](VgenPanel.md) | 협업 프롬프트(메인뷰 하단 z-3) + VGen 상태 탭(우측 패널) + 완성 쇼츠 내보내기(오버레이) | `roomId` |
| [VgenExport.md](VgenExport.md) | 완성 AI 영상 다운로드 + SNS 공유 링크 발급 (VgenStatusTab 내 오버레이) | `jobId`, `videoUrl`, `format`, `roomId`, `onClose` |
| [RightPanel.md](RightPanel.md) | 우측 사이드바 5탭(채팅·대본·VGen·DUB·노트) 컨테이너 + 사운드보드 | `roomId`, `defaultTab?` |
| [SettingsPage.md](SettingsPage.md) | 모달 설정 UI (오디오·웹캠·단축키·언어·품질·노이즈·개인차단·크레딧) | `isOpen`, `onClose`, `defaultSection?`, `isHost?`, `roomId?`, `onSave?` |
| [DubSessionSelector.md](DubSessionSelector.md) | 더빙 세션 생성 UI (MP4 업로드/YouTube URL + Whisper STT 자동 호출) | `roomId`, `onSessionCreated`, `onClose` |
| [DubRoleAssigner.md](DubRoleAssigner.md) | 화자별 역할 배정 + 동의 수집 (consent 게이트) | `dubSessionId`, `roomId`, `onRecordingStart` |
| [DubRecorder.md](DubRecorder.md) | 더빙 녹음 세션 (원본 영상 동기 + 내 차례 녹음) | `dubSessionId`, `roomId`, `onCompositingStart` |
| [DubCompositor.md](DubCompositor.md) | 최종 합성 진행바 + 다운로드 + 공유 링크 | `dubSessionId`, `roomId`, `onSessionClose` |
| [OBSViewer.md](OBSViewer.md) | OBS 방송 출력 전용 뷰어 (투명 배경·크로마키·풀스크린 아바타, obs_viewer_tokens 인증) | `obsToken`, `obsMode`, `targetSlotIndex?` |
| [MobileViewer.md](MobileViewer.md) | 모바일 관전·채팅 전용 뷰어 (하단 3탭, 트래킹 미지원) | `roomId`, `livekitToken`, `livekitUrl` |
| [HelpPanel.md](HelpPanel.md) | 인앱 도움말 패널 — 단축키·FAQ·지원 링크 | `isOpen`, `onClose` |
| [ErrorBoundary.md](ErrorBoundary.md) | React 에러 경계 전략 (5단계 배치·폴백 UI·Sentry PII 필터·리셋) | 설정 문서 (구현 가이드) |

---

## 기능 추가 절차

개발 중 새 기능이 생기면 아래 순서를 지킨다. **순서를 건너뛰면 스키마·컴포넌트 충돌이 나중에 터진다.**

자동 체크: `npm run docs:check`
구현 착수 strict 게이트: `npm run docs:check:strict`
상태판: `npm run docs:health`

- `FEATURE-SPEC.md`의 모든 Feature ID가 `FEATURE-CONTRACT-MAP.md`에 있어야 한다.
- 모든 계약서는 Props / Store / DataChannel / MUST NOT 섹션을 가져야 한다.
- 모든 계약서는 `STORE-DEPENDENCY-MATRIX.md`에 store read/write 행이 있어야 한다.
- `stageStore.mode='dubbing'`, `credit_balance` 같은 금지 별칭은 실패 처리한다.
- strict 모드에서는 `계약 공백`, `GAP-MATRIX` `BLOCKED`, active `DATA-SCHEMA.md` PENDING이 실패 처리된다.

### 4단계 절차

```
⓪ FEATURE-CONTRACT-MAP.md에 Feature ID ↔ 계약서 매핑
   → 계약서가 없으면 "계약 공백"으로 박고 GAP-MATRIX.md에 갭 등록

① DATA-SCHEMA.md PENDING에 체크박스 추가
   → 필요한 테이블/컬럼 명시 (스키마 먼저)

② 이 파일(contracts/)의 해당 컴포넌트 파일에 계약 추가
   → props / Store 의존 / DataChannel / MUST NOT 명시 (인터페이스 먼저)

②-1 STORE-DEPENDENCY-MATRIX.md에 read/write 필드 추가
   → canonical field name과 금지 별칭 확인

③ 코드에 [개발 예정] 주석으로 자리 확보
   → 빈 stub 함수 또는 TODO 블록으로 경계 표시

④ 구현 완료 후
   → PENDING [ ] → [x] 체크
   → 코드의 [개발 예정] 제거
   → 계약서 업데이트 (변경된 props/의존 반영)
   → npm run docs:check 통과
```

---

## 로딩·에러 상태 표준 (G-94)

모든 계약서의 컴포넌트는 다음 표준 Props와 상태를 지원해야 한다 (비동기 데이터 로딩 컴포넌트 대상).

### 표준 Props (선택적, 필요한 계약서에 명시)

```typescript
interface StandardLoadingErrorProps {
  isLoading?: boolean;           // 데이터 로드 중 (Skeleton 표시)
  error?: Error | null;          // 에러 객체 (ErrorBoundary 또는 인라인 표시)
  onRetry?: () => void;          // 에러 시 재시도 콜백
  loadingFallback?: ReactNode;   // 커스텀 로딩 UI (없으면 Skeleton 기본값)
}
```

### 표준 상태별 UI 규칙

| 상태 | UI | 비고 |
|------|-----|------|
| `isLoading: true` | Skeleton (컴포넌트 크기와 동일) | `animate-pulse` Tailwind 클래스 |
| `error` + `onRetry` | 에러 메시지 + "다시 시도" 버튼 | `<ErrorBoundary>` 래핑 권장 |
| `error` + no `onRetry` | 에러 메시지만 | 재시도 불가능한 에러 (권한 없음 등) |
| 정상 | 컴포넌트 정상 렌더 | — |

### 에러 표시 패턴

#### 인라인 에러 (작은 컴포넌트)

```typescript
if (error) return (
  <p className="text-red-500 text-sm">{error.message}</p>
)
```

#### 전체 에러 (큰 컴포넌트)

```typescript
if (error) return (
  <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-red-50">
    <AlertCircle className="text-red-500" />
    <p className="text-red-600 text-center">{error.message}</p>
    {onRetry && (
      <button 
        onClick={onRetry}
        className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        다시 시도
      </button>
    )}
  </div>
)
```

### Skeleton 로딩 패턴

```typescript
if (isLoading) return (
  <div className="space-y-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-12 rounded bg-gray-200 animate-pulse" />
    ))}
  </div>
)
```

또는 커스텀 `loadingFallback`:

```typescript
if (isLoading && loadingFallback) return loadingFallback

if (isLoading) return (
  <div className="flex items-center justify-center p-4">
    <Spinner /> 로드 중...
  </div>
)
```

### 적용 대상

24개 계약서 중 **비동기 데이터 로딩**이 있는 모든 컴포넌트에 위 인터페이스를 Props에 명시.

**이미 적용된 계약서** (기존 문서):
- LobbyPage.md (방 목록 로딩)
- GreenRoom.md (디바이스 검증)
- VgenStatusTab (생성 진행)

**신규 추가 대상** (이번 개정):
- 모든 계약서의 "Props Interface" 섹션에 위 `StandardLoadingErrorProps` 확장 명시
- 해당 섹션: "### Props 확장 — 로딩·에러 상태"

### MUST NOT

- ❌ 에러를 console.log만 하고 UI 표시 안 함
- ❌ isLoading 중 컴포넌트 본체 렌더링 (깜빡임 방지)
- ❌ 에러 메시지에 PII 포함 (§17 준수)

---

## DataChannel 타입 레지스트리

허용 채널은 `room-authority`, `chat`, `script-cue`, `blendshape`로 4개다. 새 기능은 **기존 채널의 `type` 또는 `message_type` 필드를 확장**한다. 새 채널을 만들지 않는다.

```ts
// room-authority 채널 등록 타입 (VgenPanel.md 추가분 포함)
type RoomAuthorityType =
  | 'slot_change'
  | 'bg_change'
  | 'sound_trigger'
  | 'cue_advance'
  | 'host_transfer'     // HostAuthority — host_id/authority_epoch 이전
  | 'room_end'          // Room lifecycle — 빈 방/종료 broadcast
  | 'vgen_mode_open'    // VgenPanel — 호스트가 VGen 프롬프트 패널 열기 broadcast
  | 'vgen_mode_close'   // VgenPanel — 패널 닫기 broadcast (생성 완료 포함)
  | 'vgen_prompt_patch' // VgenPanel — 섹션별 LWW prompt patch
  | 'vgen_result'       // VgenPanel — 생성 완료, payload: { url: string }
  | 'vgen_trigger_ack'  // VgenPanel — 트리거 중복 응답, payload: { job_id, status: 'accepted'|'duplicate' }
  | 'dub_mode_open'     // DUB — 호스트가 DUB 오버레이 열기
  | 'dub_mode_close'   // DUB — DUB 오버레이 닫기
  | 'invite_to_stage'  // ROOM-21 — 관객 무대 초대 { participant_id, slot_index }
  | 'slow_mode'        // HOST-09 — 슬로우 모드 { seconds: 0|5|10|30 }
  | 'chat_clear';      // HOST-11 — 채팅 전체 클리어 { before_timestamp }
```

새 타입을 추가할 때는 위 union에 실제 타입명을 한 줄 추가하고 중앙 dispatcher switch case도 함께 추가한다. `NEW_TYPE` 같은 placeholder 문자열은 허용 타입에 넣지 않는다.

| 기능 | 채널 | 타입 확장 |
|---|---|---|
| VGen 협업 프롬프트 | `room-authority` | `vgen_prompt_patch` |
| VGen/DUB 모드 전환 | `room-authority` | `vgen_mode_*`, `dub_mode_*` |
| 사운드보드 | `room-authority` | `sound_trigger` |
| 호스트 이전/방 종료 | `room-authority` | `host_transfer`, `room_end` |
| 손들기 큐 (ROOM-20) | Supabase Realtime | `room_participants.raise_hand_at` |
| 무대 초대 (ROOM-21) | `room-authority` | `invite_to_stage` |
| 슬로우 모드 (HOST-09) | `room-authority` | `slow_mode` |
| 채팅 클리어 (HOST-11) | `room-authority` | `chat_clear` |
| 디렉터 노트 | `chat` | `message_type='note'` |
| 참가자 리액션 | `chat` | `message_type='reaction'` |
| 표정 트래킹 (52 blendshape) | `blendshape` | unreliable, 30 Hz |

핸들러는 중앙 dispatcher 한 곳에서 `type`으로 분기한다. 각 컴포넌트가 DataChannel을 직접 파싱하지 않는다.

> **[SECURITY] chat 채널 발신자 검증**: `room-authority`와 동일하게 `chat` 채널도 수신 시 `event.participant.identity`와 페이로드의 `user_id`를 대조해야 한다. 불일치 시 렌더 금지. 악성 actor가 타인의 `user_id`를 페이로드에 넣어 사칭 채팅을 보낼 수 있다.

```ts
// RoomView의 DataChannel dispatcher (단일 진입점)
// [SECURITY] room-authority 수신 시 두 조건을 모두 검증해야 한다:
//   1. senderIdentity — LiveKit이 부여한 participant identity (payload 아님)
//   2. msg.host_id   — DB snapshot의 rooms.host_id 와 일치 여부
// 배우(actor)도 canPublishData=true 이므로 payload만 믿으면 위조 가능.
function handleRoomAuthority(event: DataChannelEvent, msg: RoomAuthorityMessage) {
  // sender identity 검증 (LiveKit SDK: event.participant.identity)
  const senderIdentity = event.participant?.identity
  const currentHostIdentity = roomStore.hostIdentity   // rooms.host_id 기반 identity
  if (!senderIdentity || senderIdentity !== currentHostIdentity) return  // 위조 이벤트 무시
  if (msg.host_id !== roomStore.hostId) return          // payload host_id 이중 검증

  switch (msg.type) {
    case 'slot_change':   stageStore.applySlotChange(msg.payload); break;
    case 'bg_change':     stageStore.applyBgChange(msg.payload); break;
    // 새 타입을 추가하면 여기에 실제 타입명과 handler를 함께 추가한다.
  }
}
```

---

## Zustand Store 슬라이스 격리

새 기능은 **기존 store 수정 없이 새 slice로** 추가한다.

```ts
// ❌ 기존 roomStore에 직접 추가
roomStore.streakCount = 0

// ✅ 새 slice 분리
// src/stores/streakStore.ts
export const useStreakStore = create<StreakState>(...)
```

| 기존 Store | 담당 도메인 | 확장 금지 대상 |
|---|---|---|
| `userStore` | 인증·프로필·모델 선택 | streak, badge |
| `roomStore` | 룸 메타·참가자 목록·호스트 | 채팅 히스토리, 통계 |
| `stageStore` | 슬롯·배경·큐·오디오 믹서 | 영상생성 상태 |
| `trackingStore` | MediaPipe 상태·blendshape | 개인 설정 프리셋 |

새 기능별 예정 store: `streakStore`, `badgeStore`, `vgenStore`, `presetStore`

---

## 전체 컴포넌트 관계 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│                         RoomView (Vite SPA)                      │
│  ┌─ Initialize: roomStore, participantStore, stageStore, etc.  │
│  ├─ LiveKit Room: peer management, DataChannels                 │
│  └─ Supabase: Realtime (rooms, room_participants, scripts, msg) │
└────────────────────────────┬─────────────────────────────────────┘
                             │
            ┌────────────────┼────────────────┬─────────────────┐
            │                │                │                 │
    ┌───────▼─────┐  ┌───────▼──────┐  ┌────▼────────┐  ┌────▼───────┐
    │ParticipantSlot    │ParticipantSlot  │HostConsole │ ScriptPanel │
    │   (slot 0-5)      │   (slot 1)      │(호스트만)  │             │
    └───────┬─────┘  └───────┬──────┘  └────┬────────┘  └────┬───────┘
            │                │              │                │
    ┌───────▼─────┐  ┌───────▼──────┐     │publish:         │
    │AvatarCanvas │  │ AvatarCanvas │    room-authority    │
    │ (PixiJS)    │  │  (PixiJS)    │    (배경/슬롯/음성)  │subscribe:
    │             │  │              │                       │script-cue
    │subscribe:   │  │subscribe:    │                       │
    │blendshape   │  │blendshape    │     ┌────────────────┤
    │(30 Hz)      │  │(30 Hz)       │     │
    └─────────────┘  └──────────────┘     │
            │                │             │
            └────────┬───────┘             │
                     │                    │
         ┌──────────▼────────┐            │
         │ParticipantLabel   │            │
         │+ AudioUI          │            │
         └───────────────────┘            │
                                          │
         ┌────────────────────────────────▼─────────────┐
         │      ScriptPanel Body                        │
         │      (호스트: 편집 / 배우: 보기)              │
         │                                              │
         │ ┌──────────────────────────────────┐        │
         │ │ subscribe: script-cue (reliable) │        │
         │ │ publish: script-cue (호스트만)   │        │
         │ └──────────────────────────────────┘        │
         │                                              │
         │ ┌──────────────────────────────────┐        │
         │ │ subscribe: scripts (Realtime)    │        │
         │ │ display: cues + character roles  │        │
         │ └──────────────────────────────────┘        │
         └──────────────────────────────────────────────┘
                     │
                     │ character_role 매칭
                     ▼
         ┌─────────────────────────┐
         │ ParticipantSlot(대사표시)│
         └─────────────────────────┘


┌──────────────────────────────────────────────────────────────────┐
│                     무대 중앙 & 사이드바                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │  MainViewComponent       │    │ ChatPanel + ChatOverlay  │   │
│  │  (배경영상 동기)          │    │ (메시지 + 이모지 반응)   │   │
│  │                          │    │                          │   │
│  │ subscribe:              │    │subscribe:                │   │
│  │ room-authority bg_change│    │- chat (DataChannel)     │   │
│  │ stageStore.backgroundUrl   │    │- messages (Realtime)    │   │
│  │                          │    │                          │   │
│  │[HTMLVideoElement]       │    │publish:                 │   │
│  │ src: CDN/R2             │    │- chat (메시지)           │   │
│  │ autoplay, muted, loop   │    │- reaction (이모지)       │   │
│  │                          │    │                          │   │
│  │on bg_change:            │    │ChatOverlay:              │   │
│  │ preload + fade transition│   │- pointer-events: none   │   │
│  │                          │    │- auto-remove N초 후      │   │
│  └──────────────────────────┘    └──────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │ TimedTurnsProgressBar    │    │ PresenceAvatarStack     │   │
│  │ (큐 소요시간 진행바)      │    │ (우상단 아바타 썸네일)   │   │
│  │                          │    │                          │   │
│  │subscribe:                │    │read: participants[]     │   │
│  │- cue_index               │    │      preview_image_url  │   │
│  │- room-authority cue_adv  │    │                          │   │
│  │                          │    │on avatar click:         │   │
│  │on cue_advance:           │    │ stageStore.focusedSlot  │   │
│  │ reset timer              │    │ (ParticipantSlot 하이라이트)│
│  └──────────────────────────┘    └──────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │  AudioMixer              │    │ ModelSelector            │   │
│  │  (채널별 볼륨 제어)       │    │ (아바타 선택)            │   │
│  │                          │    │                          │   │
│  │subscribe: participants[] │    │load: models table       │   │
│  │ audioTracks              │    │(user_id filter)         │   │
│  │                          │    │                          │   │
│  │control:                  │    │on select:               │   │
│  │- individual volumes      │    │ userStore.selected_id   │   │
│  │- master volume           │    │ AvatarCanvas re-mount   │   │
│  │- BGM (HTMLAudioElement)  │    │                          │   │
│  │                          │    │ [Onboarding에서만 사용] │   │
│  └──────────────────────────┘    └──────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CalibrationWizard [개발 예정]                             │   │
│  │ (MediaPipe 얼굴 추적 초기 설정)                           │   │
│  │                                                            │   │
│  │ trackingStore.avatar_state:                              │   │
│  │ IDLE → INITIALIZING → CALIBRATING → TRACKING             │   │
│  │                                                            │   │
│  │ [Skip 가능 / onboarding 단계]                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SceneBackground [개발 예정]                               │   │
│  │ (배경 씬 + 파티클 오버레이)                                │   │
│  │                                                            │   │
│  │ subscribe: stageStore.activeScene                        │   │
│  │ DataChannel: room-authority bg_change                    │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                      데이터 흐름 (신호)                           │
├─────────────────────────────────────────────────────────────────┤
│ blendshape (DataChannel, unreliable)                            │
│   30 Hz, 다른 peer → AvatarCanvas 직접 렌더                    │
│                                                                  │
│ script-cue (DataChannel, reliable, ordered)                    │
│   호스트(ScriptPanel) 발행 → 모든 peer 동기화                  │
│   TimedTurnsProgressBar 타이머 리셋                            │
│                                                                  │
│ room-authority (DataChannel, reliable, ordered)                │
│   호스트(HostConsole) 발행 → 모든 peer 상태 변경               │
│   types: slot_change, bg_change, sound_trigger, cue_advance   │
│   MainViewComponent 배경 변경 수신                              │
│                                                                  │
│ chat (DataChannel, reliable)                                    │
│   모든 peer 발행 → ChatPanel 수신 + ChatOverlay 오버레이       │
│   messages Realtime INSERT로도 저장                            │
│                                                                  │
│ Realtime (Supabase)                                             │
│   rooms → MainViewComponent 배경 변경 감지                      │
│   room_participants → ParticipantSlot 상태 동기화              │
│   scripts → ScriptPanel cue_index 변경 감지                    │
│   messages → ChatPanel 메시지 히스토리 로드                    │
│   models → ModelSelector 아바타 목록 로드                      │
│                                                                  │
│ Zustand Store (로컬 상태)                                       │
│   userStore → 본인 ID, 선택 모델, 프로필                       │
│   roomStore → room 상태, host_id, participants, conn_state     │
│   participantStore → peer 상태, role, audio, muted_by_host    │
│   stageStore → 배경, cue_index, focusedSlot, script_data       │
│   trackingStore → avatar_state, blendshape, calibration_ver    │
│   audioStore → 채널별 볼륨 (master, participants, BGM)         │
│   chatStore → messages[], overlay_messages[]                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 타입 정의 (공유)

```typescript
// DataChannel 메시지 타입
type BlendshapeMessage = {
  blendshapes: Float32Array;
  timestamp_ms: number;
  calibration_version: number;
  seq: number;
  byte_length: number;
  crc16: number;
};

type RoomAuthorityMessage = {
  type: 'slot_change' | 'bg_change' | 'sound_trigger' | 'cue_advance'
      | 'host_transfer' | 'room_end'
      | 'vgen_mode_open' | 'vgen_mode_close' | 'vgen_prompt_patch'
      | 'vgen_result' | 'vgen_trigger_ack' | 'dub_mode_open' | 'dub_mode_close';
  payload: Record<string, any>;
  host_id: string;
  authority_epoch: number;
  seq: number;
  timestamp_ms: number;
};

type ScriptCueMessage = {
  cue_index: number;
  issuer_id: string;
  authority_epoch: number;
  timestamp_ms: number;
};

// Store 타입
type AvatarState = {
  participantId: string;
  blendshapes: Float32Array;
  timestampMs: number;
  isLoading: boolean;
  error?: Error;
};

type RoomAuthorityState = {
  host_id: string;
  cue_operator_id?: string;
  authority_epoch: number;
  seq: number;
  last_update_ms: number;
};
```

---

## 검증 체크리스트 (구현/리뷰)

### 구현 체크

- [ ] AvatarCanvas: props 변경 시 기존 Container 정리 후 새로 생성
- [ ] ParticipantSlot: room-authority 메시지 host_id + authority_epoch 검증
- [ ] ScriptPanel: 호스트 확인 후에만 script-cue 발행
- [ ] 모든 Realtime 구독: unmount 시 자동 구독 해제
- [ ] DataChannel: unreliable/reliable 채널 구분 (type safety)
- [ ] Supabase: RLS 정책과 일치하는 쿼리만 사용

### 리뷰 체크

- [ ] Props interface가 완전한가? (타입 안전성)
- [ ] Store 읽기/쓰기 구분이 정확한가?
- [ ] DataChannel 메시지 형식이 DATA-SCHEMA.md와 일치하는가?
- [ ] LiveKit 이벤트 리스너가 모두 정리(cleanup)되는가?
- [ ] 금지 사항 위반이 없는가?
- [ ] Supabase RLS와 쿼리가 일치하는가?

---

## 관련 문서

- `../state-machines/` — 11개 상태 머신 (Room, Participant, Avatar, Script, Auth, WebRTC, HostAuthority, Vgen, Onboarding, Tracking, StageMode)
- `../DATA-SCHEMA.md` — Supabase 테이블, DataChannel 프로토콜, RLS, Realtime
- `../PLATFORM-ARCHITECTURE.md` § 3.1, 3.2 — PixiJS Application, Zustand store 아키텍처
- `../FEATURE-SPEC.md` — 기능 우선순위, 의존성

---

## 한줄정리

snack-web의 29개 컴포넌트(핵심 3개 + orchestrator 2개 + 호스트 제어 1개 + 채팅 2개 + 우측사이드바 1개 + 설정 모달 1개 + 무대 7개 + onboarding 2개 + VgenExport 1개 + StageLayout 1개 + DUB 4개 + OBS 1개 + Mobile 1개 + ErrorBoundary 1개)의 Props·Store·DataChannel·LiveKit·Supabase·금지사항을 명시하는 계약서로, RoomView 중심 아키텍처에서 각 역할을 정의하고 구현·리뷰·통합 테스트 기준을 제공한다.
