// create-room: 방 생성 + 호스트 참가자 행 삽입.
// SSOT: docs/API-SURFACE.md, docs/contracts/LobbyPage.md, docs/state-machines/Room.md (IDLE→CREATING→WAITING)
// 입력: { title, max_participants?, language?, genre? }  출력: { room_id, participant_id, status }

import { cors, json, getAppUser } from "../_shared/supa.ts";

// LOB-03 장르 화이트리스트 — 로비 카드 배지·필터의 어휘(i18n lobby.genre.* 와 1:1).
const GENRES = ["comedy", "drama", "romance", "fantasy", "horror", "free"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { title?: unknown; max_participants?: unknown; language?: unknown; genre?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 80) return json({ error: "Invalid title" }, 400);

  const maxP = Number.isInteger(body.max_participants) ? (body.max_participants as number) : 6;
  if (maxP < 1 || maxP > 6) return json({ error: "Invalid max_participants" }, 400);

  const language = typeof body.language === "string" ? body.language : "ko";
  // 장르(옵션) — 화이트리스트 외 값은 무시(null): 자유 텍스트가 배지 어휘를 오염시키지 않게.
  const genre = typeof body.genre === "string" && GENRES.includes(body.genre) ? body.genre : null;

  // 방 생성 (status='waiting', 호스트 포함 current_participants=1)
  const { data: room, error: rErr } = await service
    .from("rooms")
    .insert({ host_id: userId, title, max_participants: maxP, language, genre, status: "waiting", current_participants: 1 })
    .select("id, status")
    .single();
  if (rErr || !room) return json({ error: "Create room failed", detail: rErr?.message }, 500);

  // 호스트를 slot 0 actor 로 등록
  const { data: part, error: pErr } = await service
    .from("room_participants")
    .insert({ room_id: room.id, user_id: userId, slot_index: 0, role: "actor", state: "connected" })
    .select("id")
    .single();
  if (pErr || !part) {
    // 참가자 없이 남는 유령 방 방지: 롤백
    await service.from("rooms").delete().eq("id", room.id);
    return json({ error: "Create participant failed", detail: pErr?.message }, 500);
  }

  return json({ room_id: room.id, participant_id: part.id, status: room.status }, 201);
});
