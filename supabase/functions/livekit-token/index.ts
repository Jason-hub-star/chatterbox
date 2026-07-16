// supabase/functions/livekit-token/index.ts
// SSOT: docs/specs/livekit-edge-fn.md §1·§4.1
//
// 시크릿(LIVEKIT_API_SECRET)은 이 함수 안에서만 사용 — 클라이언트 노출 금지 (보안 성역).
//
// Phase 2 게이트(핵심): roomName(=rooms.id)에 대해 호출자의 **활성 room_participants 행**이
//   있어야만 토큰을 서명한다. 이것이 "URL만 알면 입장" 취약점을 막는 지점 —
//   방 입장은 반드시 create-room / join-public-room Edge Function 을 거쳐 참가자 행을 만든 뒤에만 가능.
// identity 는 auth.uid() 유지(기존 아바타/원격 구동 코드와 호환).
//
// ponytail(후속 슬라이스에서 복원, §4.1): users.onboarding_step(온보딩 미구현) · age_band(미수집) ·
//   user_blocks 양방향(테이블 미생성)·refresh-livekit-token·kick/leave/webhook 강제(§6~7)는 이번 슬라이스 범위 밖.
//   token metadata.token_version 은 지금 심어 둔다(후속 webhook 무효화가 토큰 재발급 없이 붙도록).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

const cors = {
  "Access-Control-Allow-Origin": "*", // ponytail: PoC '*'. 프로덕션은 앱 오리진으로 좁힌다.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  // 호출자 인증 (anon 클라 + Authorization)
  const authHeader = req.headers.get("authorization") ?? "";
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await anon.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let body: { roomName?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { roomName } = body;
  if (typeof roomName !== "string" || roomName.length === 0) {
    return json({ error: "Invalid roomName" }, 400);
  }

  // 게이트 검증은 service_role 로(RLS 우회, 서버 판정).
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // (1) 프로필 매핑 auth_id → users.id
  const { data: appUser } = await service
    .from("users").select("id, display_name").eq("auth_id", user.id).is("deleted_at", null).single();
  if (!appUser) return json({ error: "No profile" }, 403);

  // (2) 방 존재 + 종료 아님
  const { data: room } = await service
    .from("rooms").select("id, status").eq("id", roomName).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);

  // (3) 활성 참가자 자격 + (4) 강퇴 아님
  const { data: part } = await service
    .from("room_participants")
    .select("token_version, is_disabled_by_host, muted_by_host, role")
    .eq("room_id", roomName).eq("user_id", appUser.id).neq("state", "left")
    .maybeSingle();
  if (!part) return json({ error: "Not a participant" }, 403);
  if (part.is_disabled_by_host) return json({ error: "Disabled by host" }, 403);

  // AccessToken 발급. identity = auth uid. metadata 에 token_version(후속 webhook 무효화용).
  const at = new AccessToken(
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
    {
      identity: user.id,
      // F-1(2026-07-12): participant.name = 닉네임 — 무대 이름칩·노트·믹서·로컬 에코가 전부 이 값을 읽는다.
      name: appUser.display_name ?? user.email ?? user.id,
      ttl: 600, // 10분. 만료 없는 토큰 금지.
      metadata: JSON.stringify({ token_version: part.token_version }),
    },
  );

  at.addGrant({
    roomJoin: true,
    room: roomName,
    // actor 발행, viewer 구독 전용. 호스트가 음소거(muted_by_host)한 참가자는 재연결해도 발행 불가(DB 권위).
    canPublish: part.role !== "viewer" && !part.muted_by_host,
    canSubscribe: true,
    // viewer 는 데이터채널 발행도 금지(API-SURFACE Mobile Viewer 규칙 — 채팅·리액션은 Edge 서버 릴레이 경유).
    // 익명 게스트(LOB-07)도 viewer 라 이 한 줄로 read-only 가 LiveKit 레벨에서 완결된다.
    canPublishData: part.role !== "viewer",
  });

  return json(
    { server_url: Deno.env.get("LIVEKIT_SERVER_URL"), token: await at.toJwt() },
    201,
  );
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
