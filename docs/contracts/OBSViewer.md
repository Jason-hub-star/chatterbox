---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - OBS-01~03 OBSViewer 계약서 신규 작성 (obs_viewer_tokens 기반 인증, 3개 모드). Coded with OpenCode; high-cost model review recommended. -->

# OBSViewer

OBS 방송 출력 전용 뷰어. **P0/MVP 필수 기능이 아니라 P2 방송 송출 옵션**이므로, 기본 룸 구현 중 라우트·스토어·Realtime 구독을 스캐폴딩하지 않는다. 나중에 구현할 때만 호스트가 발급한 `obs_viewer_tokens` 기반 인증 읽기 전용 룸 뷰로 3개 모드(투명 배경·크로마키·풀스크린 아바타)를 지원하며, LiveKit 연결 없이 아바타 렌더만 수행한다.

> **인증**: `specs/SecurityPolicies.md §7` (obs_viewer_tokens RLS, H15은 P2로 deferred)
> **스키마**: `DATA-SCHEMA.md §1.17 obs_viewer_tokens` (token_hash, obs_mode, target_slot_index, expires_at)
> **기능**: OBS-01 (투명 배경), OBS-02 (크로마키), OBS-03 (풀스크린 아바타) — 모두 P2 옵션

---

## Props Interface

```typescript
interface OBSViewerProps {
  /**
   * OBS 토큰 (obs_viewer_tokens 평문, URL ?obs_token에서 전달)
   * Edge Function이 token_hash 검증 후 room 데이터 반환
   */
  obsToken: string;

  /**
   * OBS 모드
   * - 'transparent': 투명 배경 (알파 채널, OBS-01)
   * - 'chromakey': 녹색 크로마키 배경 (OBS-02)
   * - 'fullscreen': 단일 아바타 풀스크린 (OBS-03)
   */
  obsMode: 'transparent' | 'chromakey' | 'fullscreen';

  /**
   * (OBS-03 전용) 풀스크린 대상 슬롯 인덱스
   * URL ?slot={i}에서 전달, 0~5
   */
  targetSlotIndex?: number;

  /**
   * 에러 콜백 (토큰 만료·무효 시)
   */
  onError?: (error: Error) => void;
}
```

---

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `obsStore` | `tokenValid` | ✓ | ✓ | 토큰 검증 결과 (true/false) |
| `obsStore` | `roomData` | ✓ | ✓ | Edge Function이 반환한 읽기 전용 room 데이터 |
| `obsStore` | `participants` | ✓ | ✓ | room_participants (slot_index, character_role, avatar 정보) |
| `obsStore` | `expiresAt` | ✓ | | 토큰 만료 시각 (만료 전 경고 표시용, 자동 갱신 없음) |
| `stageStore` | `backgroundUrl` | ✓ | | 배경 (transparent 모드에서는 미사용) |

**읽기 전용:** stageStore.backgroundUrl
**쓰기:** obsStore.tokenValid, obsStore.roomData, obsStore.participants

> ponytail: OBS 전용 `obsStore` 신설. 다른 store와 격리 — 쓰기 권한 없음, 읽기 전용 미러.

---

## 기능 명세

### 0. 호스트 발급 플로우 (OBS 토큰 생성)

호스트가 OBS 연동을 시작할 때의 진입점은 HostConsole.md 소관이다. OBSViewer 자체 관점에서는 다음과 같이 작동한다.

**호스트 발급 UI 흐름 (HostConsole.md에서):**
1. HostConsole 또는 Settings에서 [OBS 연동] 버튼 클릭
2. 모달 열기: OBS 모드 선택
   - [투명 배경] (OBS-01)
   - [크로마키] (OBS-02)
   - [풀스크린 아바타] (OBS-03)
3. 슬롯 지정 (OBS-03 선택 시):
   - 6개 슬롯 중 표시할 아바타 선택 (0~5)
4. [토큰 발급] 버튼 클릭
   - `create-obs-token` Edge Function 호출
   - `obs_viewer_tokens` 테이블 INSERT: token_hash, obs_mode, target_slot_index, expires_at
   - 호스트에게 token 평문 반환 (1회만)
5. URL 생성: `https://app.chatterbox.com/obs?obs_token={token}&obs_mode={mode}&slot={slot}`
6. OBS Browser Source에 URL 복사-붙여넣기

**OBSViewer 역할:**
- HostConsole이 발급한 token을 `?obs_token=` URL 파라미터로 수신
- Edge Function `verify-obs-token` 호출하여 검증
- 검증 성공 시 모드별로 렌더 (transparent/chromakey/fullscreen)
- 검증 실패 시 403 오류 배너 표시 + 호스트에게 재발급 요청 안내

