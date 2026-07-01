---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - MOB-01/02 MobileViewer 계약서 신규 작성 (모바일 뷰어/관전/채팅 전용). Coded with OpenCode; high-cost model review recommended. -->

# MobileViewer

모바일 기기 전용 룸 뷰어. 트래킹·송출은 PC만 허용(MOB-01)하고, 모바일은 관전·채팅 전용 레이아웃(MOB-02)을 제공. MediaPipe FaceLandmarker 미지원 iOS Safari 제약을 반영.

> **정책**: MOB-01 (PC 우선, 트래킹·송출 PC만) + MOB-02 (모바일 뷰어/관전/채팅 전용)
> **스키마**: `DATA-SCHEMA.md` 기존 테이블 (rooms, room_participants, messages)
> **제약**: `PLATFORM-ARCHITECTURE.md §5.2` — iOS Safari FaceLandmarker 미지원

---

## Props Interface

```typescript
interface MobileViewerProps {
  /**
   * 현재 room_id
   */
  roomId: string;

  /**
   * LiveKit 토큰 (서버에서 발급, viewer 권한)
   */
  livekitToken: string;

  /**
   * LiveKit 서버 URL
   */
  livekitUrl: string;

  /**
   * 초기 활성 탭
   * @default 'stage'
   */
  defaultTab?: 'stage' | 'chat' | 'participants';

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

---

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `roomStore` | `currentRoomId` | ✓ | | 현재 room |
| `roomStore` | `participants` | ✓ | | 참가자 목록 (관전용) |
| `roomStore` | `connectionState` | ✓ | ✓ | LiveKit 연결 상태 |
| `stageStore` | `backgroundUrl` | ✓ | | 배경 (뷰어용, 쓰기 불가) |
| `stageStore` | `mode` | ✓ | | 'normal' \| 'vgen' \| 'dub' (관전만) |
| `chatStore` | `messages` | ✓ | ✓ | 채팅 메시지 (관전 + 서버 경유 발송) |
| `chatStore` | `sendViewerMessage()` | | ✓ | 모바일 채팅 발송. LiveKit DataChannel publish 금지, Edge Function 경유 |
| `chatStore` | `sendViewerReaction()` | | ✓ | 모바일 빠른 반응 발송. Edge Function 경유 |
| `userStore` | `userId` | ✓ | | 본인 ID |
| `trackingStore` | 없음 | | | 모바일은 트래킹 미지원 (MOB-01) |

**읽기 전용:** stageStore.backgroundUrl, stageStore.mode
**쓰기:** chatStore.sendMessage, roomStore.connectionState

> ponytail: 모바일은 `trackingStore`를 아예 사용하지 않는다. MOB-01 PC 우선 정책 — 트래킹·송출은 PC만, 모바일은 수신 전용.

---

## 기능 명세

### 1. 모바일 감지 + 라우팅

```typescript
// 모바일 기기 감지 (User Agent + 화면 크기)
function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(ua);
  const isMobileWidth = window.innerWidth < 768;
  return isMobileUA || isMobileWidth;
}

