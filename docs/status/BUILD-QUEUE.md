---
tags: [status]
---

# BUILD QUEUE — 기능 우선순위 (UI/UX 무관)

> 순수 기능 ROI 기준. **하나씩**: 하이쿠 딥스캔(라벨 검증) → 진짜 미빌드면 페이블 플랜 → 오푸스 검토 → 구현 → 게이트.
> **철칙: "partial/DONE 라벨"을 믿지 말고 실파일로 검증한다.** DUB-05·VGEN 둘 다 "partial" 라벨이 틀렸고 코어는 완성돼 있었음.
> 스냅샷 2026-07-05. **SSOT 아님(작업 큐)** — 확정 스펙은 `FEATURE-SPEC.md`·`GAP-MATRIX.md`.

## 현재 진행

- **B Host 컨트롤 슬라이스1~3 (Kick·비번룸·Mute) — 구현+검증 완료. 커밋 대기.** 프론트 게이트 5/5 그린(tsc0·lint·test38·build·docs) · 엣지fn 로컬 `functions serve` 실측 **kick 7/7 + 비번·mute 20/20**. 남은 프로덕션-only 확인: 실 LiveKit removeParticipant·updateParticipant 성공경로(로컬은 DB+토큰게이트가 권위라 실측 통과). 다음: A(Avatar 자산배포·데이터 액션)·C(VGEN 공유재생)·D(6인 실증).
  - **slice1 Kick**: is_disabled_by_host+token_version+1 / removeParticipant / Disconnected(PARTICIPANT_REMOVED) 강퇴화면. 재입장403.
  - **slice2 비번룸**: `set-room-password`(PBKDF2 네이티브·room_secrets·is_locked) + `join-room-with-password`(상수시간 대조) + LobbyPage 🔒 + RoomPage 비번입력 단계. 마이그 `20260705120000_create_room_secrets`. join-public-room 은 `_shared/roomJoin.ts`(joinAsParticipant)로 DRY 리팩터(리팩터 후 정상 실측).
  - **slice3 Mute**: `set-participant-mute`(muted_by_host DB권위 + updateParticipant canPublish 토글) + livekit-token 이 `canPublish = role!=viewer && !muted_by_host`(재연결해도 발행차단 실측) + HostConsole 음소거 버튼 + ParticipantPermissionsChanged 감지 → mutedByHost 배지·셀프해제 차단.

## Slice 1 (Kick) — vetted 플랜 (오푸스 검토 반영, 승인 시 착수)

페이블 플랜을 실코드 대조 검증: 스키마·게이트·헬퍼 실재 확인. 아래는 2개 치명 교정 반영본.

**교정(구현 필수):**
- **C1 id공간**: kick 입력 = `target_identity`(=auth uid, 클라가 가진 유일 식별자), **NOT** room_participants.id. 서버가 identity→users.id 매핑해 room_participants 갱신 + `removeParticipant(identity)`. (livekit-token이 `identity:user.id`로 발급)
- **C2 audit_logs 부재**: 테이블 없음 → slice1 감사로그 제거(후속).
- **I1 host 게이트**: HostConsole은 `mySlotIndex===0`(기존 isHost)로 표시. roomStore.hostId 미채움. 서버가 `rooms.host_id`로 진짜 검증.
- **I2**: RoomParticipant 필드 추가 안 함(YAGNI) — identity+name 사용.
- **I3**: 통합/E2E는 기존 `.mjs` 하네스(supabase functions serve, `supabase-slice-verify`). test:e2e/Playwright 없음.
- **재사용**: HostConsole = 새 RightPanel의 host-only 탭.

**edge fn `kick-participant`**: `{room_id, target_identity}` → `getAppUser`→host검증(caller.userId===rooms.host_id)→identity→users.id→`room_participants` UPDATE(is_disabled_by_host=true·token_version+1·token_revoked_at=now)→`RoomServiceClient.removeParticipant(room_id, target_identity)`(실패해도 DB커밋 유지)→200. 비호스트 403·미참가자 404. 재입장 차단=livekit-token `is_disabled_by_host` 게이트(이미 존재)·즉시 절단=removeParticipant.