**주의:** 호스트 발급 버튼의 정확한 위치와 구현은 HostConsole.md에서 정의한다. 이 파일은 발급된 토큰을 받는 OBSViewer의 검증·렌더 로직만 담당한다.

### 1. 토큰 검증 + 마운트

```typescript
async function verifyObsToken(token: string, mode: string, slot?: number) {
  const { data, error } = await supabase.functions.invoke('verify-obs-token', {
    body: { obs_token: token, obs_mode: mode, target_slot_index: slot },
  });

  if (error || !data?.valid) {
    obsStore.setTokenValid(false);
    onError?.(new Error('OBS 토큰이 만료되었거나 무효입니다'));
    return;
  }

  obsStore.setTokenValid(true);
  obsStore.setRoomData(data.room);
  obsStore.setParticipants(data.participants);
  obsStore.setExpiresAt(data.expires_at);
}
```

### 2. 3개 OBS 모드 렌더

#### OBS-01 투명 배경 (`transparent`)

```
┌─────────────────────────────────────┐
│ OBSViewer (transparent)             │
│ 배경: 투명 (alpha = 0)              │
│ [AvatarCanvas] (단일 또는 다중)     │
│  ├─ PixiJS backgroundAlpha=0        │
│  └─ 아바타만 렌더 (배경 없음)       │
│ (OBS 브라우저 소스에서 알파 채널)   │
└─────────────────────────────────────┘
```

```typescript
function TransparentRender({ participants }: { participants: Participant[] }) {
  return (
    <div style={{ background: 'transparent', width: '100vw', height: '100vh' }}>
      <PixiApplication backgroundAlpha={0}>
        {participants.map(p => (
          <AvatarCanvas key={p.user_id} participant_id={p.user_id}
            model_id={p.model_id} application={app}
            slotPosition={getSlotPosition(p.slot_index)} />
        ))}
      </PixiApplication>
    </div>
  );
}
```

#### OBS-02 크로마키 (`chromakey`)

```
┌─────────────────────────────────────┐
│ OBSViewer (chromakey)               │
│ 배경: 녹색 (#00FF00)                │
│ [AvatarCanvas] (녹색 배경 위)       │
│ (OBS 크로마키 필터로 녹색 제거)     │
└─────────────────────────────────────┘
```

```typescript
function ChromakeyRender({ participants }: { participants: Participant[] }) {
  return (
    <div style={{ background: '#00FF00', width: '100vw', height: '100vh' }}>
      <PixiApplication backgroundColor={0x00FF00}>
        {participants.map(p => (
          <AvatarCanvas key={p.user_id} participant_id={p.user_id}
            model_id={p.model_id} application={app}
            slotPosition={getSlotPosition(p.slot_index)} />
        ))}
      </PixiApplication>
    </div>
  );
}
```

#### OBS-03 풀스크린 아바타 (`fullscreen`)

```
┌─────────────────────────────────────┐
│ OBSViewer (fullscreen)              │
│ 배경: 투명                          │
│ [AvatarCanvas] (단일, target_slot)  │
│  ├─ 아바타 확대 (화면 중앙)         │
│  └─ slot_index = targetSlotIndex    │
└─────────────────────────────────────┘
```

```typescript
function FullscreenRender({ participants, targetSlot }: { participants: Participant[], targetSlot: number }) {
  const target = participants.find(p => p.slot_index === targetSlot);
  if (!target) return <div>지정된 슬롯에 참가자가 없습니다</div>;

  return (
    <div style={{ background: 'transparent', width: '100vw', height: '100vh' }}>
      <PixiApplication backgroundAlpha={0}>
        <AvatarCanvas participant_id={target.user_id}
          model_id={target.model_id} application={app}
          slotPosition={{ x: 0.5, y: 0.5, scale: 2.0 }} />
      </PixiApplication>
    </div>
  );
}
```

### 3. 토큰 만료 경고

```typescript
// 만료 30분 전 경고 배너 (OBS에 보임)
useEffect(() => {
  if (!obsStore.expiresAt) return;
  const refreshTime = new Date(obsStore.expiresAt).getTime() - 30 * 60 * 1000;
  const timer = setTimeout(() => {
    console.warn('OBS 토큰이 30분 후 만료됩니다. 호스트에게 재발급을 요청하세요.');
  }, refreshTime - Date.now());
  return () => clearTimeout(timer);
}, [obsStore.expiresAt]);
```

### 4. Realtime 구독 (읽기 전용)

