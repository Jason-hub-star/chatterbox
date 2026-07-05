-- room_secrets: 방 비밀번호 해시(잠금방). SSOT: docs/DATA-SCHEMA.md §1.2.1
-- 클라 직접 접근 금지 — Edge Function(service_role)만 읽기/쓰기.
-- public_rooms 뷰는 이 테이블을 조인하지 않는다(password_hash 노출 금지).
create table room_secrets (
  room_id       uuid primary key references rooms(id) on delete cascade,
  password_hash text,                                                   -- PBKDF2 해시. null = 미설정
  invite_salt   text not null default encode(gen_random_bytes(16), 'hex'),
  updated_at    timestamptz default now()
);

-- RLS 활성화 + 정책 없음(deny-all): 클라 직접 SELECT/쓰기 차단. 서버는 service_role 로 우회.
alter table room_secrets enable row level security;

create trigger set_updated_at
  before update on room_secrets
  for each row execute function update_timestamp();
