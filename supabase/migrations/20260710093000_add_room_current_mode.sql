-- G-261 호스트 모드 전환 broadcast (contracts/RoomView.md §G-261)
-- late joiner 가 입장 시 방의 현재 진행 모드를 복원할 수 있도록 rooms 에 저장.
-- 쓰기는 set-room-mode Edge(service_role, 호스트 검증)만 — 클라 직접 UPDATE 는 기존 rooms RLS 가 차단.
alter table public.rooms
  add column if not exists current_mode text not null default 'normal';

alter table public.rooms
  add constraint rooms_current_mode_check check (current_mode in ('normal', 'vgen', 'dub'));
