// submit-dub-output: 합성 결과 확정(호스트 전용).
// 성공 → dub_outputs ready + dub_sessions completed. 실패(error_message) → output failed + 세션 recording 복귀(재시도).
// SSOT: docs/state-machines/DubSession.md (COMPOSITING→COMPLETED / →FAILED), DubCompositor.md
// 입력: { output_id, output_path?, file_size_bytes?, duration_ms?, error_message? }  출력: { output_id, status }

import { cors, json, getAppUser, isUuid, isSafeObjectKey } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: {
    output_id?: unknown; output_path?: unknown;
    file_size_bytes?: unknown; duration_ms?: unknown; error_message?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isUuid(body.output_id)) return json({ error: "Invalid output_id" }, 400);

  // output + 세션 + 호스트 검증
  const { data: output } = await service
    .from("dub_outputs")
    .select("id, dub_session_id, dub_sessions(room_id, rooms(host_id))")
    .eq("id", body.output_id)
    .maybeSingle();
  if (!output) return json({ error: "출력을 찾을 수 없어요." }, 404);
  const sess = output.dub_sessions as unknown as { room_id: string; rooms: { host_id: string } };
  if (sess.rooms.host_id !== userId) return json({ error: "호스트만 확정할 수 있어요." }, 403);

  const errorMessage = typeof body.error_message === "string" && body.error_message ? body.error_message : null;

  // 실패 경로: output failed + 세션 recording 복귀(트랙 유지 → 재시도 가능)
  if (errorMessage) {
    await service.from("dub_outputs").update({ status: "failed", error_message: errorMessage }).eq("id", output.id);
    await service.from("dub_sessions").update({ status: "recording" }).eq("id", output.dub_session_id);
    return json({ output_id: output.id, status: "failed" }, 200);
  }

  // 성공 경로: 경로 프리픽스 변조 방지
  const outputPath = typeof body.output_path === "string" ? body.output_path : "";
  if (!isSafeObjectKey(outputPath, sess.room_id, ["outputs"])) {
    return json({ error: "output_path 프리픽스 불일치" }, 400);
  }
  const fileSize = Number.isInteger(body.file_size_bytes) ? (body.file_size_bytes as number) : null;
  const durationMs = Number.isInteger(body.duration_ms) ? (body.duration_ms as number) : null;
  const now = new Date().toISOString();

  const { error: e1 } = await service
    .from("dub_outputs")
    .update({
      output_object_key: outputPath,
      file_size_bytes: fileSize,
      duration_ms: durationMs,
      status: "ready",
      completed_at: now,
    })
    .eq("id", output.id);
  if (e1) return json({ error: "출력 확정 실패", detail: e1.message }, 500);

  await service
    .from("dub_sessions")
    .update({ status: "completed", completed_at: now })
    .eq("id", output.dub_session_id);

  // NOTI-DUB: 완성 통지. 중간 자동체인(STT·번역·분리)은 토스트가 있는데 **최종 완성만 무소식**이었다.
  //   합성은 브라우저 ffmpeg.wasm(DubCompositor)이라 그 탭에 붙어 있어야 하는데, 통지가 없으면
  //   자리를 비운 나머지 멤버는 완성 사실 자체를 모른다.
  //   대상 = 그 방의 활성 참가자(= is_dub_member 의 분모와 같은 규칙: room_participants state<>'left').
  //   트리거가 아니라 함수 인라인인 이유: 대상이 "행 1개의 컬럼"이 아니라 조회가 필요한 집합이다.
  //   supabase-js 는 에러를 throw 하지 않으므로 try/catch 가 아니라 반환 error 를 명시적으로 무시한다.
  const { data: members } = await service
    .from("room_participants")
    .select("user_id")
    .eq("room_id", sess.room_id)
    .neq("state", "left");
  const targets = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
  if (targets.length) {
    const { error: nErr } = await service.from("notifications").insert(
      targets.map((id) => ({
        user_id: id,
        type: "dub_output_ready",
        room_id: sess.room_id,
        payload: { dub_session_id: output.dub_session_id, output_id: output.id },
      })),
    );
    if (nErr) console.error("dub_output_ready 알림 실패(비치명):", nErr.message);
  }

  return json({ output_id: output.id, status: "ready" }, 200);
});
