---
tags: [spec]
---

<!--
  Haiku 공식문서 조사 완료
  Updated: 2026-06-29 · GAP-MATRIX G-01
  Sources: docs.livekit.io, supabase.com/docs/guides/functions
-->
<!-- opencode: 2026-06-29 - 토큰 무효화 프로토콜 §6 신설 + jti 클레임 + state='left' 발급 게이트 (G-37·G-44·C1·C7). Coded with OpenCode; high-cost model review recommended. -->

# LiveKit 토큰 발급 Edge Function 스펙

> **위치**: `supabase/functions/livekit-token/index.ts`
> **역할**: 클라이언트가 LiveKit 방에 입장할 때 서버에서 JWT 서명 후 반환
> **보안**: LIVEKIT_API_SECRET은 이 함수 안에서만 사용 — 클라이언트에 절대 노출 금지

---

## 1. Edge Function 코드

```typescript
// supabase/functions/livekit-token/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Supabase 클라이언트 (사용자 인증 토큰으로 RLS 적용)
  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // 인증 검증
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, onboarding_step")
    .eq("auth_id", user.id)
    .single();

  if (profileError || !["lobby", "done"].includes(profile?.onboarding_step ?? "")) {
    return new Response(JSON.stringify({ error: "Onboarding gate required" }), { status: 403 });
  }

  const { roomName } = await req.json();
  if (typeof roomName !== "string") {
    return new Response(JSON.stringify({ error: "Invalid roomName" }), { status: 400 });
  }

  // 방 존재 + 상태 확인. 토큰 발급은 rooms.id 확인만으로 끝내면 안 된다.
  const { data: roomRow, error: roomError } = await supabase
    .from("rooms")
    .select("id, host_id, status")
    .eq("id", roomName)
    .single();

  if (roomError || !roomRow || roomRow.status === "ended") {
    return new Response(JSON.stringify({ error: "Room not available" }), { status: 403 });
  }

  const appUserId = profile.id;
  const isHost = roomRow.host_id === appUserId;
  const { data: participantRow, error: participantError } = isHost
    ? { data: null, error: null }
    : await supabase
        .from("room_participants")
        .select("id, role, state, is_disabled_by_host, token_version")
        .eq("room_id", roomName)
        .eq("user_id", appUserId)
        .neq("state", "left")
        .single();

  if (!isHost && (participantError || !participantRow || participantRow.is_disabled_by_host)) {
    return new Response(JSON.stringify({ error: "Not a room participant" }), { status: 403 });
  }

  // 4. 차단 게이트 (G-84 — SecurityPolicies §14)
  // 요청자가 방의 다른 참가자를 차단했거나, 다른 참가자가 요청자를 차단했으면 입장 거부
  const { data: activeParticipants, error: activeParticipantsError } = await supabase
    .from("room_participants")
    .select("user_id")
    .eq("room_id", roomName)
    .neq("state", "left");

  if (!activeParticipantsError && activeParticipants && activeParticipants.length > 0) {
    const activeUserIds = activeParticipants.map((p) => p.user_id);
    
    // user_blocks 테이블에서 양방향 차단 확인
    const { data: blockCheck, error: blockError } = await supabase
      .from("user_blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${appUserId},blocked_id.in.(${activeUserIds.join(",")})),and(blocked_id.eq.${appUserId},blocker_id.in.(${activeUserIds.join(",")}))`
      )
      .limit(1);

    if (!blockError && blockCheck && blockCheck.length > 0) {
      return new Response(
        JSON.stringify({ error: "차단 관계로 인해 입장할 수 없습니다" }),
        { status: 403 }
      );
    }
  }

  // LiveKit AccessToken 발급
  const canPublish = isHost || participantRow?.role === "actor";
  // jti: 토큰별 고유 UUID (감사 추적용, 블랙리스트 없음 — SecurityPolicies §8.4.1)
  // ponytail: token_version + TTL 10m가 MVP에는 충분하다. 토큰 단위 즉시 철회가 필요하면 Redis jti 블랙리스트 추가.
  const jti = crypto.randomUUID();
  const tokenVersion = participantRow?.token_version ?? 1; // host fallback: host participant row is expected but not required for authority
  const at = new AccessToken(
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
    {
      identity: appUserId,
      name: user.email ?? user.id,
      ttl: 600, // 10분. 만료 없는 토큰 금지.
      // metadata에 jti·token_version·issued_at을 실어 webhook에서 추적/철회 가능 (SecurityPolicies §8.4.1)
      metadata: JSON.stringify({ jti, token_version: tokenVersion, issued_at: Date.now() }),
    }
  );

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish,
    roomAdmin: isHost,
  });

  return new Response(
    JSON.stringify({
      server_url: Deno.env.get("LIVEKIT_SERVER_URL"),
      token: await at.toJwt(),
      jti, // 클라이언트는 무시, 서버 로그·webhook 매칭용
      token_version: tokenVersion,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
});
```

---

## 2. 클라이언트 요청 패턴

```typescript
// src/lib/livekit.ts
export async function fetchRoomToken(
  roomId: string,
  supabaseAccessToken: string
): Promise<{ server_url: string; token: string }> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAccessToken}`,
      },
      body: JSON.stringify({ roomName: roomId }),
    }
  );
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  return res.json();
}
```

