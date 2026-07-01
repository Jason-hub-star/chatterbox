---
tags: [guide]
---

# Runtime Hardening Review

> Updated: 2026-06-29
> Scope: host authority, LiveKit reconnect/token refresh, avatar/WebGL lifetime, R2 signed URL renewal, DUB locking, reactions, OBS viewer RLS, onboarding token gate.

## 결론

주인님이 제시한 H1-H16은 대부분 "권한은 맞지만 런타임 복구가 없다" 또는 "스펙은 있다고 되어 있지만 메시지/락/재동기 규칙이 없다"는 유형이다. 구현자는 아래 규칙을 통과하기 전 해당 Feature ID를 착수하지 않는다.

## H등급 차단/하드닝 항목

| ID | Feature ID | 확인 결과 | 차단/하드닝 규칙 | 상태 |
|---|---|---|---|---|
| H1 | HOST-06 | host 이탈 시 host_id 이전/빈 방 종료 윈도우가 불명확 | host transfer는 DB transaction + `authority_epoch` 증가로만 수행. 빈 방은 30초 grace 후 `ended` | BLOCKING SPEC |
| H2 | ROOM-10 | 토큰 갱신 중 DataChannel 재생성 순서가 약함 | reconnect 후 snapshot fetch → DataChannel 재등록 → blendshape 송신 재개 순서 강제 | BLOCKING SPEC |
| H3 | VGEN-02 | C3 DB 레이어 크레딧 레이스는 이미 스펙 존재 | GAP-MATRIX에서 DONE 처리. 구현 전 transaction self-check 필요 | DONE SPEC |
| H4 | ROOM-18/RT-05 | 1h signed URL 만료 중 배속 재생 403 복구 없음 | media fetch/play 401/403은 object_key로 signed URL 재발급 후 currentTime/playbackRate 복원 | BLOCKING SPEC |
| H5 | ROOM-04 | 로컬 마이크 UI와 원격 수신 성공이 분리됨 | uplink heartbeat + remote subscriber ack 없으면 "상대에게 안 들림" 경고 | BLOCKING SPEC |
| H6 | ROOM-04 | LiveKit 방 파기와 Supabase `rooms.status` 불일치 가능 | LiveKit webhook/reaper가 `live_participant_count=0` 확인 후 DB `ended` 처리 | BLOCKING SPEC |
| H7 | ROOM-03 | 다중 탭/컨텍스트 고갈 시 Ghost Speaker 가능 | WebGL context loss 감지 시 avatar disabled + voice-only badge + host alert | BLOCKING SPEC |
| H8 | ROOM-03 | destroy 중 LiveKit callback race는 일부 문서화됨 | `isDestroying` guard + listener 제거 완료 전 renderer destroy 금지 | PARTIAL → LOCKED |
| H9 | ROOM-03/11 | 6인 tracking CPU 과부하를 host가 못 봄 | tracking health telemetry를 5초 주기로 집계, host console에 failed/throttled 표시 | BLOCKING SPEC |
| H10 | RT-02 | 부분/손상 blendshape frame이 filter로 들어갈 수 있음 | `seq`, `byte_length`, `crc16` 검증 실패 frame drop | BLOCKING SPEC |
| H11 | VGEN-04 | FORMAT_CONVERTING 후 offline client가 stale job 상태 유지 가능 | reconnect 시 `generation_id/job.updated_at` 비교 후 DB snapshot이 항상 이김 | BLOCKING SPEC |
| H12 | DUB-03/04 | 녹음 중 역할 수정 lock 전략 없음 | `role_version`, `roles_locked_at`; recording 중 role edit 금지 또는 새 version 강제 | BLOCKING SPEC |
| H13 | ROOM-19 | reaction 포맷/화이트리스트/TTL 없음 | `reaction_kind` whitelist + TTL 3000ms + rate limit 5/sec | BLOCKING SPEC |
| H14 | HOST/ROOM | 방장 부재 시 `cue_advance` 권한 공백 | host transfer 실패 시 `cue_operator_id` 임시 승계. 모든 cue 메시지는 `authority_epoch` 포함 | BLOCKING SPEC |
| H15 | OBS-02 | `?obs=1` 비인증 Realtime/RLS 재도입 위험 | OBS는 P2 방송 송출 옵션. P0/MVP에서는 구현하지 않으며, 구현 시 `obs_viewer_tokens` 기반 signed read token만 허용 | DEFERRED |
| H16 | AUTH/VGEN-02 | onboarding_step 갱신 전 LiveKit token 발급 가능 | token Edge Function은 `users.onboarding_step in ('lobby','done')` 또는 valid invite를 요구 | BLOCKING SPEC |

## 자기리뷰 체크

- 이미 닫힌 항목을 재작업하지 않았는가: H3는 C3 스펙을 재사용하고 DONE로 표시했다.
- 새 의존성을 추가했는가: 아니오. DB 필드/상태 규칙/Edge Function guard만 추가했다.
- 런타임 장애가 UI 증상으로 드러나는가: H5/H7/H9는 사용자와 host 모두에게 보이는 상태로 명시했다.
- 서버가 authoritative한가: H1/H4/H6/H11/H12/H16은 DB/Edge/Webhook snapshot이 클라이언트보다 우선한다.
- 아직 구현 금지로 남긴 항목이 있는가: H15 OBS는 P2 방송 송출 옵션으로 미뤘고, 토큰 없는 레거시 진입은 계속 금지다.

## 다음 구현 전 필수 질문

다음엔 이렇게 말하면 좋아:

> "H1-H16 중 BLOCKING SPEC 항목을 실제 migration/Edge Function/Zustand self-check 목록으로 쪼개서 구현 순서까지 정리해줘."
