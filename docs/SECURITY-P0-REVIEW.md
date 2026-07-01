---
tags: [guide]
---

# Security P0 Review

> Updated: 2026-07-01
> Scope: LiveKit token, Supabase RLS, room secrets, invite/guest access, DataChannel SSOT, StageMode, FAL/R2 media path.

## 결론

주인님이 지적한 P0 8개는 모두 실제 설계 위험으로 확인했다. 구현자는 아래 차단 규칙을 통과하기 전 DB migration, Edge Function, room UI 구현을 시작하지 않는다.

## P0 차단 규칙

| ID | 확인 결과 | 차단 규칙 | 반영 문서 |
|---|---|---|---|
| P0-01 LiveKit token | `rooms.id`/`status`만 보면 활성 방 탈취 가능 | host 또는 활성 `room_participants(room_id,user_id)` 행이 있어야 토큰 발급 | `specs/livekit-edge-fn.md`, `specs/SecurityPolicies.md` |
| P0-02 RLS room 상관 | "어딘가의 참가자" 패턴이면 다른 방 row 접근 가능 | 모든 RLS는 대상 row의 `room_id`와 participant row의 `room_id`를 `EXISTS`로 묶는다 | `specs/SecurityPolicies.md`, `DATA-SCHEMA.md` |
| P0-03 password hash | `rooms.password_hash` 노출 위험 | `rooms.is_locked`만 공개, 해시는 `room_secrets`에 분리하고 client SELECT 금지 | `DATA-SCHEMA.md`, `contracts/LobbyPage.md` |
| P0-04 invite/guest | `invited_guests` 배열은 스키마 부재 + 감사 어려움 | `room_invites` 테이블로 만료/폐기/사용횟수 추적 | `DATA-SCHEMA.md`, `specs/SecurityPolicies.md` |
| P0-05 DataChannel SSOT | `vgen-collab`, `vgen-dubbing`, `director-notes`, `soundboard` 별도 채널 충돌 | 허용 채널은 `room-authority`, `chat`, `script-cue`, `blendshape` 4개뿐이다. 새 기능은 기존 채널의 type 확장 또는 Edge/DB relay로 처리 | `contracts/_INDEX.md`, `DATA-SCHEMA.md`, `contracts/VgenPanel.md`, `contracts/RightPanel.md` |
| P0-06 Stage mode | `normal/vgen/dub` 전이가 떠 있으면 동시 활성 가능 | `StageMode.md` FSM: `vgen<->dub` 직접 전환 금지 | `state-machines/StageMode.md` |
| P0-07 FAL key | 클라이언트 `fal.subscribe()`는 FAL_KEY/크레딧/모더레이션 우회 | 클라이언트는 Edge Function만 호출 | `contracts/VgenExport.md`, `specs/SecurityPolicies.md` |
| P0-08 R2 public URL | `getPublicUrl()` 예시는 공개 URL 노출로 이어짐 | durable DB에는 object key, 재생은 서버 signed URL만 | `DATA-SCHEMA.md`, `contracts/VgenPanel.md`, `contracts/VgenExport.md` |

## P1 정합성 리뷰

| ID | 결정 |
|---|---|
| P1-09 contracts count | 실제 34개 계약으로 갱신. AgeGate 포함. |
| P1-10 state-machine count | 실제 11개 파일로 갱신, StageMode 추가. |
| P1-11 DATA-SCHEMA count | 실제 18개 테이블로 갱신. |
| P1-12 DUB tables pending | 스키마는 존재하므로 `SCHEMATIZED, CODE NOT IMPLEMENTED`로 정정. |
| P1-13 StageLayout 8 vs 6 | MVP는 6인. 8슬롯은 보류/확장 조건으로 격하. |
| P1-14 VGen LWW vs Yjs | LWW로 확정. Yjs는 실제 충돌 빈도가 높을 때만 재검토. |
| P1-15 VGen status | DB status는 `pending/generating/done/failed/flagged`; 일반 실패·거부 사유는 `failure_reason`, 사후 검토 대기는 `flagged`. |
| P1-16 credits column | DB 컬럼은 `credits.balance`; `credit_balance` 문구 제거. |
| P1-17 TypeScript shapes | `Scene.layers_json`, `VGenJob` SQL 필드 반영. |
| P1-18 recording/dub consent | `specs/SecurityPolicies.md §11`로 닫힘. 구현은 DB/Edge Function 전이에서 consent gate 강제. |
| P1-19 mobile/viewer/demo RLS | `contracts/MobileViewer.md` + `specs/SecurityPolicies.md §7 OBS`로 기본 viewer/OBS 경계 닫힘. 익명 viewer는 MVP read-only로 고정. |
| P1-20 report/age/IP/observability | 신고·연령·관측 스키마는 최신 `DATA-SCHEMA.md`/`SecurityPolicies.md`에 반영됨. 남은 작업은 SLA·테스트·운영 매트릭스 정합성. |

## 자기리뷰 체크

- 복붙 가능한 나쁜 예시를 우선 제거했는가: 예.
- 새 의존성을 추가했는가: 아니오. Yjs 대신 LWW로 확정했다.
- 보안 비밀이 클라이언트 타입/응답에 남았는가: `Room.password_hash` 제거, `room_secrets` 분리.
- DataChannel이 새로 늘어났는가: 아니오. 허용 채널 4개(`room-authority`, `chat`, `script-cue`, `blendshape`)로 고정했다.
- 아직 남은 P1 보안 공백이 문서에 드러나는가: 예. 운영 SLA, safety E2E, export/delete single-use 토큰은 후속 정합성 작업으로 표시했다.

## 다음 구현 전 필수 질문

다음엔 이렇게 말하면 좋아:

> "SEC-P1로 녹화/더빙 동의, 보존기간, 삭제권한, 게스트/뷰어 RLS, 신고/연령/IP/관측 스키마까지 구현 전 차단 게이트로 정리해줘."
