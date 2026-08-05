-- SEC-1 (룸페이지 감사 3, A-P1h): 호스트 무대 초대 게이트.
-- accept-stage-invite 가 promote_viewer_to_actor 를 호출하기 전 이 컬럼이 non-null + 신선(≤120s)한지
-- 검사한다. invite-to-stage 가 대상 viewer 행에 now() 로 set(손들기 무관), 승격 성공 시 null 클리어.
-- 이 게이트 부재 시 viewer 가 accept-stage-invite 직접 호출로 무대 좌석·발화권을 자가획득하던
-- SEC-1(P1) 정수정. 승격 모델 = "호스트 직접 초대"(손들기 뷰어 버튼 폐기 유지, 2026-08-05 결정).
alter table room_participants
  add column if not exists stage_invited_at timestamptz default null;
