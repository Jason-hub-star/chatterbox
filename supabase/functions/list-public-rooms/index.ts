// list-public-rooms: 비로그인 방 목록(LOB-07). Auth 레벨 = Public — 세션 없이 호출된다.
// public_rooms 뷰(host_id·비밀번호 이미 제외)를 service_role 로 SELECT 해 화이트리스트 컬럼만 반환.
// anon 에 뷰 grant 를 주지 않는 이유: Public 표면은 IP 레이트리밋이 계약(API-SURFACE Auth Levels)이고
// PostgREST 직결은 그 게이트를 못 태운다. 랜딩 포털(P3)도 이 함수를 같은 경로로 소비한다.
// SSOT: docs/API-SURFACE.md · docs/contracts/ViewerGate.md
import { cors, json, serviceClient } from "../_shared/supa.ts";

// 목록 폴링 상한 — 분당 30회/IP (로비 Realtime nudge 는 로그인 경로라 여기 안 옴).
const RATE_MAX = 30;
const RATE_WINDOW_SEC = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const service = serviceClient();

  // CF Pages/Workers 앞단이면 cf-connecting-ip, 아니면 x-forwarded-for 첫 홉. 없으면 공용 버킷.
  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { data: allowed, error: rlErr } = await service.rpc("check_rate_limit", {
    p_key: `lobby-list:${ip}`,
    p_max: RATE_MAX,
    p_window_sec: RATE_WINDOW_SEC,
  });
  // 레이트리밋 인프라 오류는 fail-closed (Public 표면 — 계약상 무제한 노출 금지).
  if (rlErr) return json({ error: "Rate limit unavailable" }, 503);
  if (allowed === false) return json({ error: "Too many requests" }, 429);

  const { data, error } = await service
    .from("public_rooms")
    .select(
      "id, title, genre, status, current_participants, max_participants, host_display_name, is_locked, is_demo, is_practice, created_at",
    )
    .in("status", ["waiting", "live"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: "List failed" }, 500);

  return json({ rooms: data ?? [] }, 200);
});
