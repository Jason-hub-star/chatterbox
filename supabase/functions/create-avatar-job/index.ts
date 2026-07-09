// create-avatar-job: PNG→Live2D 리깅 잡 트리거 — Modal 웹엔드포인트 spawn(본인 업로드).
// trigger-vgen 패턴 복제 축소: 크레딧/모더레이션/디덥 제외(기능 수직 슬라이스 해피패스).
// 입력: { object_key }  — 클라가 avatar-uploads 버킷 `<userId>/uploads/<uuid>.png` 에 올린 키.
// 출력: { job_id, status }
//
// 성역: MODAL_TRIGGER_SECRET 는 Edge 런타임 시크릿(클라 노출 금지). Modal 이 이 시크릿으로 요청 인증.

import { cors, json, getAppUser, isSafeObjectKey } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, authId, service } = auth.user;

  let body: { object_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // 업로드 키 안전 검증: `<authUid>/uploads/<파일명>` (경로조작 방지, isSafeObjectKey 재사용).
  // 폴더 최상위 = auth.uid() — Storage RLS(storage.objects, auth.uid() 기준)와 동일 오리진이라
  // 클라 업로드 정책과 정확히 정합한다(users.id 아님).
  const key = body.object_key;
  if (!isSafeObjectKey(key, authId, ["uploads"])) {
    return json({ error: "Invalid object_key" }, 400);
  }

  const endpoint = Deno.env.get("MODAL_ENDPOINT_URL");
  const triggerSecret = Deno.env.get("MODAL_TRIGGER_SECRET");
  if (!endpoint || !triggerSecret) {
    return json({ error: "아바타 생성 미설정(MODAL_ENDPOINT_URL)" }, 500);
  }

  // 잡 INSERT(queued).
  const { data: job, error: insErr } = await service.from("avatar_jobs").insert({
    user_id: userId,
    status: "queued",
    input_object_key: key,
    provider: "modal",
  }).select("id").single();
  if (insErr || !job) {
    return json({ error: "잡 생성 실패", detail: insErr?.message }, 500);
  }

  const expId = `av-${job.id}`;

  // 업로드 PNG signed GET URL — Modal 이 볼륨으로 다운로드(1시간 유효, 다운로드는 즉시).
  const { data: signed, error: sErr } = await service.storage
    .from("avatar-uploads").createSignedUrl(key, 3600);
  if (sErr || !signed?.signedUrl) {
    await service.from("avatar_jobs").update({ status: "failed", error: "signed_url" }).eq("id", job.id);
    return json({ error: "업로드 URL 생성 실패" }, 500);
  }

  // Modal 웹엔드포인트 spawn(트리거 시점 GPU 예약). 실패 = 잡 failed 기록.
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger_secret: triggerSecret,
        job_id: job.id,
        exp_id: expId,
        png_url: signed.signedUrl,
      }),
    });
    const data = await resp.json().catch(() => ({} as { call_id?: string }));
    if (!resp.ok) throw new Error(JSON.stringify(data).slice(0, 200));
    await service.from("avatar_jobs")
      .update({ status: "running", phase: "analyzing", provider_call_id: data.call_id ?? null })
      .eq("id", job.id);
    return json({ job_id: job.id, status: "running" }, 200);
  } catch (e) {
    await service.from("avatar_jobs").update({ status: "failed", error: "provider_error" }).eq("id", job.id);
    return json({ error: "아바타 생성 요청 실패", detail: String(e).slice(0, 200) }, 502);
  }
});