```typescript
// room_participants 상태만 구독 (slot 변경, character_role, 퇴장)
useEffect(() => {
  if (!obsStore.roomData?.id) return;
  const sub = supabase
    .channel(`obs-viewer:${obsStore.roomData.id}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'room_participants',
        filter: `room_id=eq.${obsStore.roomData.id}` },
      (payload) => obsStore.updateParticipants(payload))
    .subscribe();
  return () => sub.unsubscribe();
}, [obsStore.roomData?.id]);
```

> **주의**: Realtime 구독은 obs_viewer_tokens 검증 후 Edge Function이 발급한 임시 읽기 권한으로만 동작. 쓰기 불가.

---

## DataChannel 의존성

**구독:** 없음 (LiveKit 연결 없음, 읽기 전용)
**발행:** 없음

> OBSViewer는 LiveKit Room에 연결하지 않는다. 아바타 렌더는 Supabase Realtime으로 수신한 room_participants 상태만으로 구성 (블렌드쉐이프 실시간 트래킹 없음, 정적 포즈 또는 idle 애니메이션).

---

## Supabase 연동

| 엔드포인트/테이블 | 작업 | 시점 | RLS |
|---|---|---|---|
| `verify-obs-token` (Edge Function) | 토큰 검증 + room 데이터 조회 | 마운트 시 | token_hash 검증 |
| `room_participants` | Realtime 구독 | 마운트 후 | token 검증 후 service role 대신 조회 |
| `rooms` | background_url 조회 (chromakey 모드) | 마운트 시 | Edge Function 경유 |

---

## 금지 사항 (MUST NOT)

- ❌ **obs_token 없이 OBS 라우트 접근** — `?obs=1`만으로는 403 Forbidden (SecurityPolicies §7)
- ❌ **LiveKit 연결** — OBS는 읽기 전용, DataChannel 구독 없음, 아바타 실시간 트래킹 없음
- ❌ **room_participants·rooms 직접 쓰기** — OBS는 읽기 전용 미러
- ❌ **토큰을 localStorage에 저장** — URL 파라미터만, 세션 종료 시 삭제
- ❌ **블렌드쉐이프 DataChannel 구독** — LiveKit 연결 없음, 정적 포즈 또는 idle 애니메이션만
- ❌ **토큰 만료 후 자동 갱신 시도** — 호스트 수동 재발급 필요, 만료 시 에러 배너만 표시
- ❌ **OBS-03 fullscreen에서 target_slot_index 없이 전체 렌더** — 단일 슬롯만, 미지정 시 403

---

## 컴포넌트 관계

```
[호스트: OBS 토큰 발급] (HostConsole 또는 SettingsPage)
  └─ obs_viewer_tokens INSERT (token_hash, obs_mode, expires_at)
     └─ 호스트에게 token 평문 반환 (1회)
        └─ OBS Browser Source URL: ?obs_token={token}&obs={mode}&slot={i}
           ↓
[OBSViewer] 마운트
  ├─ [TokenVerifier]
  │  └─ Edge Function verify-obs-token
  │     ├─ 성공: obsStore.tokenValid=true, roomData, participants 설정
  │     └─ 실패: 403, 에러 배너
  │
  ├─ [ModeRenderer] (obsMode에 따라 분기)
  │  ├─ 'transparent' → [TransparentRender] (backgroundAlpha=0)
  │  ├─ 'chromakey' → [ChromakeyRender] (backgroundColor=0x00FF00)
  │  └─ 'fullscreen' → [FullscreenRender] (단일 AvatarCanvas, 확대)
  │
  ├─ [RealtimeSubscriber]
  │  └─ room_participants 구독 (slot 변경·입퇴장 반영)
  │
  └─ [TokenExpiryBanner]
     └─ 만료 30분 전 경고 배너 (OBS에 보임)
```

---

## 관련 문서

- `specs/SecurityPolicies.md §7` — P2 방송 송출 옵션, obs_viewer_tokens RLS, 토큰 발급·검증 정책
- `DATA-SCHEMA.md §1.17` — obs_viewer_tokens 테이블 (token_hash, obs_mode, expires_at)
- `contracts/AvatarCanvas.md` — 아바타 렌더 (OBSViewer에서 재사용)
- `contracts/HostConsole.md` — 토큰 발급 진입점 (예정)
- `FEATURE-SPEC.md` — OBS-01 (투명 배경), OBS-02 (크로마키), OBS-03 (풀스크린 아바타)은 P2 방송 송출 옵션

---

## 한줄정리

OBSViewer는 P2 방송 송출 옵션으로만 구현하며, 호스트가 발급한 obs_viewer_tokens 기반 인증 읽기 전용 룸 뷰를 제공한다. transparent(투명 배경)·chromakey(녹색 배경)·fullscreen(단일 아바타 확대) 3개 모드를 지원하고 LiveKit 연결 없이 Supabase Realtime으로 room_participants 상태만 동기화하여 아바타를 렌더한다.