**파일**: 신규 `functions/kick-participant/index.ts`·`functions/_shared/livekit.ts`(RoomServiceClient 팩토리)·`components/HostConsole.tsx`·`tests/integration/kick-participant.mjs` / 수정 `hooks/useLiveKitRoom.ts`(room-authority reliable 채널 송수신)·RightPanel tabs(host-only 탭)·`i18n/locales/ko.ts`. 리스크: livekit-server-sdk RoomServiceClient Deno 번들(serve 검증) → 실패 시 Twirp REST 폴백.

**슬라이스2(비번)·3(mute)**: room-authority 채널·HostConsole 셸 재활용. 비번=`set-room-password`(bcrypt→room_secrets)+`join-room-with-password`+LobbyPage 🔒. mute=`set-participant-mute`+`mutePublishedTrack`+카운트다운 배지.

## 완료 확인 (스캔 정정 — 코어 이미 완성)

- **DUB-05 합성** ✅ (오푸스 실파일 확인) — ffmpeg.wasm 믹싱·Compositor 전 흐름·edge fn 4·dub_outputs. 원본 재더빙 동작. 잔여=스템캐시·오디오전용·긴클립async·loudness·공유링크·아바타(전부 최적화/P2).
- **VGEN 코어** ✅ (하이쿠 딥스캔) — 백엔드 탄탄: trigger-vgen(검증·게이트·검열·dedup·원자적 크레딧차감·fal async·환불)·vgen-webhook(ED25519·멱등·R2·환불)·pg_cron 타임아웃 스위퍼·크레딧 RPC. **단일 사용자 프롬프트→생성→재생 E2E 작동.** 잔여 기능=VGEN-04 공유재생(main-view, 표면 미존재)·15s 해제·진행률%. 나머지 60%(협업편집·레퍼런스이미지·비율·이의신청·더빙오버레이·프롬프트정제)=slice1b/2 defer.
- **Avatar 선택 (코드)** ✅ (하이쿠 딥스캔) — SettingsPage 선택UI+저장·avatars.ts(manifest+resolveavatar+isValidAvatarUrl)·userStore.setMyAvatar(직접 users.avatar_url update, RLS users_update_own 허용)·렌더측 fetchRoomMembers→RemoteAvatar까지 **E2E 완성**. **블로커=데이터**: Storage에 아리아 1개만 배포됨(코드의 akane는 미배포→404). 남은 일=아바타 자산 배포(`avatar-deploy` 스킬·소스 rig 필요, 상태변경 액션)·라이브 아바타변경 broadcast(P2). **코딩 아님.**

## 큐 — 진짜 미빌드 프론티어 (라벨 미검증, 착수 시 하이쿠 딥스캔)

| # | 만들 것 | 기능 가치 | 상태 | 주요 파일 / 계약 |
|---|---|---|---|---|
| A | **Avatar 선택 실배선** | VTuber 플랫폼인데 전원 기본 아리아 — 고르고 저장·타인 반영 | SettingsPage 아바타 stub·데이터경로 존재 → 작음·코어 | `pages/SettingsPage.tsx`·`lib/avatars.ts`·`userStore`·`contracts/ModelSelector.md` |
| B | **Host 컨트롤 (kick·mute·비번룸)** | 다인 세션 운영·모더레이션 | **edge fn 자체 없음**·계약만 → greenfield | `contracts/HostConsole.md`·`state-machines/HostAuthority.md`·신규 fn·`lib/rooms.ts` |
| C | **VGEN 공유 재생 마감** | 생성 영상 전원 관람(main-view broadcast)+15s+진행률% | 코어 done·공유표면(stageStore·MainView) 미존재 | `features/vgen/*`·신규 stageStore/MainView·room-authority DataChannel·`contracts/VgenPanel.md` |
| D | **6인 무대 실증·확장** | 6인 30분 안정(Phase 3) | 2인만 검증 | `features/stage/*`·`useLiveKitRoom`·`contracts/StageLayout.md` |
| E | **Lobby 기능 (검색·비번입장·Realtime)** | 방 발견·접근 | 목록·생성만 | `pages/LobbyPage.tsx`·`lib/rooms.ts`·`contracts/LobbyPage.md` |

