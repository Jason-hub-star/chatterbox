// cancel-reservation: 예약 공연 취소(LOB-06). SSOT: docs/schema §room_reservations
//
// RES-CANCEL — 왜: 예약을 만들 수는 있는데 무를 수가 없었다 — 일정이 바뀌어도 호스트가 할 수 있는 게 없고,
//   pg_cron 리마인더(`send_reservation_reminders`)는 시작 30분 전에 호스트+초대자 전원에게
//   "곧 시작합니다" 알림을 그대로 쏜다. 취소 부재의 실제 피해는 목록이 지저분한 게 아니라 이 알림이다.
//
// 설계: **행을 지운다**(soft delete 아님, 마이그레이션 0).
//   - cancelled_at 컬럼을 추가하는 길은 리마인더 쿼리(`scheduled_at between … and reminded_at is null`)를
//     **같이** 고쳐야 성립한다 — 안 고치면 취소한 예약이 계속 알림을 쏜다(한 곳만 고치면 남는 형제 버그).
//     행이 없으면 그 커플링 자체가 사라진다.
//   - 대신 감사 이력이 안 남는다. ceiling: 이력이 필요해지면 cancelled_at + 리마인더 쿼리를 **한 커밋에서**.
//   - 초대자 원장은 room_reservations 가 아니라 notifications(reservation_invite) 행이라(리마인더가 쓰는
//     그 원장) 예약 행을 지워도 "누구에게 알렸나"는 그대로 조회 가능하다.
import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { reservation_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.reservation_id)) return json({ error: "Invalid reservation_id" }, 400);
  const reservationId = body.reservation_id;

  // 소유자 검증(성역): RLS 는 SELECT 만 막고 이 함수는 service_role 이라 여기서 서버가 확정한다.
  const { data: row } = await service
    .from("room_reservations")
    .select("id, host_id, title, scheduled_at")
    .eq("id", reservationId)
    .maybeSingle();
  if (!row) return json({ error: "Reservation not found" }, 404);
  if (row.host_id !== userId) return json({ error: "Not the host" }, 403);

  // 통지 대상을 먼저 읽는다(삭제 후에도 원장은 남지만, 순서를 고정해 의도를 분명히).
  const { data: invited } = await service
    .from("notifications")
    .select("user_id")
    .eq("type", "reservation_invite")
    .eq("payload->>reservation_id", reservationId);

  // 삭제가 본체 — 리마인더를 끊는 행위다. 아래 통지가 실패해도 이건 성립해야 하므로 먼저 한다.
  const { error: delErr } = await service.from("room_reservations").delete().eq("id", reservationId);
  if (delErr) return json({ error: "Cancel failed" }, 500);

  let notified = 0;
  const targets = [...new Set((invited ?? []).map((n) => n.user_id as string))];
  if (targets.length) {
    const { data: host } = await service
      .from("users").select("display_name").eq("id", userId).maybeSingle();
    // 통지 실패는 취소를 되돌리지 않는다 — 되돌리면 리마인더가 살아나 피해가 더 크다.
    const { error: notiErr } = await service.from("notifications").insert(
      targets.map((id) => ({
        user_id: id,
        type: "reservation_cancelled",
        payload: {
          reservation_id: reservationId,
          room_title: row.title,
          host_name: host?.display_name ?? null,
          scheduled_at: row.scheduled_at,
        },
      })),
    );
    if (notiErr) console.error("cancel notify failed:", notiErr.message);
    else notified = targets.length;
  }

  return json({ ok: true, notified }, 200);
});
