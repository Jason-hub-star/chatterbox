// create-recording-track-upload(ROOM-28 P2a): 참가자가 **자기 로컬 원본 트랙**을 올릴 presign 을 받는다.
// SSOT: contracts/VoiceRecording.md §P2 설계 / DATA-SCHEMA §1.11.2 recording_tracks.
// 입력: { recording_id }  출력: { ok, upload_url, storage_key, track_id }
//
// 호스트 전용인 create-room-recording-upload 와 다르다 — 여기는 **참가자 본인**이 호출한다.
// 게이트 순서: 활성 참가자 → 음성 녹음(kind='voice') → 녹음 중 → **본인이 동의했는가**.
// 마지막이 핵심이다: 각자 자기 마이크를 로컬 녹음하므로 P1 보다 동의가 더 결정적이라,
// 동의 안 한 사람에게는 presign 자체를 주지 않는다(클라가 getUserMedia 를 안 부르는 것과 이중 방어).
// 키는 서버가 만들고 DB 에 박는다 — 제출(submit-recording-track)은 키를 아예 받지 않아 위조 여지가 0이다.

import { cors, json, getAppUser, isUuid, requireActiveParticipant } from "../_shared/supa.ts";
import { presignPut } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { recording_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.recording_id)) return json({ error: "Invalid recording_id" }, 400);
  const recordingId = body.recording_id;

  const { data: rec } = await service
    .from("recordings")
    .select("id, room_id, kind, status, consent_json")
    .eq("id", recordingId)
    .maybeSingle();
  if (!rec) return json({ error: "녹음을 찾을 수 없어요." }, 404);

  const gate = await requireActiveParticipant(service, rec.room_id, userId);
  if (!gate.ok) return gate.res;

  if (rec.kind !== "voice") return json({ error: "음성 녹음에서만 개별 트랙을 남겨요." }, 409);
  if (rec.status !== "recording") return json({ error: "녹음 중이 아니에요." }, 409);

  // 본인 동의 확인 — 전원 동의(all_consented)가 아니라 **호출자 본인**을 본다.
  const consent = rec.consent_json as { participants?: Record<string, { consented?: boolean }> } | null;
  if (consent?.participants?.[userId]?.consented !== true) {
    return json({ error: "내 목소리 녹음에 동의해야 트랙이 남아요.", code: "consent_required" }, 412);
  }

  const key = `recordings/${rec.room_id}/${recordingId}/tracks/${userId}.webm`;
  const { data: track, error: uErr } = await service
    .from("recording_tracks")
    .upsert(
      {
        recording_id: recordingId,
        participant_id: userId,
        storage_object_key: key,
        status: "recording",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "recording_id,participant_id" }, // 참가자당 1행(재시도·리테이크는 덮어쓰기)
    )
    .select("id")
    .single();
  if (uErr || !track) return json({ error: "트랙 생성 실패", detail: uErr?.message }, 500);

  const uploadUrl = await presignPut(key, 3600);
  return json({ ok: true, upload_url: uploadUrl, storage_key: key, track_id: track.id }, 200);
});
