-- avatar-uploads 버킷 포맷 확장: PNG-only → PNG + WebP + JPEG (다포맷 네이티브 통과).
-- 근거(Phase 0 파리티 프로브): Modal 리깅 파이프라인(~/jason/Vtube/scripts/modal_rig_app.py)은
--   signed URL 바이트를 ref.png 로 저장 후 PIL.Image.open(...).convert("RGB") 로 디코드 —
--   매직바이트 자동판별(확장자 무시)이라 포맷 무관. 매팅(seethrough_decompose)은 디코드된 RGB
--   픽셀에만 작동. WebP-lossless 는 PNG 와 픽셀 동일(+파일 더 작음), 손실(JPEG/WebP-lossy) 델타는
--   매팅 LANCZOS 다운스케일 해상도(640)에서 엣지 ~1.5%로 작음. ⟹ Modal·Edge 변경 0.
--
-- 클라 선검증(CommissionCorner validateImage)·avatarJobs EXT 맵과 미러 — 우회 업로드 차단 유지.
-- file_size_limit(10MB)·RLS 정책·기존 png 는 불변. 20260709120001 의 insert-on-conflict 뒤 멱등 UPDATE.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/webp', 'image/jpeg']
where id = 'avatar-uploads';
