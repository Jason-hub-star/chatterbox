// set-room-background: 호스트가 무대 배경을 교체/해제한다 (HOST-04·05, ROOM-09).
// SSOT: docs/contracts/HostConsole.md · SceneBackground.md · MainViewComponent.md
// 입력: { room_id, background_url }  — '' 또는 공백이면 배경 해제(null 저장).
// 보안(성역): 호출자 == rooms.host_id 서버 검증 + background_url 은 우리 '/scenes/' 에셋만(임의 URL·SSRF·traversal 차단).
// set-room-password 와 동형 패턴 + send-reaction 처럼 room-authority 서버 릴레이(수신측이 서버발만 신뢰).
import { cors, json, getAppUser, isUuid, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

// 우리 public 씬 에셋 경로만 허용(절대 URL·traversal 차단).
function isSafeBackgroundUrl(u: string): boolean {
  return u === "" || (u.startsWith("/scenes/") && !u.includes(".."));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; background_url?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;
  const url = typeof body.background_url === "string" ? body.background_url.trim() : "";
  if (!isSafeBackgroundUrl(url)) return json({ error: "Invalid background_url" }, 400);

  // 방 존재 + 호스트 검증(서버가 진짜 권한 확정 — 클라 게이트는 표시용)
  const gate = await requireHostRoom(service, roomId, userId);
  if (!gate.ok) return gate.res;

  // '' → null(배경 해제). DB 반영 후 방 전체 broadcast(수신측 stageStore.setBackground).
  const stored = url === "" ? null : url;
  const { error: upErr } = await service
    .from("rooms").update({ background_url: stored }).eq("id", roomId);
  if (upErr) return json({ error: "Set background failed" }, 500);

  const payload = new TextEncoder().encode(JSON.stringify({ type: "bg_change", url: stored }));
  try {
    await broadcastData(String(roomId), payload, "room-authority");
  } catch (e) {
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "Broadcast failed" }, 502);
  }
  return json({ ok: true, background_url: stored }, 200);
});
