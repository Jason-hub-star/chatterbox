// ensure-studio-room: 유저의 쇼츠 제작소 방(is_studio) get-or-create 멱등.
// VGEN 이 room 강결합(room_id·호스트검증·R2 경로)이라 로비 독립 쇼츠를 위해 "숨겨진 1인 작업방"을
// 재사용한다 — 기존 trigger-vgen/create-vgen-reference-upload/R2 경로·보안(SEC-2/3) 무변경.
// 유저당 1개(uniq_studio_per_host) — 재진입 시 같은 방 반환 → vgen_jobs 히스토리 누적.
import { cors, json, getAppUser } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  // 기존 스튜디오 재사용
  const { data: existing } = await service
    .from("rooms").select("id").eq("host_id", userId).eq("is_studio", true).maybeSingle();
  if (existing) return json({ room_id: existing.id }, 200);

  // 없으면 생성(1인·숨김). status='waiting'·current=1 은 create-room 과 동형(멤버십·호스트검증 재사용).
  const { data: room, error: rErr } = await service
    .from("rooms")
    .insert({
      host_id: userId,
      title: "Studio",
      max_participants: 1,
      language: "ko",
      status: "waiting",
      current_participants: 1,
      is_studio: true,
    })
    .select("id")
    .single();
  if (rErr || !room) {
    // 동시 진입 경합(uniq_studio_per_host 위반) — 재조회로 수렴.
    const { data: race } = await service
      .from("rooms").select("id").eq("host_id", userId).eq("is_studio", true).maybeSingle();
    if (race) return json({ room_id: race.id }, 200);
    return json({ error: "Studio create failed", detail: rErr?.message }, 500);
  }

  const { error: pErr } = await service
    .from("room_participants")
    .insert({ room_id: room.id, user_id: userId, slot_index: 0, role: "actor", state: "connected" });
  if (pErr) {
    await service.from("rooms").delete().eq("id", room.id); // 유령 방 방지 롤백
    return json({ error: "Studio participant failed", detail: pErr.message }, 500);
  }

  return json({ room_id: room.id }, 201);
});
