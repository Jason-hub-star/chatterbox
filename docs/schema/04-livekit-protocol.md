## 2. LiveKit DataChannel Protocol

All DataChannels are created during CONNECTED state (see state-machines/_INDEX.md §5).

**SSOT:** 허용 DataChannel은 `room-authority`, `script-cue`, `chat`, `blendshape` 4개뿐이다. 클라이언트가 채팅/반응/투표를 직접 publish하지 않는다. 사용자 입력은 `send-chat`, `send-viewer-chat`, `send-viewer-reaction`, `submit-viewer-poll` Edge Function이 sanitize/rate-limit/audit 후 `messages` INSERT 또는 server relay로 브로드캐스트한다.

> **as-built 토픽 추가 (2026-07-09, ROOM-14)** — `script-role` (reliable, 서버 릴레이 전용): 대본 역할 클레임 동기. `sync-script-role` Edge 가 auth 로 클레이머를 확정 후 broadcast, 수신측은 `participant=undefined`(서버발)만 수락(SEC-5 동형). 메시지: `{kind:'set', role, authId, name}` · `{kind:'clear', role}`. 늦입장 동기는 각 클레이머가 memberKey 변동 시 자기 클레임 재전송(멱등, cue warm-up 동형) — 호스트 전체맵 sync 는 호스트 새로고침 시 전원 초기화 회귀가 있어 채택 안 함. 퇴장자 클레임은 수신측 렌더 파생 prune. room-authority 타입에 `script_mode` 추가(as-built).

> **as-built 토픽 추가 (2026-07-12, ROOM-22)** — `poll` (reliable, 서버 릴레이 전용): 관객 투표 동기. `create-poll`·`set-poll-status`·`submit-viewer-poll` Edge 만 발신, 수신측은 서버발(`participant=undefined`)만 수락(SEC-5 동형). 메시지: `{type:'poll_open', poll:{id,question,options}}` · `{type:'poll_vote', poll_id, total_votes}`(총계만 — 선택지별 중간 결과는 비공개) · `{type:'poll_reveal', poll_id, counts, total_votes}` · `{type:'poll_close', poll_id}`. 늦입장 동기는 §1.25 RLS fetch(멱등 — 릴레이 유실 시에도 수렴).

### 2.1 room-authority (Reliable, Ordered)

Used for host-initiated room state changes (slot, background, sound, cue).

**Message Format:**
```json
{
  "type": "slot_changes | bg_change | sound_trigger | cue_advance | host_transfer | room_end | vgen_mode_open | vgen_mode_close | vgen_prompt_patch | vgen_result | vgen_trigger_ack | dub_mode_open | dub_mode_close",
  "payload": {
    "slot_id": "uuid",
    "background_url": "string",
    "sound_id": "uuid",
    "cue_index": 5
  },
  "host_id": "uuid",
  "authority_epoch": 42,
  "seq": 1234,
  "timestamp_ms": 1624561200000
}
```

**Fields:**
- `type`: action category — G-45 완전화: 12개 타입 모두 명시
  - `slot_change` — 슬롯 배치 변경
  - `bg_change` — 배경 변경
  - `sound_trigger` — 사운드보드 효과음
  - `cue_advance` — 대본 큐 진행
  - `host_transfer` — 호스트 권한 이전 (authority_epoch 증가)
  - `room_end` — 방 종료 broadcast
  - `vgen_mode_open` — VgenPanel: 호스트가 VGen 프롬프트 패널 열기 broadcast
  - `vgen_mode_close` — VgenPanel: 패널 닫기 broadcast (생성 완료 포함)
  - `vgen_prompt_patch` — VgenPanel: 섹션별 LWW prompt patch
  - `vgen_result` — VgenPanel: 생성 완료, payload: { url: string }
  - `vgen_trigger_ack` — VgenPanel: 트리거 중복 응답, payload: { job_id, status: 'accepted'|'duplicate' }
  - `dub_mode_open` — DUB: 호스트가 DUB 오버레이 열기
  - `dub_mode_close` — DUB: DUB 오버레이 닫기
- `payload`: varies by type; opaque to transport
- `host_id`: current host UUID (guards against seq collision after host transfer)
- `authority_epoch`: increments on host transfer; receivers drop older epoch messages (replay 방어, SecurityPolicies §8.4.2)
- `seq`: monotonic counter per host (resets on host transfer)
- `timestamp_ms`: milliseconds since epoch (for drift detection)

**Frequency:** ~0.1 Hz (occasional control changes)

**Per-message auth matrix (receiver MUST enforce LiveKit participant identity, not payload `host_id`):**

