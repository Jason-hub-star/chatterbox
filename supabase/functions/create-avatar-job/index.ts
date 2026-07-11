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

  // 레이트리밋(SEC-AVJ-1): 사용자당 10회/시간 — Modal GPU 비용 무한호출·잡 스팸 차단(check_rate_limit RPC 재사용).
  const { data: rlOk } = await service.rpc("check_rate_limit", { p_key: `avatar-job:${userId}`, p_max: 10, p_window_sec: 3600 });
  if (rlOk === false) return json({ error: "아바타 생성 요청이 너무 잦아요. 잠시 후 다시 시도해주세요." }, 429);

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

  // 크레딧 차감(결제 슬라이스 대비 — 도그푸딩 옵션 A). AVATAR_CREDIT_ENABLED flag off(기본)면 무료: 구조만 예약.
  // ⚠️ 여기선 spawn 실패까지만 환불(멱등 refund). 파이프라인 중간실패(리깅 단계) 환불은 결제 슬라이스에서 webhook/트리거로.
  const { data: flagRow } = await service.from("app_config").select("value").eq("key", "AVATAR_CREDIT_ENABLED").maybeSingle();
  const creditEnabled = (flagRow?.value as { value?: boolean } | null)?.value === true;
  const AVATAR_CREDIT_COST = 20; // 1잡 = 20크레딧(원가 ~$2 커버, VgenCostAnalysis 티어 정합). 결제 슬라이스에서 확정.
  if (creditEnabled) {
    const { error: dErr } = await service.rpc("deduct_avatar_credit", { p_user_id: userId, p_amount: AVATAR_CREDIT_COST, p_job_id: job.id });
    if (dErr) {
      const insufficient = dErr.message.includes("CREDIT_INSUFFICIENT");
      await service.from("avatar_jobs").update({ status: "failed", error: insufficient ? "credit_insufficient" : "credit_error" }).eq("id", job.id);
      return json({ error: insufficient ? "크레딧이 부족해요." : "크레딧 차감 실패" }, insufficient ? 402 : 500);
    }
  }

  // 업로드 PNG signed GET URL — Modal 이 볼륨으로 다운로드(1시간 유효, 다운로드는 즉시).
  const { data: signed, error: sErr } = await service.storage
    .from("avatar-uploads").createSignedUrl(key, 3600);
  if (sErr || !signed?.signedUrl) {
    await service.rpc("refund_avatar_credit", { p_job_id: job.id }); // 멱등 — 미차감(flag off)이면 no-op
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
    await service.rpc("refund_avatar_credit", { p_job_id: job.id }); // 멱등 — 미차감(flag off)이면 no-op
    await service.from("avatar_jobs").update({ status: "failed", error: "provider_error" }).eq("id", job.id);
    return json({ error: "아바타 생성 요청 실패", detail: String(e).slice(0, 200) }, 502);
  }
});
