// set-room-password: 호스트가 방 비밀번호를 설정/변경/해제한다 (HOST-06, 잠금방).
// SSOT: docs/DATA-SCHEMA.md §1.2.1 (room_secrets) · docs/contracts/HostConsole.md
// 입력: { room_id, password }  — password "" 또는 공백만이면 잠금 해제. 그 외 4~64자.
// 보안(성역): 호출자 == rooms.host_id 서버 검증. 해시는 room_secrets(서버 전용)에만, 클라 미노출.
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { hashPassword } from "../_shared/password.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;
  const password = typeof body.password === "string" ? body.password : "";

  // 방 존재 + 호스트 검증
  const { data: room } = await service
    .from("rooms").select("id, host_id, status").eq("id", roomId).single();
  if (!room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);
  if (room.host_id !== userId) return json({ error: "Not host" }, 403);

  // 잠금 해제(빈 비번). 원자성: is_locked=false 를 먼저 — 두 쓰기 사이 실패해도
  // "잠금 해제(입장 가능)" 쪽으로 안전 수렴. (역순이면 secret 삭제 후 is_locked=true 로 남아
  // join-room-with-password 가 해시 없음→거부 → 아무도 못 들어오는 방이 됨.)
  if (password.trim().length === 0) {
    await service.from("rooms").update({ is_locked: false }).eq("id", roomId);
    await service.from("room_secrets").delete().eq("room_id", roomId);
    return json({ ok: true, is_locked: false }, 200);
  }

  if (password.length < 4 || password.length > 64) return json({ error: "Invalid password" }, 400);

  const password_hash = await hashPassword(password);
  const { error: upErr } = await service
    .from("room_secrets")
    .upsert({ room_id: roomId, password_hash, updated_at: new Date().toISOString() }, { onConflict: "room_id" });
  if (upErr) return json({ error: "Set password failed" }, 500);

  await service.from("rooms").update({ is_locked: true }).eq("id", roomId);
  return json({ ok: true, is_locked: true }, 200);
});