| Message type | Allowed sender | Durable side effect |
|---|---|---|
| `slot_change`, `bg_change`, `sound_trigger`, `cue_advance`, `host_transfer`, `room_end`, `vgen_mode_open`, `vgen_mode_close`, `vgen_result`, `vgen_trigger_ack`, `dub_mode_open`, `dub_mode_close` | current host or server relay only | DB/Edge write required where state persists |
| `vgen_prompt_patch` | active participant in same room while `stageStore.mode='vgen'` | no direct DB write; bounded LWW patch only |
| `invite_to_stage`, `slow_mode`, `chat_clear` | current host or server relay only | Edge Function/DB audit required before broadcast |

`vgen_prompt_patch` payload is limited to `{ section_id, content, updated_at, author_id }`, max 4KB, 300ms debounce, and server/client receivers drop patches from non-participants. Host-only commands must never be accepted from actor/viewer clients even if `payload.host_id` claims host.

**Use Case:** Host clicks "next cue" → increments seq → broadcasts message → all clients update stageStore.cue_index

---

### 2.2 script-cue (Reliable, Ordered)

Synchronizes script cue navigation between host and actors.

**Message Format:**
```json
{
  "cue_index": 5,
  "issuer_id": "uuid",
  "authority_epoch": 42,
  "timestamp_ms": 1624561200000
}
```

**Frequency:** ~0.5 Hz (typically once per 2-5 seconds during script navigation)

**Use Case:** Host clicks "prev/next cue" → DataChannel sends message → all actors' UI jumps to cue index

---

### 2.3 chat (Reliable, Ordered)

Text messages and reaction emojis.

**Message Format (chat):**
```json
{
  "type": "chat",
  "sender_id": "uuid",
  "sender_name": "Alice",
  "text": "Great acting!",
  "seq": 42,
  "idempotency_key": "sha256_hash",
  "timestamp_ms": 1624561200000
}
```

**Fields:**
- `seq`: sender별 monotonic sequence (HIGH 해소). 각 클라이언트가 로컬에서 increment. 수신 측은 seq로 순서 복원 — gap 허용 (패킷 손실 시), reorder 감지 (seq < lastSeq 시 무시 또는 재정렬).
- `idempotency_key`: C5 멱등성 키. 클라이언트 재시도 시 중복 저장 방지 (SHA256(sender_id + room_id + text + floor(timestamp/10000)*10000)).

**Message Format (reaction):**
```json
{
  "type": "reaction",
  "sender_id": "uuid",
  "reaction_kind": "clap",
  "emoji": "👏",
  "timestamp_ms": 1624561200000,
  "ttl_ms": 3000
}
```

**Reaction whitelist:** `clap`, `check`, `question`, `heart`, `laugh`.
**Rate limit:** sender당 초당 5개 초과 drop. `ttl_ms`는 1000~5000 범위만 허용.

**Frequency:** Variable (async user input)

**Use Case:** User types message → Edge Function sanitizes/rate-limits → stores to `messages` table → server relay or Realtime sends `chat` message → all clients render in chat panel. Clients MUST NOT publish user chat directly to `chat`.

---

### 2.4 blendshape (Unreliable, Unordered)

Expression tracking (52 ARKit blendshape coefficients at 30fps). [개발 예정]

**Message Format:**
```json
{
  "blendshapes": [0.5, 0.2, 0.0, ...],  -- Float32Array of length 52
  "timestamp_ms": 1624561200000,
  "calibration_version": 1,
  "seq": 1234,
  "byte_length": 208,
  "crc16": 51321
}
```

**Frequency:** 30 Hz (~33ms per frame)

**Packet Loss Tolerance:** Yes. Receiver MUST drop frames when `byte_length != 208`, `crc16` mismatches, or `seq` is older than the newest accepted frame.

**Use Case:** MediaPipe Worker extracts blendshapes → sends via DataChannel → other clients receive and apply to rig parameters

---

### 2.5 LiveKit Events (DB-Independent)

The following features are transmitted via LiveKit but **not persisted to database**:

#### Audience Reactions (Ephemeral)
- **Transport:** `send-viewer-reaction` Edge Function → server relay over `chat` DataChannel with `type: 'reaction'`
- **Message Format:** `{ type: 'reaction', sender_id, reaction_kind, emoji, timestamp_ms, ttl_ms }`
- **Whitelist/TTL:** `reaction_kind` whitelist above, `ttl_ms` max 5000, rate limit 5/sec/sender
- **Persistence:** None — reactions disappear when room closes (ROOM-12)
- **Use Case:** Authenticated audience sends emoji reaction → server validates participant + whitelist + rate limit → broadcast to all participants → display floating animation. Anonymous viewer is read-only in MVP.

#### Director Notes (Optional DB Storage)
- **Transport:** `send-chat`/`send-director-note` Edge Function → server relay over `chat` DataChannel with `message_type='note'`
- **Message Format:** `{ type: 'chat', message_type: 'note', sender_id, text, timestamp_ms }`
- **Persistence:** Default none for session-only notes. If logging required, insert to `messages` table with `message_type='note'`.
- **Use Case:** Director sends note during live session → Edge Function validates host/director role → visible in director-only panel (ROOM-17)

---

## 3. Supabase Storage Paths
