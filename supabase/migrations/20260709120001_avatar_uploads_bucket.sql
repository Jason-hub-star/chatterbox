-- avatar-uploads 버킷(private) — 사용자 PNG 업로드처. 발행처 avatars(public)는 기존.
-- RLS: 본인 폴더(auth.uid()/uploads/*)만 insert/select. 엣지·파이프라인은 service_role(RLS 우회)로
--   signed URL 생성·다운로드. 키 형태 <authUid>/uploads/<uuid>.png = create-avatar-job 의
--   isSafeObjectKey(key, authId, ["uploads"]) 와 동일 오리진(정합).

-- 10MB·PNG 제한 = 클라 선검증(CommissionCorner validatePng)과 미러 — 우회 업로드 차단.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar-uploads', 'avatar-uploads', false, 10485760, array['image/png'])
on conflict (id) do nothing;

create policy "avatar_uploads_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatar-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar_uploads_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatar-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