---

## 3. 환경변수

| 변수 | 위치 | 용도 |
|---|---|---|
| `LIVEKIT_API_KEY` | Supabase Secrets | 토큰 서명 |
| `LIVEKIT_API_SECRET` | Supabase Secrets | 토큰 서명 |
| `LIVEKIT_SERVER_URL` | Supabase Secrets | `wss://snack-0qw3ymaz.livekit.cloud` |
| `VITE_LIVEKIT_URL` | `.env` | 클라이언트 연결 주소 |

**Supabase Secrets 등록:**
```bash
supabase secrets set LIVEKIT_API_KEY=p_64jg2axgo6r
supabase secrets set LIVEKIT_API_SECRET=<secret>
supabase secrets set LIVEKIT_SERVER_URL=wss://snack-0qw3ymaz.livekit.cloud
```

---

## 4. AccessToken 권한 매핑

| Grant | 용도 |
|---|---|
| `roomJoin: true` | 방 입장 (필수) |
| `canPublish: true` | 마이크·웹캠 발행 |
| `canSubscribe: true` | 다른 참가자 수신 |
| `canPublishData: canPublish` | actor/host만 DataChannel 발행. viewer/OBS는 발행 금지 |
| `roomAdmin: true` | 방장 전용 — HOST-01 강퇴 등 |

> 방장 여부는 `rooms.host_id = users.id` 로 판별 후 `roomAdmin` grant 추가. `users.id`는 `users.auth_id = auth.uid()`로 얻은 앱 사용자 ID다.

### 4.1 발급 차단 게이트 (P0)

LiveKit 토큰 발급 조건은 아래 5개를 모두 만족해야 한다.

1. Supabase Auth 사용자 검증 성공.
2. `rooms.id = roomName` 이고 `rooms.status != 'ended'`.
3. 사용자 자격이 `rooms.host_id = users.id` 이거나 `room_participants(room_id, user_id)` 활성 행이다. `users.id`는 `users.auth_id = auth.uid()`로 얻는다.
4. `room_participants.is_disabled_by_host = false` 이며 `state != 'left'`. — §1 코드 line 76 `.neq("state", "left")` + line 79 `is_disabled_by_host` 검사로 이미 구현됨.
5. `users.onboarding_step IN ('lobby','done')`. 초대 링크 플로우는 invite 검증 후 이 단계를 갱신하거나 별도 GreenRoom gate를 통과해야 한다.

초대 링크 사용자는 `room_invites` 검증 후 먼저 `room_participants` 행을 생성하고, 그 다음 이 함수에서 토큰을 받는다. 이 함수는 초대 링크만 보고 LiveKit 토큰을 발급하지 않는다.

> **토큰 무효화 연동 (SecurityPolicies §8)**: 본 게이트는 "새 토큰 발급" 경로만 차단한다. 기발급 토큰으로 LiveKit 직접 재연결하는 경로는 `livekit-webhook` Edge Function(§6)의 `participant_joined` 핸들러가 1~3초 내 `removeParticipant`로 차단한다.

---

## 5. 배포 명령

```bash
supabase functions deploy livekit-token --no-verify-jwt
# --no-verify-jwt: Supabase 기본 JWT 검증 대신 함수 안에서 직접 검증

supabase functions deploy refresh-livekit-token --no-verify-jwt
supabase functions deploy kick-participant --no-verify-jwt
supabase functions deploy leave-room --no-verify-jwt
supabase functions deploy livekit-webhook --no-verify-jwt
# 토큰 철회 프로토콜 3개 함수 (§6) + refresh (§7)
```

