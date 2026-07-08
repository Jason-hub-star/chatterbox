-- room_invites: 초대링크 (LOB-05). SSOT: docs/DATA-SCHEMA.md §1.2.2 · contracts/LobbyPage.md §초대링크
-- 원문 코드는 저장 금지 — SHA-256 해시만(128-bit 엔트로피, SEC-INVITE-ENTROPY). 발급·검증·수락은
-- 전부 Edge Function(service_role) 경유: create-room-invite / verify-invite-code / accept-invite.
create table room_invites (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references rooms(id) on delete cascade,
  invited_user_id  uuid references users(id) on delete cascade, -- null = 링크 소지자 누구나
  invite_code_hash text not null unique,
  role             text not null default 'actor' check (role in ('actor', 'viewer')),
  role_source      text not null default 'host_selected',
  max_uses         int  not null default 5 check (max_uses between 1 and 20),
  used_count       int  not null default 0,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_by       uuid not null references users(id) on delete cascade,
  created_at       timestamptz default now()
);

create index idx_room_invites_room on room_invites(room_id);

-- RLS 활성화 + 정책 없음(deny-all, room_secrets 와 동형): 클라 직접 읽기 경로 자체가 없다.
-- ponytail: 호스트의 초대 목록/폐기 UI가 생기면 그때 created_by SELECT 정책 추가.
alter table room_invites enable row level security;

-- consume_room_invite: 검증+사용횟수 증가를 행 잠금 아래 원자 처리(동시 수락 레이스 차단).
-- read-only 검증은 verify-invite-code(Edge)가 따로 한다 — 소비는 이 함수만.
-- SECURITY: service_role(Edge) 전용 — p_user_id 가 파라미터라 클라 노출 금지(join RPC 와 동일 규칙).
create or replace function consume_room_invite(p_code_hash text, p_user_id uuid)
returns table(status text, room_id uuid, invite_role text)
language plpgsql
set search_path = public
as $$
declare
  v room_invites%rowtype;
begin
  select * into v from room_invites ri
  where ri.invite_code_hash = p_code_hash
  for update;
  if not found then status := 'invalid'; return next; return; end if;
  if v.revoked_at is not null then status := 'revoked'; return next; return; end if;
  if v.expires_at <= now() then status := 'expired'; return next; return; end if;
  if v.invited_user_id is not null and v.invited_user_id <> p_user_id then
    status := 'not_invited'; return next; return;
  end if;
  if v.used_count >= v.max_uses then status := 'used_up'; return next; return; end if;

  update room_invites set used_count = used_count + 1 where id = v.id;
  status := 'ok'; room_id := v.room_id; invite_role := v.role;
  return next;
end;
$$;

revoke all on function consume_room_invite(text, uuid) from public;
revoke all on function consume_room_invite(text, uuid) from anon;
revoke all on function consume_room_invite(text, uuid) from authenticated;
grant execute on function consume_room_invite(text, uuid) to service_role;
