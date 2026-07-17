// reap-stale-rooms: 좀비 방(참가자 행은 남았으나 LiveKit 실접속 0) 주기 회수 — R5 webhook 의 백스톱.
// 근본: 방 종료는 softLeaveRoom(마지막 배우 나감)에만 의존. leave-room·livekit-webhook 둘 다 못 뜨는
//   경로 — ①호스트가 방만 만들고 LiveKit 실접속 전 이탈 ②webhook 등록 이전 방 ③webhook 전달 실패 —
//   는 참가자 행이 'connected'로 영구 고착돼 로비 좀비가 된다. DB 만으론 "진짜 비었나"를 못 가리니
//   (거마비 사례: 좀비와 동일한 waiting·cur=1 인데 LiveKit 엔 실접속) LiveKit presence 를 직접 대조한다.
//
// 트리거: pg_cron(*/5) → net.http_post(이 함수) — 20260717120000_reap_stale_rooms_cron.sql.
// 인증(성역): verify_jwt=false(config.toml) + 함수 내부에서 Authorization bearer == SERVICE_ROLE_KEY 대조
//   (크론이 vault 의 service key 로 호출). 랜덤 외부 호출은 401 — 비용 API(LiveKit) 무단 구동 차단.
// 안전: grace(생성 10분 미만은 스킵 — 호스트 접속 중일 수 있음) · LiveKit presence>0 이면 절대 회수 안 함
//   (뷰어라도 실접속이면 유지) · 종료는 status 조건부 UPDATE(race 가드) · 멱등(이미 ended 면 no-op).
import { json, serviceClient } from "../_shared/supa.ts";
import { roomServiceClient } from "../_shared/livekit.ts";

const GRACE_MS = 10 * 60 * 1000; // 생성 직후 접속 유예
const MAX_PER_TICK = 100; // 틱당 상한(초과분은 다음 틱)

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 전용 시크릿 대조 — 크론(vault 의 reaper_secret)만 통과. SUPABASE_SERVICE_ROLE_KEY 는 런타임에
  // 신형 sb_secret 포맷이라 .env/vault 의 값과 문자열이 달라(매칭 취약) 전용 REAPER_SECRET 을 쓴다.
  // fail-closed: 시크릿 미설정(expected="")이면 모든 요청 401.
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const expected = Deno.env.get("REAPER_SECRET") ?? "";
  if (!expected || bearer !== expected) return json({ error: "Unauthorized" }, 401);

  const service = serviceClient();
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();

  // 후보: 로비 노출 대상(waiting/live) 중 정당한 상주(studio·practice·demo) 제외 + grace 경과.
  const { data: rooms, error } = await service
    .from("rooms")
    .select("id, host_id")
    .in("status", ["waiting", "live"])
    .eq("is_studio", false)
    .eq("is_practice", false)
    .eq("is_demo", false)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_TICK);
  if (error) return json({ error: "query failed", detail: error.message }, 500);
  if (!rooms || rooms.length === 0) return json({ ok: true, checked: 0, reaped: 0 }, 200);

  const lk = roomServiceClient();
  const nowIso = new Date().toISOString();
  let reaped = 0;

  const results = await Promise.allSettled(rooms.map(async (room) => {
    // LiveKit 실접속 대조 — 없음(throw=방 GC 완료) 또는 0명이면 좀비.
    let present = 0;
    try {
      const live = await lk.listParticipants(room.id);
      present = live.length;
    } catch {
      present = 0; // LiveKit 방 자체가 없음 → 실접속 0
    }
    if (present > 0) return false; // 누군가 실접속 — 유지(뷰어 포함)

    // 유료 더빙 보존(DUB-PERSIST): 진행 중 더빙 세션이 있는 방은 회수하지 않는다 — 종료하면 재입장이
    // 막혀 STT/번역 비용이 든 더빙이 고립된다(호스트가 LiveKit 미접속으로 나가도 방 유지 → 재입장 복원).
    const { data: activeDub } = await service
      .from("dub_sessions")
      .select("id")
      .eq("room_id", room.id)
      .not("status", "in", "(completed,failed)")
      .limit(1);
    if (activeDub && activeDub.length > 0) return false; // 진행 중 더빙 → 유지

    // 좀비 확정 → 방 종료(상태 조건부 = race 가드) + 참가자 행 soft-left.
    const { data: ended } = await service
      .from("rooms")
      .update({ status: "ended", ended_at: nowIso, current_participants: 0 })
      .eq("id", room.id)
      .in("status", ["waiting", "live"])
      .select("id");
    if (!ended || ended.length === 0) return false; // 사이에 이미 종료됨(멱등)
    await service
      .from("room_participants")
      .update({ state: "left", left_at: nowIso })
      .eq("room_id", room.id)
      .neq("state", "left");
    return true;
  }));

  for (const r of results) if (r.status === "fulfilled" && r.value) reaped++;
  return json({ ok: true, checked: rooms.length, reaped, capped: rooms.length === MAX_PER_TICK }, 200);
});