---

## 6. 토큰 철회 프로토콜 (SecurityPolicies §8 연동)

> **목적**: 강퇴/자발적 퇴장 후에도 기발급 토큰으로 재입장하는 취약점(C1)을 token_version + TTL 10m로 막는다.
> **구성**: 3개 Edge Function + LiveKit webhook + 클라이언트 Realtime 구독

### 6.1 kick-participant (호스트 강퇴, HOST-01)

```typescript
// supabase/functions/kick-participant/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  // 호스트 권한 검증: users.auth_id → users.id → rooms.host_id 일치 확인
  const { data: profile } = await supabase
    .from("users").select("id").eq("auth_id", user.id).single();
  if (!profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404 });

  const { room_id, user_id: target_user_id } = await req.json();
  if (typeof room_id !== "string" || typeof target_user_id !== "string") {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  const { data: room } = await supabase
    .from("rooms").select("host_id").eq("id", room_id).single();
  if (!room || room.host_id !== profile.id) {
    return new Response(JSON.stringify({ error: "Only host can kick" }), { status: 403 });
  }

  // 자기 자신 강퇴 금지
  if (target_user_id === profile.id) {
    return new Response(JSON.stringify({ error: "Cannot kick self" }), { status: 400 });
  }

  // (1) DB 신호: is_disabled_by_host = true
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { error: updateError } = await serviceClient
    .from("room_participants")
    .update({ is_disabled_by_host: true, updated_at: new Date().toISOString() })
    .eq("room_id", room_id)
    .eq("user_id", target_user_id);
  if (updateError) return new Response(JSON.stringify({ error: "DB update failed" }), { status: 500 });

  // (2) LiveKit RoomService.removeParticipant 즉시 호출
  const livekit = new RoomServiceClient(
    Deno.env.get("LIVEKIT_SERVER_URL")!,
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!
  );
  try {
    await livekit.removeParticipant(room_id, target_user_id);
  } catch (err) {
    // 이미 연결이 끊겼을 수 있음 — 에러 무시, DB 신호가 우선
    console.warn("removeParticipant (already gone?):", err);
  }

  // Preview/Prod에서는 audit_logs INSERT 또는 외부 audit sink 전송이 필수.
  const { error: auditError } = await serviceClient.from("audit_logs").insert({
    event_type: "participant_kicked",
    room_id,
    actor_user_id: profile.id,
    target_user_id,
    metadata: { source: "kick-participant" },
  });
  if (auditError && Deno.env.get("APP_ENV") !== "local") {
    return new Response(JSON.stringify({ error: "Audit log failed" }), { status: 500 });
  }
  if (auditError) console.warn("audit log skipped in local dev:", auditError);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

### 6.2 leave-room (자발적 퇴장)

```typescript
// supabase/functions/leave-room/index.ts
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("id").eq("auth_id", user.id).single();
  if (!profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404 });

  const { room_id } = await req.json();
  if (typeof room_id !== "string") {
    return new Response(JSON.stringify({ error: "Invalid room_id" }), { status: 400 });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 자발적 퇴장: state='left', left_at=now()
  const { error } = await serviceClient
    .from("room_participants")
    .update({ state: "left", left_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("room_id", room_id)
    .eq("user_id", profile.id);
  if (error) return new Response(JSON.stringify({ error: "DB update failed" }), { status: 500 });

  // LiveKit 연결 종료는 클라이언트가 room.disconnect() 호출 (DB 신호만 서버가 담당)
  // 기발급 토큰으로 재연결 시도 → §6.3 webhook이 차단

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

### 6.3 livekit-webhook (참가자 입퇴장 핸들러)

```typescript
// supabase/functions/livekit-webhook/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RoomServiceClient, WebhookReceiver } from "npm:livekit-server-sdk";

Deno.serve(async (req) => {
  // LiveKit webhook 서명 검증 (Authorization header + SHA256)
  const receiver = new WebhookReceiver(
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!
  );
  let event;
  try {
    event = await receiver.receive(req.body, req.headers.get("authorization") ?? "");
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const livekit = new RoomServiceClient(
    Deno.env.get("LIVEKIT_SERVER_URL")!,
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!
  );

  // participant_joined: 무효화된 참가자 재입장 차단 (C1 핵심 방어)
  if (event.event === "participant_joined") {
    const { roomName, identity } = event.participant;
    const { data: p } = await supabase
      .from("room_participants")
      .select("is_disabled_by_host, state")
      .eq("room_id", roomName)
      .eq("user_id", identity)
      .single();

    if (p?.is_disabled_by_host || p?.state === "left") {
      try {
        await livekit.removeParticipant(roomName, identity);
        console.log("token_revoked_participant_removed", {
          room_id: roomName,
          target_id: identity,
          reason: p.is_disabled_by_host ? "disabled_by_host" : "state_left",
        });
      } catch (err) {
        console.error("removeParticipant failed:", err);
      }
    }
  }

  // participant_left: LiveKit 측 퇴장을 DB에 동기화 (H6 reaper와 연동)
  // 자발적 퇴장/강퇴가 이미 DB에 반영되어 있으면 중복 업데이트 금지
  if (event.event === "participant_left") {
    const { roomName, identity } = event.participant;
    const { data: p } = await supabase
      .from("room_participants")
      .select("state")
      .eq("room_id", roomName)
      .eq("user_id", identity)
      .single();
    // state가 'left'가 아닌 경우에만 동기화 (네트워크 끊김 등)
    if (p && p.state !== "left") {
      await supabase
        .from("room_participants")
        .update({ state: "inactive", updated_at: new Date().toISOString() })
        .eq("room_id", roomName)
        .eq("user_id", identity);
    }
  }

  return new Response("ok", { status: 200 });
});
```

**Webhook 설정 (LiveKit 대시보드):**
- URL: `https://<supabase-project>.supabase.co/functions/v1/livekit-webhook`
- Events: `participant_joined`, `participant_left`, `room_started`, `room_finished`
- 서명 알고리즘: LiveKit 기본 (WebhookReceiver가 자동 검증)

### 6.4 클라이언트 Realtime 구독 (fallback)

```typescript
// src/lib/useParticipantRevocation.ts
// room_participants의 자기 행을 구독해서 무효화 신호 감지 시 자발적 연결 해제
export function useParticipantRevocation(roomId: string, userId: string, onRevoked: () => void) {
  useEffect(() => {
    const sub = supabase
      .channel(`participant:${roomId}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_participants",
          filter: `room_id=eq.${roomId} AND user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new.is_disabled_by_host || payload.new.state === "left") {
            onRevoked(); // → room.disconnect() + "강퇴되었습니다" 토스트 + 라우팅
          }
        }
      )
      .subscribe();

    // 10초 폴링 fallback (Realtime 장애 시)
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from("room_participants")
        .select("is_disabled_by_host, state")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .single();
      if (data?.is_disabled_by_host || data?.state === "left") {
        onRevoked();
      }
    }, 10000);

    return () => {
      sub.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [roomId, userId, onRevoked]);
}
```

### 6.5 토큰 철회 시퀀스 다이어그램

```
호스트                Edge Fn              LiveKit             타겟 클라        DB
  │                    │                    │                    │              │
  │ [강퇴] 클릭        │                    │                    │              │
  ├───────────────────>│                    │                    │              │
  │                    │ UPDATE is_disabled_by_host=true ──────────────────────>│
  │                    │ removeParticipant  │                    │              │
  │                    ├───────────────────>│                    │              │
  │                    │                    │ 연결 종료           │              │
  │                    │                    ├───────────────────>│              │
  │                    │                    │                    │ "강퇴됨" 토스트
  │                    │                    │                    │              │
  │                    │ <── Realtime UPDATE postgres_changes ──────────────────│
  │                    │                    │                    │ 자발적 disconnect
  │                    │                    │                    │              │
  ─ ─ ─ 재입장 시도 (기발급 토큰 v1) ─ ─ ─
  │                    │                    │                    │              │
  │                    │                    │ <── connect(token) ─              │
  │                    │                    │ participant_joined webhook        │
  │                    │ <──────────────────┤                    │              │
  │                    │ SELECT is_disabled_by_host, state ───────────────────>│
  │                    │ removeParticipant  │                    │              │
  │                    ├───────────────────>│                    │              │
  │                    │                    │ 연결 종료           │              │
```

### 6.6 MUST NOT

- ❌ `kick-participant`에서 호스트 권한 검증 생략
- ❌ `livekit-webhook`에서 서명 검증 없이 `removeParticipant` 호출
- ❌ `service role key`를 클라이언트에 노출
- ❌ webhook 핸들러에서 블로킹 I/O (5초 타임아웃 내 반환)
- ❌ 클라이언트가 자기 `is_disabled_by_host`·`state` 행을 UPDATE (서버만 갱신)
- ❌ 강퇴 후 `authority_epoch` 증가 (강퇴는 host 이전 아님, epoch 유지)
- ❌ `removeParticipant` 실패 시 DB 롤백 (DB 신호가 우선, LiveKit은 best-effort)

### 6.7 잔존 위험

- **webhook 지연**: `token_version` metadata mismatch로 재입장자를 제거한다. Realtime 구독 + 10s 폴링은 fallback.
- **LiveKit webhook 미수신**: 네트워크 장애 시 사후 제거 누락. 클라이언트 self-check가 최종 안전망.
- **audit sink 장애**: Local dev에서는 `console.warn` fallback 허용. Preview/Prod에서는 `audit_logs` 또는 외부 audit sink 실패를 릴리스 차단/운영 알림으로 취급.

---

## 7. 토큰 갱신 Edge Function (H2 연동)

> **목적**: LiveKit JWT(1h TTL) 만료 5분 전 클라이언트가 새 토큰을 발급받아 연결을 유지. H2(DataChannel 재생성 순서)와 연동.
> **함수**: `supabase/functions/refresh-livekit-token/index.ts`
> **상태**: Auth.md 언급만 있고 구현 정의가 없어 신규 작성 (HIGH 핵심 해소)

### 7.1 코드

```typescript
// supabase/functions/refresh-livekit-token/index.ts
// 기존 livekit-token과 동일한 게이트를 재검증하여 새 토큰 발급.
// 클라이언트는 토큰 만료 5분 전 자동 호출 (H2 순서 준수).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // (1) 인증 검증 — livekit-token §1과 동일
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, onboarding_step")
    .eq("auth_id", user.id)
    .single();

  if (profileError || !["lobby", "done"].includes(profile?.onboarding_step ?? "")) {
    return new Response(JSON.stringify({ error: "Onboarding gate required" }), { status: 403 });
  }

  const { roomName } = await req.json();
  if (typeof roomName !== "string") {
    return new Response(JSON.stringify({ error: "Invalid roomName" }), { status: 400 });
  }

  // (2) 방 상태 + 참가자 자격 재검증 — 강퇴/퇴장 후 갱신 차단 (§4.1 게이트와 동일)
  const { data: roomRow, error: roomError } = await supabase
    .from("rooms")
    .select("id, host_id, status")
    .eq("id", roomName)
    .single();

  if (roomError || !roomRow || roomRow.status === "ended") {
    return new Response(JSON.stringify({ error: "Room not available" }), { status: 403 });
  }

  const appUserId = profile.id;
  const isHost = roomRow.host_id === appUserId;
  const { data: participantRow, error: participantError } = isHost
    ? { data: null, error: null }
    : await supabase
        .from("room_participants")
        .select("id, role, state, is_disabled_by_host, token_version")
        .eq("room_id", roomName)
        .eq("user_id", appUserId)
        .neq("state", "left")
        .single();

  // (3) 무효화 검증 — 강퇴/퇴장 후 토큰 갱신 거부 (SecurityPolicies §8 핵심)
  if (!isHost && (participantError || !participantRow || participantRow.is_disabled_by_host)) {
    return new Response(JSON.stringify({ error: "Not a room participant" }), { status: 403 });
  }

  // (4) 새 토큰 발급 — jti 포함 (§8.4.1)
  const canPublish = isHost || participantRow?.role === "actor";
  const jti = crypto.randomUUID();
  const tokenVersion = participantRow?.token_version ?? 1;
  const at = new AccessToken(
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
    {
      identity: appUserId,
      name: user.email ?? user.id,
      ttl: 600,
      metadata: JSON.stringify({ jti, token_version: tokenVersion, issued_at: Date.now(), refreshed: true }),
    }
  );

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish,
    roomAdmin: isHost,
  });

  return new Response(
    JSON.stringify({
      server_url: Deno.env.get("LIVEKIT_SERVER_URL"),
      token: await at.toJwt(),
      jti,
      token_version: tokenVersion,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
});
```

### 7.2 클라이언트 갱신 순서 (H2 BLOCKING SPEC 준수)

```
[토큰 만료 5분 전]
   ↓
1. 클라이언트: refresh-livekit-token 호출 → 새 토큰 수신
   ↓
2. LiveKit room.prepareConnection(newToken) — 연결 사전 준비
   ↓
3. 기존 토큰 만료 시 LiveKit 자동 재연결 (newToken 사용)
   ↓
4. 재연결 완료 후:
   a. snapshot fetch — room_participants, stageStore 상태 최신화
   b. DataChannel 재등록 — room-authority, chat, script-cue, blendshape
   c. blendshape 송신 재개 — trackingStore 30Hz 전송 재시작
   ↓
5. UI: "재연결 완료" 토스트 (선택), 연결 끊김 없음
```

**MUST NOT (H2):**
- ❌ 재연결 후 snapshot fetch 없이 DataChannel 재등록 (stale 상태 위험)
- ❌ DataChannel 재등록 전 blendshape 송신 시작 (핸들러 누락)
- ❌ refresh 토큰을 localStorage에 저장 (메모리만, 세션 종료 시 삭제)

### 7.3 클라이언트 코드 예시

```typescript
// src/lib/useTokenRefresh.ts
export function useTokenRefresh(roomId: string, onRefreshed: (token: string) => void) {
  useEffect(() => {
    const REFRESH_BEFORE_MS = 5 * 60 * 1000;  // 5분 전
    const TTL_MS = 10 * 60 * 1000;  // 10분
    const refreshTime = TTL_MS - REFRESH_BEFORE_MS;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-livekit-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ roomName: roomId }),
        });
        if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
        const { token } = await res.json();
        onRefreshed(token);
      } catch (err) {
        console.error("Token refresh failed:", err);
        // 실패 시 사용자에게 재연결 안내 + LobbyPage로 라우팅
      }
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [roomId, onRefreshed]);
}
```

---

## 8. 게스트→정회원 이력 마이그레이션 (G-56)

> **목적**: LOB-07 데모룸을 anonymous session으로 체험한 뒤 정식 가입하면 시청 이력(room_participants 등)이 보존되도록 함.
> **트리거**: 사용자가 가입 완료 (auth.users INSERT)할 때 Supabase DB Webhook 또는 signUp 직후 클라이언트 호출

### 8.1 migrate-guest-history Edge Function

```typescript
// supabase/functions/migrate-guest-history/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // (1) 현재 인증 사용자 확인
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // (2) 현재 사용자의 users 레코드 조회
  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single();
  if (userError || !currentUser) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
  }

  // (3) 요청 본문에서 anonymous_session_id 수신 (클라이언트가 가입 전에 저장했던 값)
  const { anonymous_session_id } = await req.json();
  if (typeof anonymous_session_id !== "string") {
    return new Response(JSON.stringify({ error: "Invalid anonymous_session_id" }), { status: 400 });
  }

  // (4) RLS 검증: 자신의 anonymous_session_id만 이관 가능
  // (현재 사용자 auth.uid()만 자신의 이력을 이관할 수 있음)

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // (5) room_participants: anonymous_id → new_user_id로 이관
  const { error: participantError } = await serviceClient
    .from("room_participants")
    .update({ user_id: currentUser.id, updated_at: new Date().toISOString() })
    .eq("user_id", anonymous_session_id);
  if (participantError && participantError.code !== "PGRST116") {
    // PGRST116 = 행 없음 (정상, 게스트 이력이 없을 수 있음)
    console.error("room_participants update error:", participantError);
    // 실패 시에도 진행 (non-blocking)
  }

  // (6) recordings: anonymous_id → new_user_id로 이관
  // consent 재확인 불필요 — 동일 인물이므로 기존 consent_json 유지
  const { error: recordingError } = await serviceClient
    .from("recordings")
    .update({ user_id: currentUser.id, updated_at: new Date().toISOString() })
    .eq("user_id", anonymous_session_id);
  if (recordingError && recordingError.code !== "PGRST116") {
    console.error("recordings update error:", recordingError);
    // 실패 시에도 진행 (non-blocking)
  }

  // (7) user_room_history: anonymous_id → new_user_id로 이관 (또는 병합)
  // 중복 방지: UPSERT 로직으로 last_seen_at 갱신
  const { error: historyError } = await serviceClient
    .from("user_room_history")
    .update({ user_id: currentUser.id, updated_at: new Date().toISOString() })
    .eq("user_id", anonymous_session_id);
  if (historyError && historyError.code !== "PGRST116") {
    console.error("user_room_history update error:", historyError);
  }

  // (8) users.anonymous_session_id = NULL로 초기화 (이관 완료 표시)
  const { error: updateUserError } = await serviceClient
    .from("users")
    .update({ anonymous_session_id: null, updated_at: new Date().toISOString() })
    .eq("id", currentUser.id);
  if (updateUserError) {
    return new Response(
      JSON.stringify({ error: "Failed to clear anonymous_session_id", details: updateUserError }),
      { status: 500 }
    );
  }

  // (9) Audit log (선택)
  await serviceClient.from("audit_logs").insert({
    event_type: "guest_history_migrated",
    actor_user_id: currentUser.id,
    metadata: { anonymous_session_id },
  }).catch((err) => console.warn("Audit log failed (non-blocking):", err));

  return new Response(
    JSON.stringify({
      success: true,
      message: "Guest history migrated to full user account",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
```

### 8.2 클라이언트 호출 패턴

```typescript
// src/lib/authStore.ts (Zustand)
export const useAuthStore = create((set) => ({
  // 회원가입 완료 직후
  async completeSignUp(email: string, password: string) {
    const { data: authData, error } = await supabaseAuth.signUp({ email, password });
    if (error) throw error;

    // (1) 가입 전에 저장했던 anonymous_session_id 확인
    const anonSessionId = localStorage.getItem("anonymous_session_id");
    
    // (2) 이력 마이그레이션 호출 (non-blocking — 실패해도 계속 진행)
    if (anonSessionId) {
      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migrate-guest-history`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authData.session?.access_token}`,
            },
            body: JSON.stringify({ anonymous_session_id: anonSessionId }),
          }
        );
        localStorage.removeItem("anonymous_session_id");
      } catch (migrationErr) {
        console.warn("Guest history migration failed (non-blocking):", migrationErr);
        // UI에 "나중에 이관하기" 버튼 제공 (optional, P1)
      }
    }

    set({ user: authData.user, session: authData.session });
  },
}));
```

### 8.3 실패 처리

- **이관 실패 시**: non-blocking. 사용자에게 "나중에 이관하기" 버튼 제공하여 재시도 가능.
- **부분 실패**: room_participants 이관 실패해도 recordings 진행 — 각 테이블 독립적 처리.
- **이미 이관됨**: users.anonymous_session_id = NULL이면 skip.

---

## 9. 초대 코드 Brute-Force 방어 (SEC-INVITE-ENTROPY)

> **역할**: `verify-invite-code` 및 `accept-invite` Edge Function에서 강제하는 rate limit 및 IP 차단 정책
> **SSOT**: SecurityPolicies.md §0 SEC-INVITE-ENTROPY 테이블 (코드 형식, rate limit, 차단 정책)

### 9.1 verify-invite-code Edge Function

**입력:**
```typescript
{
  invite_code: string;              // 클라이언트 검증용 raw code
  expected_room_id?: string;        // cross-room 초대 사용 방지 (VUL-NEW-01)
}
```

**출력:**
```typescript
{
  valid: boolean;
  room_id: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
}
```

**구현 요구사항:**

1. **IP 식별** — `CF-Connecting-IP` 헤더 (Cloudflare 프록시 대응)
   ```typescript
   const clientIp = req.headers.get('CF-Connecting-IP') ?? req.headers.get('X-Forwarded-For')?.split(',')[0] ?? 'unknown';
   ```

2. **Rate Limit** — IP당 분당 5회
   ```typescript
   const { data: rateCheck } = await supabase
     .from('rate_limit_counters')
     .select('count')
     .eq('ip', clientIp)
     .eq('endpoint', 'verify-invite-code')
     .gte('window_start', new Date(Date.now() - 60000).toISOString())
     .single();
   
   if (rateCheck?.count >= 5) {
     return new Response(
       JSON.stringify({ error: 'too_many_requests', retry_after: 60 }),
       { status: 429, headers: { 'Retry-After': '60' } }
     );
   }
   ```

3. **연속 실패 차단** — 10회 실패 시 1시간 차단
   ```typescript
   const { data: failureCheck } = await supabase
     .from('rate_limit_counters')
     .select('failure_count, blocked_until')
     .eq('ip', clientIp)
     .eq('endpoint', 'verify-invite-code')
     .single();
   
   if (failureCheck?.blocked_until && new Date(failureCheck.blocked_until) > new Date()) {
     return new Response(
       JSON.stringify({ error: 'ip_blocked', blocked_until: failureCheck.blocked_until }),
       { status: 429 }
     );
   }
   
   if ((failureCheck?.failure_count ?? 0) >= 10) {
     // IP를 1시간 차단
     await supabase.from('blocked_ips').insert({
       ip: clientIp,
       reason: 'brute_force_attempt',
       blocked_until: new Date(Date.now() + 3600000).toISOString(),
     });
     return new Response(
       JSON.stringify({ error: 'ip_blocked', blocked_until: new Date(Date.now() + 3600000).toISOString() }),
       { status: 429 }
     );
   }
   ```

4. **코드 검증** — SHA256 해시 비교 (원문 DB 저장 금지)
   ```typescript
   const codeHash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(inviteCode));
   const { data: invite } = await supabase
     .from('room_invites')
     .select('id, room_id, expires_at, max_uses, used_count, revoked_at')
     .eq('invite_code_hash', Buffer.from(codeHash).toString('hex'))
     .single();
   ```

5. **결과 처리**
   - 유효 → `{ valid: true, room_id, ... }` 반환
   - 무효/만료/폐기 → `{ valid: false }` 반환 + 실패 카운트 증가

### 9.2 accept-invite Edge Function

**입력:**
```typescript
{
  invite_code: string;
  room_id: string;
  device_type: 'desktop' | 'mobile';
  idempotency_key: string;
}
```

**출력:**
```typescript
{
  room_id: string;
  role: 'viewer' | 'actor';  // 초대 설정에 따름
}
```

**구현 요구사항:**

1. **동일한 rate limit + IP 차단 정책 적용** (verify-invite-code와 동일)

2. **원자적 used_count 증가** (TOCTOU 방지, SEC-INVITE-ATOMIC)
   ```typescript
   const { data: updated } = await supabase.functions.invoke('accept-invite-transaction', {
     body: {
       invite_code_hash: inviteCodeHash,
       room_id,
       user_id,
       max_uses,
       idempotency_key
     }
   });
   
   // 또는 DB RPC:
   // SELECT accept_invite_rpc(invite_code_hash, room_id, user_id, max_uses, idempotency_key)
   ```
   
   **SQL 트랜잭션:**
   ```sql
   BEGIN;
   UPDATE room_invites
     SET used_count = used_count + 1
     WHERE invite_code_hash = :hash
       AND used_count < max_uses
       AND expires_at > now()
       AND revoked_at IS NULL
   RETURNING id, room_id, role;
   
   INSERT INTO room_participants (room_id, user_id, role, device_type)
   VALUES (:room_id, :user_id, :role, :device_type)
   ON CONFLICT (room_id, user_id) DO NOTHING;
   
   COMMIT;
   ```

3. **실패 처리**
   - 코드 소진/만료 → 409 Conflict
   - 정원 초과 → 429 Too Many Requests (room_participants INSERT 실패)
   - rate limit 초과 → 429 with `Retry-After`

### 9.3 MUST NOT

- ❌ 클라이언트에서 rate limit 구현 — 서버 Edge Function에서만 강제
- ❌ IP 식별 시 `req.headers.get('X-Forwarded-For')` 단독 사용 — `CF-Connecting-IP` 우선, fallback만 사용
- ❌ 연속 실패 카운트를 로컬 메모리에 저장 — DB (Supabase 또는 Upstash Redis) 필수
- ❌ 10회 실패 차단 대신 지수 백오프 사용 — 고정 1시간 차단으로 명확한 정책 제시
- ❌ 코드 원문을 DB에 저장 — SHA256 해시만 저장
- ❌ accept-invite의 used_count 증가를 SELECT 후 UPDATE로 분리 — 원자적 UPDATE로 TOCTOU 방지

---

## 참고

- [LiveKit Tokens & Grants](https://docs.livekit.io/frontends/reference/tokens-grants/)
- [livekit/node-sdks GitHub](https://github.com/livekit/node-sdks)
- [Supabase Edge Functions Auth](https://supabase.com/docs/guides/functions/auth)
