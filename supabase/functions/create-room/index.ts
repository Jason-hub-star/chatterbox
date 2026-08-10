// create-room: 방 생성 + 호스트 참가자 행 삽입.
// SSOT: docs/specs/API-SURFACE.md, docs/contracts/LobbyPage.md, docs/state-machines/Room.md (IDLE→CREATING→WAITING)
// 입력: { title, max_participants?, language?, genre?, reservation_id? }  출력: { room_id, participant_id, status }
// RES-ROOM: reservation_id 를 주면 그 예약과 방을 잇고 초대자 전원에게 방을 알린다.

import { cors, json, getAppUser } from "../_shared/supa.ts";

// LOB-03 장르 화이트리스트 — 로비 카드 배지·필터의 어휘(i18n lobby.genre.* 와 1:1).
const GENRES = ["comedy", "drama", "romance", "fantasy", "horror", "free"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await getAppUser(req);
  if (!auth.ok) return auth.res;
  const { userId, service } = auth.user;

  let body: {
    title?: unknown;
    max_participants?: unknown;
    language?: unknown;
    genre?: unknown;
    reservation_id?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 80) return json({ error: "Invalid title" }, 400);

  // ROOM_MAX_USERS(FeatureFlags): 전역 정원 상한 — app_config 플래그(기본 6). 방별 정원 "강제"는
  // join_room_as_participant RPC('full' 409, FOR UPDATE 원자)가 담당하고, 여긴 생성 시 상한만 클램프.
  const { data: capRow } = await service
    .from("app_config").select("value").eq("key", "ROOM_MAX_USERS").maybeSingle();
  const roomMaxUsers = Number((capRow?.value as { value?: number } | null)?.value) || 6;
  const maxP = Number.isInteger(body.max_participants) ? (body.max_participants as number) : Math.min(6, roomMaxUsers);
  if (maxP < 1 || maxP > roomMaxUsers) return json({ error: "Invalid max_participants" }, 400);

  // SEC-CR-2: 화이트리스트 — 자유 문자열 저장 오염 방지(genre 와 동형).
  const LANGS = ["ko", "en", "ja"];
  const language = typeof body.language === "string" && LANGS.includes(body.language) ? body.language : "ko";
  // 장르(옵션) — 화이트리스트 외 값은 무시(null): 자유 텍스트가 배지 어휘를 오염시키지 않게.
  const genre = typeof body.genre === "string" && GENRES.includes(body.genre) ? body.genre : null;

  // RES-ROOM: 예약으로 여는 방이면 먼저 검증한다 — 레이트리밋보다 앞에 둬서, 남의 예약을 찔러본
  //   요청이 호스트의 시간당 5회를 태우지 않게 한다. 방을 만든 뒤 검증하면 유령 방이 남는다.
  const reservationId = typeof body.reservation_id === "string" ? body.reservation_id : null;
  let reservation: { id: string; room_id: string | null } | null = null;
  if (reservationId) {
    // 소유 검증은 JS 비교가 아니라 쿼리 필터로 — 본인 예약이 아니면 행 자체가 안 나와서
    //   존재 여부도 새지 않는다(예약 id 열거 방지). rooms 호스트게이트와는 별개 테이블이다.
    const { data: resv } = await service
      .from("room_reservations")
      .select("id, room_id")
      .eq("id", reservationId)
      .eq("host_id", userId)
      .maybeSingle();
    if (!resv) return json({ error: "Reservation not found" }, 404);
    if (resv.room_id) {
      // 이미 연 예약 — 두 번째 방을 만들면 첫 방이 고아가 된다. 기존 방을 돌려주고 끝낸다
      //   (스테일 UI·더블클릭 방어. 클라는 이 room_id 로 이동한다).
      const { data: prev } = await service.from("rooms").select("status").eq("id", resv.room_id).maybeSingle();
      if (prev && prev.status !== "ended") {
        return json({ error: "Reservation already opened", room_id: resv.room_id }, 409);
      }
    }
    reservation = { id: resv.id, room_id: resv.room_id };
  }

  // 레이트리밋(SEC-CR-1): 사용자당 5회/시간 — 방 스팸·로비 오염 차단(check_rate_limit RPC 재사용).
  const { data: rlOk } = await service.rpc("check_rate_limit", { p_key: `room-create:${userId}`, p_max: 5, p_window_sec: 3600 });
  if (rlOk === false) return json({ error: "방 생성이 너무 잦아요. 잠시 후 다시 시도해주세요." }, 429);

  // 방 생성 (status='waiting', 호스트 포함 current_participants=1)
  // 신규 방 기본 무대 배경 = 모닥불 씬(방장이 관리탭에서 교체 가능). set-room-background 와 동일 /scenes/ 경로라 서버검증 통과.
  const { data: room, error: rErr } = await service
    .from("rooms")
    .insert({ host_id: userId, title, max_participants: maxP, language, genre, status: "waiting", current_participants: 1, background_url: "/scenes/room-stage/campfire-forest.webp" })
    .select("id, status")
    .single();
  if (rErr || !room) return json({ error: "Create room failed", detail: rErr?.message }, 500);

  // 호스트를 slot 0 actor 로 등록
  const { data: part, error: pErr } = await service
    .from("room_participants")
    .insert({ room_id: room.id, user_id: userId, slot_index: 0, role: "actor", state: "connected" })
    .select("id")
    .single();
  if (pErr || !part) {
    // 참가자 없이 남는 유령 방 방지: 롤백
    await service.from("rooms").delete().eq("id", room.id);
    return json({ error: "Create participant failed", detail: pErr?.message }, 500);
  }

  // RES-ROOM: 예약↔방 연결 + 초대자에게 "방이 열렸다" 통지.
  //   대상 조회는 cancel-reservation 과 같은 원장(reservation_invite 알림 행)을 쓴다 — 초대 대상
  //   전용 테이블이 따로 없고, 두 곳이 다른 원장을 보면 취소는 갔는데 개시는 안 가는 식으로 갈린다.
  if (reservation) {
    const { error: linkErr } = await service
      .from("room_reservations")
      .update({ room_id: room.id })
      .eq("id", reservation.id)
      .eq("host_id", userId);
    if (linkErr) console.error("예약↔방 연결 실패(비치명):", linkErr.message);

    const { data: invited } = await service
      .from("notifications")
      .select("user_id")
      .eq("type", "reservation_invite")
      .eq("payload->>reservation_id", reservation.id);
    const targets = [...new Set((invited ?? []).map((n: { user_id: string }) => n.user_id))]
      .filter((id) => id !== userId); // 호스트 본인은 이미 방 안에 있다
    if (targets.length) {
      const { error: nErr } = await service.from("notifications").insert(
        targets.map((id) => ({
          user_id: id,
          type: "reservation_room_open",
          room_id: room.id,
          payload: { reservation_id: reservation.id, room_id: room.id, room_title: title },
        })),
      );
      if (nErr) console.error("reservation_room_open 알림 실패(비치명):", nErr.message);
    }
  }

  // PROFILE-05 팔로워 공연시작 알림 — as-built: rooms.status 'live' 전환이 미구현이라 생성 시점 발송
  // (live FSM 구현 시 그 전이 지점으로 이동). 스팸 캡: 시간당 10회 + 팔로워 상한 200. 실패해도 방 생성은 성립.
  try {
    const { data: notifyAllowed } = await service
      .rpc("check_rate_limit", { p_key: `stream-notify:${userId}`, p_max: 10, p_window_sec: 3_600 });
    if (notifyAllowed !== false) {
      const { data: followers } = await service
        .from("friendships")
        .select("user_id")
        .eq("relationship_type", "follow")
        .eq("friend_id", userId)
        .eq("status", "accepted")
        .is("deleted_at", null)
        .limit(200);
      if (followers?.length) {
        const { data: host } = await service.from("users").select("display_name").eq("id", userId).maybeSingle();
        await service.from("notifications").insert(
          followers.map((f) => ({
            user_id: f.user_id,
            type: "followed_creator_stream_start",
            room_id: room.id,
            payload: { room_id: room.id, room_title: title, host_name: host?.display_name ?? null },
          })),
        );
      }
    }
  } catch (e) {
    console.error("follower notify failed:", e instanceof Error ? e.message : String(e));
  }

  return json({ room_id: room.id, participant_id: part.id, status: room.status }, 201);
});
