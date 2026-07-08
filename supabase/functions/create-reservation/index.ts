// create-reservation: 예약 공연 만들기(LOB-06 MVP) — 예약 행 + 대상자 인앱 알림(reservation_invite).
// 대상자 원장 = notifications 행(리마인더 cron 이 이 원장을 재사용). 방·초대코드 연결은 후속.
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

const MAX_INVITEES = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { title?: unknown; scheduled_at?: unknown; invitee_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 80) return json({ error: "Invalid title" }, 400);

  const when = typeof body.scheduled_at === "string" ? new Date(body.scheduled_at) : null;
  if (!when || Number.isNaN(when.getTime())) return json({ error: "Invalid scheduled_at" }, 400);
  const now = Date.now();
  if (when.getTime() <= now || when.getTime() > now + 30 * 24 * 3_600_000) {
    return json({ error: "scheduled_at must be in the future (within 30 days)" }, 400);
  }

  const inviteeIds = Array.isArray(body.invitee_ids)
    ? [...new Set(body.invitee_ids.filter((v) => isUuid(v) && v !== userId))].slice(0, MAX_INVITEES)
    : [];

  const { data: reservation, error } = await service
    .from("room_reservations")
    .insert({ host_id: userId, title, scheduled_at: when.toISOString() })
    .select("id, scheduled_at")
    .single();
  if (error || !reservation) return json({ error: "Create failed" }, 500);

  if (inviteeIds.length) {
    const { data: host } = await service
      .from("users").select("display_name").eq("id", userId).maybeSingle();
    const { data: valid } = await service
      .from("users").select("id").in("id", inviteeIds).is("deleted_at", null);
    const rows = (valid ?? []).map((u) => ({
      user_id: u.id,
      type: "reservation_invite",
      payload: {
        reservation_id: reservation.id,
        room_title: title,
        host_name: host?.display_name ?? null,
        scheduled_at: reservation.scheduled_at,
      },
    }));
    if (rows.length) await service.from("notifications").insert(rows);
  }

  return json({ reservation_id: reservation.id, scheduled_at: reservation.scheduled_at, notified: inviteeIds.length }, 201);
});
