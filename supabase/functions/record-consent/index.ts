// record-consent: 참가자 더빙 동의 기록 + all_consented 재계산.
// SSOT: docs/state-machines/DubSession.md §11(consent 게이트, G-43), DATA-SCHEMA §1.12 consent_json
// 입력: { dub_session_id, consented }  출력: { ok, all_consented }
//
// 동의 주체는 방의 활성 참가자 누구나(자기 동의만). all_consented = 활성 참가자 전원 consented.
// 녹화(recordings) 동의와 독립(G-43).

import { cors, json, getAppUser, isUuid } from "../_shared/supa.ts";

interface ConsentJson {
  participants: Record<string, { consented: boolean; consented_at: string }>;
  all_consented: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: { dub_session_id?: unknown; consented?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.dub_session_id)) return json({ error: "Invalid dub_session_id" }, 400);
  const sessionId = body.dub_session_id;
  const consented = body.consented === true;

  const { data: sess } = await service
    .from("dub_sessions")
    .select("id, room_id, consent_json")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return json({ error: "세션을 찾을 수 없어요." }, 404);

  // 호출자가 방의 활성 참가자인지 확인(자기 동의만 기록)
  const { data: me } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", sess.room_id)
    .eq("user_id", userId)
    .neq("state", "left")
    .maybeSingle();
  if (!me) return json({ error: "방 참가자만 동의할 수 있어요." }, 403);

  const consent: ConsentJson = sess.consent_json ?? { participants: {}, all_consented: false };
  consent.participants[userId] = { consented, consented_at: new Date().toISOString() };

  // 활성 참가자 전원 동의 여부 재계산
  const { data: parts } = await service
    .from("room_participants")
    .select("user_id")
    .eq("room_id", sess.room_id)
    .neq("state", "left");
  const allConsented = (parts ?? []).length > 0 &&
    (parts ?? []).every((p) => consent.participants[p.user_id]?.consented === true);
  consent.all_consented = allConsented;

  const { error: uErr } = await service
    .from("dub_sessions")
    .update({ consent_json: consent })
    .eq("id", sessionId);
  if (uErr) return json({ error: "동의 기록 실패", detail: uErr.message }, 500);

  return json({ ok: true, all_consented: allConsented }, 200);
});
