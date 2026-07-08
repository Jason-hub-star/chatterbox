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

  // 예약 생성 rate-limit(SEC-RES-1): 일일 캡 — 예약 행·알림 스팸 차단(check_rate_limit 프리미티브 재사용).
  const { data: allowed } = await service
    .rpc("check_rate_limit", { p_key: `reservation:${userId}`, p_max: 20, p_window_sec: 86_400 });
  if (allowed === false) return json({ error: "예약을 너무 많이 만들었어요. 잠시 후 다시 시도해주세요." }, 429);

  const inviteeIds = Array.isArray(body.invitee_ids)
    ? [...new Set(body.invitee_ids.filter((v) => isUuid(v) && v !== userId))].slice(0, MAX_INVITEES)
    : [];

  const { data: reservation, error } = await service
    .from("room_reservations")
    .insert({ host_id: userId, title, scheduled_at: when.toISOString() })
    .select("id, scheduled_at")
    .single();
  if (error || !reservation) return json({ error: "Create failed" }, 500);

  let notified = 0;
  if (inviteeIds.length) {
    // 초대 대상은 "내가 최근 함께한 동료"로 제한(SEC-RES-1): 임의 유저 알림 주입 차단.
    // 관계 근거 = 공유 room_participants 이력(list-recent-people 와 동일) → 미삭제 유저만.
    const { data: myRooms } = await service
      .from("room_participants").select("room_id").eq("user_id", userId);
    const roomIds = [...new Set((myRooms ?? []).map((m) => m.room_id))];
    let fellowIds: string[] = [];
    if (roomIds.length) {
      const { data: fellows } = await service
        .from("room_participants").select("user_id").in("room_id", roomIds).in("user_id", inviteeIds);
      const fellowSet = [...new Set((fellows ?? []).map((f) => f.user_id))];
      if (fellowSet.length) {
        const { data: valid } = await service
          .from("users").select("id").in("id", fellowSet).is("deleted_at", null);
        fellowIds = (valid ?? []).map((u) => u.id);
      }
    }
    if (fellowIds.length) {
      const { data: host } = await service
        .from("users").select("display_name").eq("id", userId).maybeSingle();
      const rows = fellowIds.map((id) => ({
        user_id: id,
        type: "reservation_invite",
        payload: {
          reservation_id: reservation.id,
          room_title: title,
          host_name: host?.display_name ?? null,
          scheduled_at: reservation.scheduled_at,
        },
      }));
      await service.from("notifications").insert(rows);
      notified = fellowIds.length;
    }
  }

  return json({ reservation_id: reservation.id, scheduled_at: reservation.scheduled_at, notified }, 201);
});