## 진행 로그

- 2026-07-05: 큐 생성 → #1 DUB-05 하이쿠+오푸스 확인 결과 **완성** → VGEN 승격 → VGEN도 하이쿠 딥스캔 결과 **코어 완성**(백엔드 탄탄, 잔여는 공유재생/slice1b/2). 큐를 "진짜 미빌드 프론티어"(Avatar·Host·VGEN공유·6인·Lobby)로 재편. 다음 타깃 결정 대기.
- 2026-07-05: 사용자 부재 → 자율로 Avatar(A) 하이쿠 딥스캔 → **코드 E2E 완성, 블로커는 데이터(아리아 1개만 배포)**. 3/3 스캔이 "코드 완성" → 메타결론: 앱은 라벨보다 훨씬 완성. code-greenfield 후보는 Host(kick/mute/비번 edge fn 부재)뿐 → Host(B) 하이쿠 딥스캔 착수(구현/커밋 승인 대기).
- 2026-07-05: Host greenfield 확인(스키마·게이트 인프라는 존재) → 페이블이 Kick 슬라이스 플랜 → **오푸스 검토로 2개 치명 교정(C1 id공간=target_identity·C2 audit_logs 부재)** + 4개 중요 교정. vetted 플랜 확정, 구현/커밋 승인 대기. 배턴(하이쿠→페이블→오푸스) 완주.
- 2026-07-05: 사용자 "킥 ㄱ" → Kick slice1 **구현**(엣지fn kick-participant·_shared/livekit.ts·HostConsole·useLiveKitRoom onKicked(PARTICIPANT_REMOVED)·RoomPage host탭+강퇴화면·lib/rooms·i18n·통합테스트) + **검증**(프론트 게이트 5/5·로컬 functions serve 7/7). ponytail 단순화: room-authority 채널 대신 LiveKit 네이티브 Disconnected 사유 사용. 커밋 대기.
- 2026-07-05: 페이블 독립 코드리뷰(다른 상위모델 교차검증) → 오푸스가 발견마다 실코드 대조 판정. **실수정 2건**: (1) set-room-password 잠금해제 재정렬(is_locked=false 먼저 — 중간실패 시 영구 입장불가 방 방지), (2) livekit-server-sdk `@2` 버전 핀(공급망 결정성). **오탐 2**: 비번검증은 fail-closed(우회 불가), HostConsole mute Set은 await 성공 후 갱신(롤백 불필요). **defer 1**: current_participants 카운트 race는 기존버그·표시용·정원게이트는 실행수 기준이라 안전(슬라이스 밖). **ceiling 1**: mute 시 LiveKit 실패하면 실session은 재연결 전까지 미음소거(DB권위+토큰게이트가 재연결 시 강제 — kick과 동형). **SDK updateParticipant 시그니처 실물 검증**(2.16.0 옵션객체 오버로드 일치). 재검증 로컬 serve **11/11**.
- 2026-07-05: 사용자 "slice2·mute ㄱ" → 비번룸(slice2)+Mute(slice3) **구현+검증**. 신규 마이그 1(room_secrets)·엣지fn 3(set-room-password·join-room-with-password·set-participant-mute)·공유헬퍼 2(password.ts PBKDF2·roomJoin.ts) / 수정: livekit-token(muted_by_host→canPublish)·join-public-room(DRY)·lib/rooms·roomStore(mutedByHost)·useLiveKitRoom(권한변경 감지)·HostConsole(비번·음소거)·RoomPage(비번단계·배지)·LobbyPage(🔒)·i18n. 설계결정: mute 강제는 mutePublishedTrack(sid 필요) 대신 updateParticipant(canPublish) — 재발행까지 차단·코드 더 적음. 비번은 bcrypt 의존 대신 네이티브 PBKDF2(보안 성역 유지). 프론트 게이트 5/5 + 로컬 functions serve **20/20**(비번 9·mute 7·DRY 1·unlock 3). 통합테스트 아티팩트 2개 정규위치 추가. 커밋 대기.
