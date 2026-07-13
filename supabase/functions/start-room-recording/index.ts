// start-room-recording(G3·ROOM-13): 호스트가 녹화 동의 수집을 시작한다.
// SSOT: specs/security/consent-credits-quota.md §11.1.1 — all_consented 전까지 녹화 시작 불가.
// 입력: { room_id }  출력: { ok, recording_id, all_consented }
// 호스트 동의는 시작 행위로 즉시 기록(ip_hash 포함). 나머지 참가자에겐 room-authority
// 서버발 broadcast 로 동의 요청(수신측은 participant===undefined 만 신뢰 — SEC-RA-1 패턴).

import { cors, json, getAppUser, isUuid, requireHostRoom } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";
import { hashIp, recomputeConsent } from "../_shared/recordingConsent.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.room_id)) return json({ error: "Invalid room_id" }, 400);
  const roomId = body.room_id;

  const gate = await requireHostRoom(service, roomId, userId);
  if (!gate.ok) return gate.res;

  // 방당 활성 녹화 1개(중복 시작 방지)
  const { data: active } = await service
    .from("recordings").select("id")
    .eq("room_id", roomId)
    .in("status", ["consent_pending", "recording", "processing"])
    .maybeSingle();
  if (active) return json({ error: "이미 진행 중인 녹화가 있어요.", recording_id: active.id }, 409);

  // 호스트 동의 즉시 기록 후 all_consented 재계산(1인 방이면 바로 true)
  const consent = {
    participants: {
      [userId]: {
        consented: true,
        consented_at: new Date().toISOString(),
        consent_type: "pre" as const,
        ip_hash: await hashIp(req),
      },
    },
    all_consented: false,
  };
  consent.all_consented = await recomputeConsent(service, roomId, consent);

  const { data: rec, error: iErr } = await service
    .from("recordings")
    .insert({ room_id: roomId, user_id: userId, status: "consent_pending", consent_json: consent })
    .select("id")
    .single();
  if (iErr || !rec) return json({ error: "녹화 생성 실패", detail: iErr?.message }, 500);

  try {
    await broadcastData(
      roomId,
      new TextEncoder().encode(JSON.stringify({
        type: "recording_consent",
        recording_id: rec.id,
        all_consented: consent.all_consented,
        rid: crypto.randomUUID(),
      })),
      "room-authority",
    );
  } catch { /* broadcast 실패는 치명 아님 — 참가자는 재요청으로 복구 */ }

  return json({ ok: true, recording_id: rec.id, all_consented: consent.all_consented }, 201);
});
