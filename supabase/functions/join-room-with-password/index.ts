// join-room-with-password: 잠금방(is_locked)에 비밀번호로 입장. 비잠금방도 처리(비번 무시).
// SSOT: docs/API-SURFACE.md · docs/DATA-SCHEMA.md §1.2.1
// 입력: { room_id, password }  출력: join-public-room 과 동일 형태.
// 검증(성역)은 서버에서만: room_secrets.password_hash 대조(PBKDF2, 상수시간). 클라는 평문만 넘긴다.
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { verifyPassword } from "../_shared/password.ts";
import { joinAsParticipant } from "../_shared/roomJoin.ts";

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

  const { data: room, error: rErr } = await service
    .from("rooms")
    .select("id, status, is_locked")
    .eq("id", roomId)
    .single();
  if (rErr || !room) return json({ error: "Room not found" }, 404);
  if (room.status === "ended") return json({ error: "Room ended" }, 409);

  if (room.is_locked) {
    const { data: secret } = await service
      .from("room_secrets").select("password_hash").eq("room_id", roomId).maybeSingle();
    // 잠금인데 해시가 없으면(불일치 상태) 안전하게 거부.
    if (!secret?.password_hash) return json({ error: "Wrong password" }, 403);
    const okPw = await verifyPassword(password, secret.password_hash);
    if (!okPw) return json({ error: "Wrong password" }, 403);
  }

  return await joinAsParticipant(service, room.id, userId);
});
