// record-recording-consent(G3·ROOM-13): 참가자 녹화 동의/거절 기록 + all_consented 재계산.
// SSOT: specs/security/consent-credits-quota.md §11.1.1·§11.2 — dub record-consent 와 동형 + ip_hash.
// 입력: { recording_id, consented }  출력: { ok, all_consented }
// 재계산 결과는 room-authority 서버발 broadcast 로 전원(특히 호스트 자동 시작 트리거)에 전파.

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";
import { broadcastData } from "../_shared/livekit.ts";
import { hashIp, recomputeConsent, type RecordingConsent } from "../_shared/recordingConsent.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { recording_id?: unknown; consented?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.recording_id)) return json({ error: "Invalid recording_id" }, 400);
  const recordingId = body.recording_id;
  const consented = body.consented === true;

  const { data: rec } = await service
    .from("recordings")
    .select("id, room_id, status, consent_json")
    .eq("id", recordingId)
    .maybeSingle();
  if (!rec) return json({ error: "녹화를 찾을 수 없어요." }, 404);
  if (rec.status !== "consent_pending" && rec.status !== "recording") {
    return json({ error: "동의를 받을 수 있는 상태가 아니에요." }, 409);
  }

  const { data: me } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", rec.room_id)
    .eq("user_id", userId)
    .neq("state", "left")
    .maybeSingle();
  if (!me) return json({ error: "방 참가자만 동의할 수 있어요." }, 403);

  const consent: RecordingConsent = rec.consent_json ?? { participants: {}, all_consented: false };
  consent.participants[userId] = {
    consented,
    consented_at: new Date().toISOString(),
    consent_type: "pre",
    ip_hash: await hashIp(req),
  };
  const tally = await recomputeConsent(service, rec.room_id, consent);
  consent.all_consented = tally.all;

  const { error: uErr } = await service
    .from("recordings")
    .update({ consent_json: consent })
    .eq("id", recordingId);
  if (uErr) return json({ error: "동의 기록 실패", detail: uErr.message }, 500);

  // UX-CONSENT-DECLINE(D4): 거절 시 호스트가 "누가 거절했는지" 알 수 있게 declined + 이름을 payload 에 실어
  // broadcast(전엔 all_consented:false 만 보내 호스트가 '동의 대기'에서 영영 멈췄음). 거절 경로만 이름 룩업.
  let declinedName: string | null = null;
  if (!consented) {
    const { data: u } = await service.from("users").select("display_name").eq("id", userId).maybeSingle();
    declinedName = u?.display_name ?? null;
  }

  try {
    await broadcastData(
      rec.room_id,
      new TextEncoder().encode(JSON.stringify({
        type: "recording_consent_update",
        recording_id: recordingId,
        all_consented: consent.all_consented,
        // REC-CONSENT-N: 호스트 화면의 "⏳ 동의 대기중 n/N". 거절만 통지하던 D4 에서 한 칸 더 —
        //   무응답자는 여전히 침묵이지만 남은 인원수는 보인다.
        consented_count: tally.consented,
        required_count: tally.required,
        declined: !consented,
        declined_name: declinedName,
        rid: crypto.randomUUID(),
      })),
      "room-authority",
    );
  } catch { /* 비치명 */ }

  return json({ ok: true, all_consented: consent.all_consented }, 200);
});
