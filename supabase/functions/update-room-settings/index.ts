// update-room-settings: 호스트가 방 제목/장르를 편집한다 (RM-EDIT, GOAL-room-gaps R2).
// 입력: { room_id, title?, genre? } — 최소 1개. title 은 create-room 과 동일 규칙(trim·1~80자),
// genre 는 GENRES 화이트리스트('' = 제거→null, 그 외 문자열은 400 — 명시 편집이라 silent 변환 금지).
// 보안(성역): requireHostRoom 서버 재검증. DB 반영(로비 public_rooms 뷰 즉시 반영) 후
// room-authority 'room_update' broadcast(최종값 포함) — 전원 상단바 갱신. set-room-mode 동형 패턴.
import { cors, json, getAppUser, isUuid, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";

// create-room GENRES 와 1:1(LOB-03 어휘 SSOT: i18n lobby.genre.*) — 두 진입점 규칙 불일치 금지.
const GENRES = ["comedy", "drama", "romance", "fantasy", "horror", "free"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown; title?: unknown; genre?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;

  const patch: { title?: string; genre?: string | null } = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 80) return json({ error: "Invalid title" }, 400);
    patch.title = title;
  }
  if (body.genre !== undefined) {
    if (typeof body.genre !== "string") return json({ error: "Invalid genre" }, 400);
    if (body.genre === "") patch.genre = null;
    else if (GENRES.includes(body.genre)) patch.genre = body.genre;
    else return json({ error: "Invalid genre" }, 400);
  }
  if (Object.keys(patch).length === 0) return json({ error: "Nothing to update" }, 400);

  const gate = await requireHostRoom(service, roomId, userId, "title, genre");
  if (!gate.ok) return gate.res;

  const { error: upErr } = await service.from("rooms").update(patch).eq("id", roomId);
  if (upErr) return json({ error: "Update failed" }, 500);

  // 최종값 broadcast — 수신측(RoomPage)이 상단바에 그대로 반영(부분 patch 도 병합된 전체값 전달).
  const title = patch.title ?? (gate.room.title as string);
  const genre = patch.genre !== undefined ? patch.genre : ((gate.room.genre as string | null) ?? null);
  const payload = new TextEncoder().encode(JSON.stringify({
    type: "room_update",
    title,
    genre,
    changed_at_ms: Date.now(),
  }));
  try {
    await broadcastData(String(roomId), payload, "room-authority");
  } catch (e) {
    // DB 는 이미 반영됨 — best-effort(transfer-host 와 동일 논거). 미수신 클라는 재입장 시 수렴.
    console.error("broadcastData failed:", e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true, title, genre }, 200);
});