// 모바일 감지 시 MobileViewer로 라우팅
if (isMobileDevice()) {
  return <MobileViewer roomId={roomId} livekitToken={token} livekitUrl={url} />;
}
// PC는 기존 RoomView 유지
return <RoomView room_id={roomId} livekit_token={token} livekit_url={url} />;
```

### 2. 3탭 레이아웃 (하단 탭 바)

```
┌─────────────────────────────────────┐
│ MobileViewer (세로 화면)            │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ [무대 뷰] / [채팅] / [참가자]    │ │ ← 활성 탭 콘텐츠
│ │                                 │ │
│ │  (stage 탭)                     │ │
│ │  ┌─────────────────────┐        │ │
│ │  │ [배경 영상]          │        │ │
│ │  │ (원격 아바타 미리보기)│        │ │
│ │  │  + 채팅 오버레이      │        │ │
│ │  └─────────────────────┘        │ │
│ │  (트래킹 없음, 정적 아바타)     │ │
│ │                                 │ │
│ │  (chat 탭)                      │ │
│ │  ┌─────────────────────┐        │ │
│ │  │ 채팅 메시지 스크롤    │        │ │
│ │  │ 홍길동: 안녕!        │        │ │
│ │  │ 김영희: 반가워       │        │ │
│ │  └─────────────────────┘        │ │
│ │  [입력창] [전송]                │ │
│ │                                 │ │
│ │  (participants 탭)              │ │
│ │  ┌─────────────────────┐        │ │
│ │  │ 홍길동 (host) 🎙     │        │ │
│ │  │ 김영희 (actor)       │        │ │
│ │  │ 박철수 (viewer)      │        │ │
│ │  └─────────────────────┘        │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌──────┬──────┬──────────────┐     │
│ │ 🎭무대│ 💬채팅│ 👥참가자      │     │ ← 하단 탭 바
│ └──────┴──────┴──────────────┘     │
└─────────────────────────────────────┘
```

### 3. 무대 탭 (관전 전용)

```typescript
function MobileStageTab({ roomId }: { roomId: string }) {
  // LiveKit 연결: 오디오 수신만, 비디오/트래킹 송출 없음
  // canPublish: false, canSubscribe: true, canPublishData: false (viewer 권한)

  return (
    <div className="mobile-stage">
      {/* 배경 영상 (원격 호스트의 MainViewComponent 미러) */}
      <video src={stageStore.backgroundUrl} muted autoPlay loop
        style={{ width: '100%', height: '60vh', objectFit: 'contain' }} />

      {/* 채팅 오버레이 (상단, 최근 3개 메시지) */}
      <MobileChatOverlay messages={chatStore.messages.slice(-3)} />

      {/* 아바타 미리보기 (원격 참가자 아바타, 정적 포즈) */}
      {/* ponytail: 모바일은 트래킹 미지원, 원격 블렌드쉐이프만 수신하여 렌더 */}
      <div className="avatar-preview-stack">
        {participants.map(p => (
          <AvatarPreview key={p.user_id} participant={p} />
        ))}
      </div>
    </div>
  );
}
```

### 4. 채팅 탭 (발송 가능)

```typescript
function MobileChatTab({ roomId }: { roomId: string }) {
  const [input, setInput] = useState('');

async function sendMessage() {
    if (userStore.isAnonymous) {
      showToast('로그인 후 채팅할 수 있습니다');
      return;
    }
    // SecurityPolicies §6.4 sanitize 적용
    const result = sanitizeChatInput(input);
    if (!result.ok) {
      showToast('메시지를 입력할 수 없습니다: ' + result.reason);
      return;
    }
    await chatStore.sendViewerMessage(roomId, result.text); // Edge Function: send-viewer-chat
    setInput('');
  }

  return (
    <div className="mobile-chat">
      <div className="message-list" style={{ flex: 1, overflowY: 'auto' }}>
        {chatStore.messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      <div className="input-bar">
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="메시지 입력..." maxLength={500} />
        <button onClick={sendMessage}>전송</button>
      </div>
    </div>
  );
}
```

### 4.1 관객 반응 툴바 (G-168·G-262)

모바일 viewer는 하단 탭 위에 compact reaction toolbar를 가진다. 채팅을 열지 않아도 함께 있다는 신호를 보낼 수 있게 하며, 버튼 클릭 시 즉각적인 피드백을 제공한다.

```
AudienceReactionToolbar
  위치: stage 탭 하단, bottom tab bar 위
  버튼: clap | heart | laugh | wow
  쿨다운: user_id 기준 2초 (클라이언트 단)
  분당 한도: user_id 기준 10회 (서버 검증)
  전송: send-viewer-reaction Edge Function
  저장: 없음(ephemeral). 서버가 whitelist/rate limit 검증 후 chat relay로만 broadcast
  표시: ChatOverlay / MobileChatOverlay에 3초 burst
```

### G-262 — 반응 버튼 클릭 시 즉시 피드백

**클릭 시 펄스 애니메이션:**
```css
@keyframes reaction-pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.reaction-button.active {
  animation: reaction-pulse 200ms ease-out;
}
```

**클라이언트 쿨다운 + 피드백:**
```typescript
const reactionCooldown = useRef<{ [key: string]: number }>({});

async function sendReaction(emoji: string) {
  const now = Date.now();
  const lastTime = reactionCooldown.current[emoji] || 0;
  
  if (now - lastTime < 2000) {
    return; // 2초 쿨다운 내에는 무시
  }
  
  // 즉시 펄스 애니메이션 시작
  const buttonEl = document.querySelector(`[data-emoji="${emoji}"]`);
  buttonEl?.classList.add('active');
  
  try {
    // Edge Function 호출
    const result = await chatStore.sendViewerReaction(roomId, emoji);
    
    if (result.ok || result.status === 200) {
      // 성공: Toast "반응을 보냈습니다" 1초 표시
      showToast('반응을 보냈습니다', { duration: 1000, variant: 'success' });
      reactionCooldown.current[emoji] = now;
    } else if (result.error === 'rate_limit_exceeded') {
      // Rate limit 초과: 강조 경고 토스트
      showToast(
        '반응을 너무 많이 보냈어요. 잠시 후 다시 시도해주세요',
        { duration: 3000, variant: 'error' }
      );
    }
  } catch (err) {
    // 네트워크 에러
    showToast(
      '반응 전송에 실패했습니다. 다시 시도해주세요',
      { duration: 2000, variant: 'error' }
    );
  } finally {
    // 애니메이션 클래스 제거
    buttonEl?.classList.remove('active');
  }
}
```

**서버 분당 한도:**
```
Edge Function: send-viewer-reaction
  입력: { room_id, user_id, emoji }
  검증: user_id 기준 마지막 60초 동안의 reaction 카운트
  규칙: count >= 10이면 반환 { error: 'rate_limit_exceeded' }
  응답 실패 시: 클라이언트는 toast 표시:
    "반응을 너무 많이 보냈어요. 잠시 후 다시 시도해주세요" (3초, 강조 배경)
```

**Toast 스타일:**
| 상황 | 텍스트 | 지속 시간 | 배경 색상 |
|---|---|---|---|
| 성공 | "반응을 보냈습니다" | 1초 | 초록색 (success) |
| Rate limit 초과 | "반응을 너무 많이 보냈어요. 잠시 후 다시 시도해주세요" | 3초 | 빨강색 (error) + 강조 |
| 네트워크 에러 | "반응 전송에 실패했습니다. 다시 시도해주세요" | 2초 | 주황색 (warning) |

**MUST NOT:**
- ❌ 2초 쿨다운 없이 버튼 스팸 방지
- ❌ 분당 10회 제한 안내 없음
- ❌ 버튼 클릭 시 펄스 애니메이션 없음
- ❌ 성공/실패 피드백 토스트 없음
- ❌ rate limit 초과 시 일반 경고 토스트로 표시 (강조 배경 필수)

**권한 규칙**
- LiveKit viewer 토큰은 계속 `canPublishData=false`
- reaction 발송도 DataChannel 직접 publish 금지
- 서버는 room_participants.role='viewer' 또는 actor 여부만 확인하고 whitelist 외 이모지는 거절
- 익명 viewer는 MVP에서 read-only다. Supabase anonymous auth 기반 `room_participants`/rate limit/report 식별 모델이 구현되기 전까지 채팅·반응·투표를 숨긴다.

**MUST NOT**
- ❌ 반응 툴바 때문에 viewer 토큰에 `canPublishData=true` 부여
- ❌ 자유 입력 이모지를 reaction_emoji로 저장
- ❌ 버튼 클릭마다 레이아웃 높이가 변하게 렌더

### 4.2 관객 투표/폴 (ROOM-22)

모바일 viewer가 배우가 되지 않아도 공연 흐름에 참여하도록 stage 탭 하단에 compact poll surface를 표시한다. 호스트가 열어 둔 poll만 노출하며, viewer는 선택지 1개를 서버 검증 경유로 제출한다.

```
AudiencePollBar
  표시 조건: activePoll.status === 'open'
  위치: AudienceReactionToolbar 위, stage 탭 내부 fixed 영역
  선택지: 최대 4개, 각 24자 이하
  제출: submit-viewer-poll Edge Function
  결과: 호스트가 reveal할 때만 percent 표시
```

**권한 규칙**
- viewer 토큰은 계속 `canPublishData=false`
- poll 생성/종료/reveal은 호스트 전용
- viewer 투표는 `room_participants` 존재 확인 후 1 poll당 1회만 허용
- 익명 데모 viewer는 MVP에서 read-only다. Supabase anonymous auth 기반 `room_participants`/rate limit/report 식별 모델이 구현되기 전까지 투표·채팅·반응을 숨긴다.

**MUST NOT**
- ❌ poll 투표 때문에 viewer에게 room-authority 발행 권한 부여
- ❌ 익명 viewer에게 poll 투표 API 노출
- ❌ 투표 전 실시간 중간 결과를 기본 공개해 배우 연기를 방해
- ❌ 모바일 세로 화면에서 poll이 채팅 입력창이나 탭바를 가림

### 5. 참가자 탭

```typescript
function MobileParticipantsTab({ participants }: { participants: Participant[] }) {
  return (
    <div className="mobile-participants">
      {participants.map(p => (
        <div key={p.user_id} className="participant-row">
          <AvatarThumbnail user={p} />
          <span>{p.display_name}</span>
          <RoleBadge role={p.role} />
          {p.state === 'active' && <span className="active-dot">●</span>}
        </div>
      ))}
    </div>
  );
}
```

---

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `chat` (reliable) | `{type, sender_id, text, timestamp_ms}` | 채팅 메시지 수신 |
| `room-authority` (reliable) | `{type: 'bg_change' \| 'vgen_mode_*' \| 'dub_mode_*'}` | 무대 상태 변경 감지 (관전용) |

**발행 (송신):**

| Channel | 메시지 형식 | 용용 |
|---------|----------|------|
| 없음 | 없음 | viewer 토큰은 `canPublishData=false`. 채팅은 `send-viewer-chat` Edge Function이 `messages` INSERT + 서버 브로드캐스트 |

> **주의**: `blendshape` 채널은 구독하지 않음 (모바일은 트래킹 미지원, MOB-01). `room-authority` 발행도 하지 않음 (호스트 권한 없음, 관전만).

---

## LiveKit 연결 (viewer 권한)

```typescript
// livekit-edge-fn.md에서 viewer 권한 토큰 발급
// canPublish: false (오디오/비디오 송출 없음)
// canSubscribe: true (원격 참가자 오디오 수신)
// canPublishData: false (LiveKit DataChannel 직접 발행 없음. 채팅은 서버/Edge 검증 경유)

const room = new Room();
await room.connect(livekitUrl, livekitToken);
// 오디오 구독만 (원격 참가자 음성 듣기)
// 비디오 구독 없음 (아바타는 DataChannel 블렌드쉐이프로 렌더, MOB-01 트래킹 미지원)
```

---

## 금지 사항 (MUST NOT)

- ❌ **모바일에서 트래킹 활성화** — MediaPipe FaceLandmarker iOS Safari 미지원, MOB-01 PC 우선 (PLATFORM-ARCHITECTURE.md §5.2)
- ❌ **모바일에서 마이크 송출** — `canPublish: false`, 수신만 (관전 전용)
- ❌ **모바일에서 room-authority 발행** — 호스트 권한 없음, 관전만
- ❌ **채팅 때문에 viewer 토큰에 canPublishData=true 부여** — 모바일 채팅은 `send-viewer-chat` Edge Function + `messages` Realtime/서버 브로드캐스트 경유
- ❌ **데스크톱 레이아웃을 모바일에 그대로 적용** — 하단 3탭 바 + 세로 화면 최적화 필수
- ❌ **채팅 입력 시 sanitize 생략** — SecurityPolicies §6.4 3단계 sanitize 적용 (C2·G-36)
- ❌ **배경 영상 자동 재생 시 음소거 해제** — `muted` 필수 (사용자 제스처 없는 자동 재생 정책)
- ❌ **참가자 목록에서 host_id 직접 노출** — display_name만 (C11 신원 추적 방지)
- ❌ **모바일에서 VGen/DUB 모드 진입 시도** — 관전만, `stageStore.mode` 읽기 전용

---

## 컴포넌트 관계

```
[RoomView 라우팅]
  └─ isMobileDevice() === true
     → [MobileViewer] 마운트 (viewer 권한 토큰)
         │
         ├─ [MobileTabBar] (하단 고정)
         │  ├─ [🎭 무대] button
         │  ├─ [💬 채팅] button
         │  └─ [👥 참가자] button
         │
         ├─ [MobileStageTab] (활성: stage)
         │  ├─ [배경 영상] (muted, autoplay)
         │  ├─ [MobileChatOverlay] (최근 3개 메시지)
         │  └─ [AvatarPreviewStack] (원격 아바타 정적 미리보기)
         │
         ├─ [MobileChatTab] (활성: chat)
         │  ├─ [MessageList] (스크롤)
         │  └─ [InputBar] + sanitizeChatInput()
         │
         └─ [MobileParticipantsTab] (활성: participants)
            └─ [ParticipantRow] x N (display_name, role, active dot)
```

---

## 관련 문서

- `PLATFORM-ARCHITECTURE.md §5.2` — MediaPipe 모바일 미지원, MOB-01 PC 우선 정책
- `specs/SecurityPolicies.md §6.4` — 채팅 sanitize (C2·G-36, 모바일 채팅에도 적용)
- `contracts/RoomView.md` — PC 룸 뷰 (모바일 감지 시 MobileViewer로 분기)
- `contracts/ChatPanel.md` — 채팅 UI (MobileChatTab이 참고)
- `contracts/AvatarCanvas.md` — 아바타 렌더 (원격 블렌드쉐이프만 수신)
- `specs/livekit-edge-fn.md` — viewer 권한 토큰 (canPublish=false)
- `FEATURE-SPEC.md` — MOB-01 (PC 우선), MOB-02 (모바일 뷰어/관전/채팅)

---

## 한줄정리

MobileViewer는 모바일 기기 감지 시 활성화되는 관전 전용 룸 뷰로, 하단 3탭(무대·채팅·참가자) 세로 레이아웃을 제공하며 트래킹·송출은 PC만 허용(MOB-01)하고 모바일은 채팅 발송과 원격 아바타 수신만 가능한(MOB-02) LiveKit viewer 권한 뷰어다.
