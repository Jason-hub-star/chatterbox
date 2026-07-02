// supabase/functions/livekit-token/index.ts
// SSOT: docs/specs/livekit-edge-fn.md §1
//
// Phase 1B PoC 범위: "로그인한 사용자면 방 토큰을 서명해 준다"까지만.
// 시크릿(LIVEKIT_API_SECRET)은 이 함수 안에서만 사용 — 클라이언트 노출 금지 (보안 성역).
//
// ponytail: 아래 프로덕션 게이트는 rooms/room_participants/users 테이블(Phase 2 INFRA-06)에
//   의존하므로 PoC에서는 의도적으로 생략한다. 테이블 도입 시 §4.1 5-게이트를 그대로 복원할 것:
//   (1) users.onboarding_step IN ('lobby','done')     — 온보딩 게이트
//   (2) rooms.id = roomName AND status != 'ended'      — 방 존재/상태
//   (3) host_id 또는 room_participants 활성 행           — 방 자격
//   (4) is_disabled_by_host=false, state!='left'        — 강퇴/퇴장 무효화
//   (5) user_blocks 양방향 차단 게이트 (§4 / G-84)
//   또한 token_version metadata·refresh-livekit-token·kick/leave/webhook(§6~7)도 Phase 2에서 추가.
//   지금은 canPublish=true 고정(둘 다 actor). role 기반 발행 권한도 Phase 2.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk";

const cors = {
  // ponytail: PoC는 '*' 허용. 프로덕션에서는 앱 오리진으로 좁힌다.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  // 사용자 인증 토큰으로 Supabase 클라이언트 생성 (RLS 적용)
  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // 게이트 (1/1, PoC): Supabase Auth 사용자 검증만
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

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

  // AccessToken 발급. identity = Supabase auth uid (참가자 유일 식별자).
  const at = new AccessToken(
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
    {
      identity: user.id,
      name: user.email ?? user.id,
      ttl: 600, // 10분. 만료 없는 토큰 금지.
    },
  );

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true, // ponytail: PoC는 전원 actor. role 기반 canPublish는 Phase 2.
    canSubscribe: true,
    canPublishData: true,
  });

  return json(
    {
      server_url: Deno.env.get("LIVEKIT_SERVER_URL"),
      token: await at.toJwt(),
    },
    201,
  );
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
