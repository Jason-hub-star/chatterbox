---
tags: [audit]
---

<!--
  dogfood-audit(2026-07-06) 마스터 산출물 — 6 페르소나 서브에이전트 도그푸딩 + 메인 검증.
  이 문서 = 발견 SSOT + 최우선 구현 백로그(체크리스트). UX 상세는 design/UX-GAPS-AND-PATTERNS.md.
  스킬: .claude/skills/dogfood-audit. 재현: "플랫폼 감사해줘" / "도그푸딩".
-->

# 도그푸딩 감사 2026-07 — 발견 & 최우선 구현 백로그

> **BLUF:** 아키텍처는 견고(인증·RLS·크레딧 원자성·웹훅 서명·a11y 시맨틱이 실측 반증됨). 진짜 갭은 **레이트리밋 부재 계열 보안 6건**과 **1초-피드백·모바일/뷰어·다국어 UX 공백**. 방법 = 하이쿠 정찰 → Opus 6페르소나 워커 → 메인 직접 검증(인용라인 대조). UX 상세·프리미티브 설계는 [design/UX-GAPS-AND-PATTERNS.md](./design/UX-GAPS-AND-PATTERNS.md).

---

## §0. 최우선 구현 백로그 (하나씩 — 체크로 추적)

> **2트랙 운영(트랙분리):** **A = 로직·보안·seam**(지금, `/goal` 대상) · **B = UIUX 프레젠테이션**(나중, 스펙 대비 1회 패스). `/goal`은 **트랙 A만** 민다. B는 A가 심어둔 seam 위에 스타일만 얹는다 → "나중 연결"이 "나중 재작성"이 되지 않게.

### 트랙 A — 로직·보안·seam (지금 · `/goal` 대상)

**A-P0 (보안 실침해)** — 재감사 2026-07-07 신규 2건(SEC-7·SEC-8): **수정+프로드 배포 완료 · 라이브 구멍 차단 실측.**
- [x] **SEC-7** (High·재감사 신규) **크레딧 RPC 클라 직접호출 노출** — `deduct_credit`·`refund_credit`이 `revoke ... from public`만 해서 **anon/authenticated 는 여전히 EXECUTE 가능**(Supabase `alter default privileges ... grant execute on functions to anon, authenticated` 가 명시적 부여 → public revoke로 안 빠짐). 익스플로잇: 앱 anon 키로 `rpc/refund_credit(<본인 완료잡>)` → 소비한 유료 생성 무한 무료화 / `rpc/deduct_credit(<피해자>, 9999, ...)` → 타인 크레딧 고갈. **정수정:** 새 마이그 `20260707120000_lock_rpc_execute.sql` — `revoke ... from public, anon, authenticated`(= `join_room_as_participant` 패턴). service_role(Edge)은 default-priv 유지. **실측:** 격리 pg17.6.1.127(BEFORE auth=t → AFTER anon/auth=f·svc=t) + **프로드 배포 전 `deduct_credit`·`refund_credit` anon=t·auth=t(라이브 노출 확정) → 배포 후 anon=f·auth=f·svc=t(차단 확정)**. ✅ **프로드 배포 완료**(`supabase db push`, 2026-07-07). 마이그 파일 미커밋(커밋 승인 대기).
- [x] **SEC-8** (Med·재감사 신규) **레이트리밋 RPC 노출** — `check_rate_limit`(마이그 `20260706130000`)에 **revoke 전무** → anon/authenticated EXECUTE 가능. 익스플로잇: `rpc/check_rate_limit('vgen:<피해자>', …)` 반복호출로 피해자 버킷 선증가 → 정상요청 429(vgen/refine/transcribe/translate/separate DoS + SEC-1 비번조인 버킷 잠금 → SEC-1/4/6 무력화). **정수정:** SEC-7과 같은 마이그에 `revoke ... from public, anon, authenticated` 포함. **실측:** rate_limit 마이그는 배포 전 프로드에 미존재(SEC-8 미노출 상태였음) → 이번 push로 `check_rate_limit` 생성과 **동시에 잠금**(프로드 배포 후 anon=f·auth=f·svc=t). ✅ **프로드 배포 완료**(동일 push).
- [x] **SEC-1** 잠금방 비번 **브루트포스 레이트리밋** — `rate_limit_counters` + `check_rate_limit` RPC(마이그 `20260706130000`) + `join-room-with-password` 적용(5회/5분→429, **정답 시 카운터 리셋** = 실패만 누적·정상유저 오탐 제거). **로직 실측**(supabase pg17.6: t×5→f→윈도리셋→키격리→RLS + 리셋-온-성공: 3실패→delete→fresh count1). ⏳ 배포·통합 실측 대기. SEC-4가 이 프리미티브 재사용.
- [x] **SEC-2** 스토리지 **경로 조작 차단** — 공용 `isSafeObjectKey`(supa.ts, `<room>/<subdir>/<안전파일명>` 정확매칭) + `submit-dub-track`·`submit-dub-output`·`create-dub-session`(sources/vgen) 적용. **실측**(deno check clean · 헬퍼 11/11: 정상키 통과·`../`·여분슬래시·타방·선행점·비문자열 전부 차단). ⏳ 배포 대기(앱 레이어에서 이미 거부 → R2 정규화 동작과 무관하게 견고, R2 실테스트는 배포 후 확인).
- [x] **SEC-3** SSRF 차단 — `isOwnR2RefUrl`(r2.ts): image_urls를 우리 R2 `vgen-refs/<room>/` presigned URL로만 제한(오리진+경로 allowlist·`..`거부). **실측**(deno check clean · 11/11: 정상 통과·메타데이터/사설IP/외부/서브도메인트릭/타방/타버킷/traversal/http 전부 차단). 참조자산 테이블 없어 asset_id 대신 오리진 allowlist 채택(프론트 무변경). ⏳ 배포 대기.

**A-P1 (비용·정합 + UX seam)**
- [x] **SEC-4** 무제한 비용 API 캡 — `check_rate_limit`(SEC-1 프리미티브 재사용)를 refine(50)·translate(30)·transcribe(30)·separate(20)/일 캡으로 4함수 적용(호스트 체크 직후·외부호출 직전, 무과금 ko-skip 이후 계수). **실측**(deno check clean ×4; RPC 로직은 SEC-1서 실측). ⏳ 배포 대기.
- [x] **SEC-5** 대본 큐 **서버 릴레이** — 새 Edge `advance-script-cue`(host 검증→broadcast) + receiver 스푸핑방어(participant 있으면 드롭) + sendCue 릴레이 전환 + handleCue self-echo 게이트(호스트 무시). **실측**(type-check·lint·**test 50/50**·deno check clean). ⏳ 배포 대기(함수 deploy **+ 프론트 CF Pages 재배포** 둘 다 있어야 라이브 — 리액션과 동일). 라이브 LiveKit E2E는 배포 후.
- [x] **A-SEAM-1** 피드백 채널 — `toastStore`(큐 채널 + 4s 자동소멸을 store가 소유 → B는 렌더만) + emit API(`toast`/`useToast()`, 컨벤션 §5 정렬). 침묵 실패였던 cue relay `.catch(() => {})`(useLiveKitRoom:313) 하나를 `toast.error(t('room.cueSyncFailed'))`로 배선(SEC-5 서버릴레이 실패 시 호스트가 인지). **실측**(type-check·lint clean·**test 53/53** [+3 toastStore: push·자동소멸·dismiss]·build PASS). 표현(`<ToastHost/>`)은 B. *(P-1 로직 — 초안의 no-op/console 대신 실 큐 채널로 격상 = B가 순수 프레젠테이션)*
- [x] **A-SEAM-2** 진행/ETA 데이터 노출 — VGEN: 순수 `estimateVgenSeconds()`(lib/vgenEta) + `vgenStore.currentJobEtaSec` 노출(생성 시작 시 세팅·종료/리셋 시 null, 경과는 `currentJob.createdAt`로 B가 계산). DUB: phase+progress는 이미 `DubCompositor` 로컬상태로 렌더 위치에 존재 → dubStore 신설은 YAGNI(SCOUT 기록), B가 그 자리에서 바만 얹음. `vgen_jobs.estimated_duration_sec` DB 컬럼은 배포 게이트라 클라 추정으로 대체(ponytail ceiling: fal 큐 ETA가 업그레이드). **실측**(type-check·lint clean·**test 56/56** [+3 vgenEta: 단조·클램프·정수]). 바는 B. *(P-2 로직)*
- [x] **A-SEAM-3** Realtime 구독 훅 — 제네릭 `useRealtimeRow(table, col, value, onChange)`(hooks/, latest-ref 패턴으로 대상 변경 시만 재구독) 신설, DubPanel에 2구독(`dub_sessions` room_id·`dub_tracks` dub_session_id) → 변경 시 신뢰소스 재조회, **수동 새로고침 버튼 제거**. 컬럼명·publication을 마이그(`20260702060001`)로 실대조(둘 다 supabase_realtime 등록). **실측**(type-check·lint clean·**test 56/56**·build PASS). vgen currentJob은 이미 store realtime. ⏳ 라이브 realtime 검증은 CF Pages 재배포 후. *(P-3)*
- [x] **A-FUNC-1** 룸 조인 타임아웃/취소 — 중복 `callFn` 3개(rooms·dub·vgen)를 공유 `lib/edgeFn.ts`로 통합 + **15s 타임아웃**(`EdgeTimeoutError`) + 외부 취소 `signal`(취소 버튼은 B). joinRoom→callFn 이라 RoomPage 조인 무한대기가 15s에 에러로 종료(기존 에러표시에 흡수). **실측**(type-check·lint clean·**test 58/58** [+2 edgeFn: 미응답→15s 타임아웃·외부취소→AbortError]·build PASS). 근본수정=공유함수 한 곳(전역 규칙).
- [x] **A-FUNC-2** 인증 복구 — userStore 3액션(`requestPasswordReset`·`resendVerification`·`updatePassword`, enumeration 방지 boolean) + LoginPage 비번찾기(메일 발송·동일 안내) + RegisterPage PENDING 재전송+60s 쿨다운 + `/reset` 착지 페이지(복구세션 updateUser)+라우트. 비번 강도 규칙은 `lib/authValidation.passwordIssue`로 추출(가입·재설정 공유·근본수정). **실측**(type-check·lint clean·**test 62/62** [+4 authValidation]·build PASS). ⏳ 실 이메일 발송·복구 완료 흐름은 배포+실메일 게이트(supabase.auth 호출은 API 정합·컴파일 확인).

**A-P2 (정합·권한 seam)**
- [x] **SEC-6** 일일한도 TOCTOU 원자화 — trigger-vgen count→insert 비원자 갭을 `check_rate_limit`(SEC-1/4 프리미티브 재사용) 원자증가로 대체. 캐시히트(무과금) 이후 배치 → 실제 생성만 계수·리셋없음(일일 누적 캡). **실측**(deno check clean; RPC는 SEC-1서 격리 postgres 실측·동일 프리미티브). ⏳ 배포 대기(SEC-1 마이그 `20260706130000` 의존).
- [x] **A-SEAM-4** 뷰어/모바일 **권한 로직**(seam) — 서버는 이미 강제 중(livekit-token `canPublish: role!=='viewer'`). 클라 seam: roomStore `myRole`(계약 ViewerGate.md §Store 의존성 `roomStore.role`, 3 조인/이탈 경로서 세팅) + 순수 `lib/roomPermissions.roomPermissions(role)`(서버규칙 미러) — B의 뷰어모드/MobileViewer가 읽음. **실측**(type-check·lint clean·**test 64/64** [+2 roomPermissions]). **범위 명시:** 전체 ViewerGate 라우트가드·뷰어조인·MobileViewer 레이아웃·invite 검증(`verify-invite-code`/`accept-invite` Edge **미구현**)·anon auth 는 P2 기능(seam 아님)으로 **잔여** — 현 join 은 actor 고정이라 뷰어 라이브 진입은 그 기능 뒤. 레이아웃은 B.
- [x] **A-SEAM-5** i18n **키 구조** — `i18n/coverage.ts`(`missingKeys`=B 번역 대기 worklist·`orphanKeys`=ko 없는 오타 키) + 가드 테스트(en/ja ⊆ ko 실증·오펀 0). en/ja 200키 복제 대신 커버리지 도구+구조 가드로 정비(fallback:ko 는 이미 동작). **실측**(type-check·lint clean·**test 67/67** [+3 i18nCoverage: en/ja 오펀 0·worklist 산출]). 번역 콘텐츠 채우기는 B.
- [x] **A-FUNC-3** 호스트 이양 배선 · mute 마운트 로드 — **이양(무배포):** hostId 를 멤버 이펙트서 `fetchRoomHostId`로 로드(참가자 변동=호스트 퇴장 시 재실행 → 새 호스트 반영), `isHost = host_id===내 users.id`(hostId 미로드 시 slot 프록시 폴백 → 2인 경로 무변화). **mute(배포 게이트):** list-room-members 가 `muted_by_host` 반환(옵셔널 `?? false` → stale 배포본 안전) + 멤버 이펙트서 내 mutedByHost 서버 재동기 + HostConsole 배지를 서버 진실서 파생(렌더 파생=prop동기 effect 없음, 새로고침 desync 제거). **실측**(type-check·lint clean·**test 67/67**·build PASS·deno check list-room-members clean). ⏳ mute 배지는 list-room-members 재배포 후 라이브(현 stale 배포본은 빈 배지=기존 동작).

### 트랙 B — UIUX 프레젠테이션 (나중 · 1회 패스 · 스펙: `design/UX-GAPS-AND-PATTERNS.md` + `uiux-distilled.md`)
- [x] **Toast/피드백 UI** (A-SEAM-1 채널에 스타일) — `ToastHost`(App 전역 마운트, 하단 중앙·의미색 고정·role=alert/status·4s 소멸·성공 체크 드로우·360px 안전) + emit 1 추가(리액션 릴레이 실패, cue 패턴 동형). **실측:** 게이트 4종 + 헤드리스 실렌더 5/5(3종 렌더·roles·4.2s 소멸·360px). 잔여 emit 사이트(채팅 전송표시·아바타 저장·방 생성 성공)는 §2 별도 행. *(2026-07-08)*
- [x] **Progress/ETA 바** (A-SEAM-2 데이터에 바) — 공유 `ProgressBar`(확정=씬액센트 채움+불씨 선단 / null=불확정 흐름, `--scene-accent` 연동 §4.3) + VGEN `VgenProgress`(1s 틱·95% 캡·남은초, `etaProgress` 순수함수+테스트 3) + DUB 합성 단계 바(믹싱만 실측 %). **실측:** 실렌더 4/4(바·aria-valuenow·채움폭·"남은 시간 약 85초"). 덤: 조인 취소 버튼(§2 룸진입 잔여)도 동시 완료 — joinRoom signal 관통+AbortError 조용 처리+모닥불 글리프, 실렌더 4/4(route 홀드→취소→로비·에러 미출현). *(2026-07-08)*
- [x] **반응형 레이아웃 + 터치 롱프레스 리액션 + 무대 동적 크기**(P-5) — 무대 `useSlotPx`(<480px→88px, 3열이 360px 안착) + 터치 롱프레스 ≥500ms→휠 sticky 개화(탭 선택) + 숫자키 1~N 즉발(입력필드 가드) + 룸 `p-4 sm:p-8`·로비 검색 `w-28 sm:w-40`. **실측:** 게이트 4종 + 헤드리스 9/9(데스크톱 120 유지·모바일 88·scrollWidth 360·롱프레스→sticky→탭 발사·핫키·입력중 미발사) + 360px 스크린샷. 잔여: 화면 전수 반응형 감사는 모바일 뷰어 작업과 함께. *(2026-07-08)*
- [x] **모바일 뷰어 레이아웃** (A-SEAM-4 위에) — 로비 수직기능 페이즈루프 Phase 4 로 기능 문과 함께 닫힘: `join-as-viewer`+`join_room_as_viewer` RPC(좌석·정원 비점유)·초대 role='viewer'·RoomPage 관전 모드(SelfAvatar 미마운트=웹캠 요청 0·"관전 중" 뱃지·마이크 버튼 없음)·로비 마감방 [관전] 폴백. **실측:** 프로드 15/15 — 2브라우저(배우 공연+뷰어 360px 관전: 호스트 아바타 원격 렌더·발행권 없음 토큰 실측·scrollWidth 360). 잔여: anon 뷰어(대시보드 anonymous sign-in 게이트)·MobileViewer 전용 뷰(UA 자동 다운그레이드). *(2026-07-08, GAP-MATRIX Phase 4 행)*
- [x] **다국어 번역 채우기** (A-SEAM-5 위에) — en/ja **232키 전량 완역**(기존 33키 유지·문체 통일, `{{보간}}`·이모지 보존). i18n.test 폴백 픽스처를 합성 프로브 키로 정수정(완역으로 실키 픽스처 소멸). **실측:** coverage missing 0·orphan 0(양언어) + test 70/70 + 실렌더 EN/JA 로그인 페이지 문자열 확인. *(2026-07-08)*
- [x] **모달 일원화**(P-4) — `components/shared/Modal.tsx`(role=dialog·aria-modal·포커스 트랩·Esc·복귀 포커스·백드롭) + 소비 2곳: 강퇴 확인(HostConsole 2단 토글 폐지 — 계약 §"최종 확인 모달" 충족) · CostConfirmDialog 전환(트랩 획득, props 불변). **실측:** 게이트 4종 + 2탭 E2E 7/7(dialog 개화·초점 진입·Tab 트랩·Esc 닫기·강퇴버튼 복귀 포커스·실강퇴 왕복·확정 후 닫힘). 비번 입장 "오버레이"는 오진 — 전체 페이지 렌더라 트랩 불요(autoFocus 존재). 잔여: 강퇴 사유 필드(서버 kick-participant 가 reason 미수용 — 서버 슬라이스와 함께). *(2026-07-08)*
- [ ] **다크 elevation 그림자** · **라이트모드** (P2 폴리시 잔여)
- ~~대비 교정(UX-P6)~~ — 거짓양성으로 취소(WCAG 7.2:1).

---

## §1. 보안 — 확정 (심각도순, 메인이 인용라인 직접 대조)

| ID | 취약점 | 심각도 | Confidence | file:line | 익스플로잇 | 정수정 |
|---|---|---|---|---|---|---|
| SEC-1 | 잠금방 비번 무제한 시도 | High | Confirmed | `join-room-with-password`(레이트리밋 전무·앱 전체 레이트리밋은 trigger-vgen 하나) | 4자리 비번=1만회 무차단 → 사설방 침입 | (user,room) 시도 제한 429 + 최소길이 상향 |
| SEC-2 | 스토리지 경로 traversal ×3 | High(R2 정규화 시)/Med | Likely | `submit-dub-track:39`·`submit-dub-output:48`·`create-dub-session:26` | 클라 경로 `startsWith`만 → `../`로 타방 파일키 저장 → 룸원 presign 접근 | 키 서버생성(클라 경로 미신뢰) + `..` 거부. R2 실테스트로 확정 |
| SEC-3 | SSRF (image_urls) | Med | Confirmed | `trigger-vgen:78-79`(`startsWith("http")`만) | 사설IP/메타데이터 URL 주입 → fal 페처 fetch (호스트전용·플래그 off 완화) | raw URL 폐기 → asset_id 서버서명 |
| SEC-4 | 무제한 비용 API | Med | Confirmed | refine-vgen·translate-dub·start-dub-transcription·separate-dub-audio(레이트리밋 0) | 호스트 루프 → OpenAI/Whisper/FAL 청구 부담 | 사용자별 일일 캡 |
| SEC-5 | 대본 큐 스푸핑(desync) | Med | Confirmed | `useLiveKitRoom.ts:156-160`(sender 미검증)·`RoomPage.tsx:209-211`(주석 인지) | 참가자가 `script-cue` 직접 publish → 전원 텔레프롬프터 desync(초대방 griefing) | send-reaction과 동일 서버 릴레이 |
| SEC-6 | 일일한도 TOCTOU | Low | Confirmed | `trigger-vgen:103→133`(count→insert 비원자) | 동시 요청 소프트쿼터 우회(크레딧은 자기돈 원자차감) | count+insert RPC 원자화 |
| SEC-7 | 크레딧 RPC 클라 노출 | **High** | **Confirmed(실측)** | `20260704120002_create_credit_rpcs.sql:86-87`(`revoke from public`만) | anon 키로 `rpc/refund_credit(본인잡)`→무한 무료 생성 / `rpc/deduct_credit(피해자)`→크레딧 고갈 | `revoke from public, anon, authenticated`(재감사 2026-07-07) |
| SEC-8 | 레이트리밋 RPC 노출 | **Med** | **Confirmed(실측)** | `20260706130000_rate_limit.sql`(revoke 전무) | `rpc/check_rate_limit('vgen:<피해자>')` 반복→피해자 429 DoS·SEC-1/4/6 무력화 | 동상 완전 revoke(재감사 2026-07-07) |

## §2. 보안 — 반증 (안전 확인·거짓양성 억제)

- **vgen-webhook**: ED25519 서명 + ±5분 타임스탬프 → 위조·재생 불가 (정찰 1순위 의심이 실제론 견고)
- **deduct/refund**: `FOR UPDATE` 원자 + `credit_deducted_at`∧`credit_refunded_at` 멱등 → 이중지불/환불 불가
- **호스트 인가**(kick/mute/set-password: server-derived userId) · **멤버십 게이트**(reaction/list-members/consent) · **`.single()`**(!appUser로 null 캐치)
- **RLS**(dub_*/credits/room_secrets deny-all + `is_room_member` + `current_user_id`) · **presign IDOR**(멤버 확인 후 SigV4) · **room_secrets 비번해시 미노출**
- **재감사 2026-07-07 반증**: `list-room-members`의 `muted_by_host` 전멤버 노출은 **의도됨**(A-FUNC-3: 음소거된 본인이 상태 인지·배지 렌더에 필요, 민감도 낮음) · `seed_user_credits`는 **트리거 함수**(PostgREST RPC 미노출·`on conflict do nothing` 멱등)라 무해 · `reconcile_stuck_vgen_jobs`는 노출되나 내부 가드(`refund_credit` 멱등·`skip locked`·차감 후에만 환불)로 실익 0 · `vgen-webhook` 차감선행이라 webhook-race 무료생성 불가 · `join_room_as_participant`는 `public,anon,authenticated` **완전 revoke**(SEC-7/8 정수정의 기준 패턴)

## §3. UX 마찰 (상세: design/UX-GAPS-AND-PATTERNS.md)

- **Blocker**: 뷰어/모바일 경로 구현 0(계약서만) · 리액션 우클릭 전용→터치 불가 · 룸 조인 타임아웃/취소 없음 · 비번찾기/인증재전송 없음
- **High**: 무대 비반응형(고정120px·`sm:`0회) · DUB 수동 새로고침 · VGEN 진행도/ETA 없음  *(※ text-muted 대비는 WCAG 실측 7.2:1로 AA 통과 — 정찰 오탐 정정)*
- **Med**: 강퇴 2단토글(모달아님·사유없음) · 연결품질 이모지만 · mute desync · 호스트 이양 미배선 · 다국어 15%

## §4. 있으면 좋을 기능 · 잘되는 점

- **기능**: 게스트/미리보기 모드 · 비번리셋·인증재전송 · 세션 녹화 · 밴(≠강퇴) · 대기실 · 룸설정 편집 · 키보드 리액션 핫키 · 색맹안전 상태 라벨
- **잘됨(회귀금지)**: a11y 시맨틱 · auth 세션 복원+원목적지 복귀 · VGEN 코스트 프리뷰 · 2계층 mute · 비번락 정합 · DubCompositor 진행도 · 서버 릴레이 리액션(스푸핑 차단)

---

## 진행 로그

- **2026-07-06** dogfood-audit 최초 실행(6 페르소나). 발견 12 actionable + 반증 7. 백로그 §0 등록.
- **2026-07-06** SEC-1 구현: rate-limit 프리미티브(마이그+RPC) + 잠금방 적용. 격리 postgres 17.6 실측 PASS(5허용→6차단→400s후 리셋→키격리→RLS). 배포 미실행(승인 대기).
- **2026-07-06** SEC-2 구현: 공용 `isSafeObjectKey` + 3함수 적용. deno check clean + 헬퍼 로직 11/11 PASS(정상 통과·traversal 전부 차단). 배포 대기.
- **2026-07-06** UX-P6 **거짓양성 정정**: WCAG 실측으로 muted 대비 7.21:1(AA 통과) — 정찰의 3.2:1 오산. 토큰 무변경, 그림자 폴리시는 P2로.
- **2026-07-06** **트랙분리**: §0을 트랙 A(로직·보안·seam=지금·`/goal` 대상)/트랙 B(UIUX 표현=나중 1회 패스)로 재편. UX 항목은 seam(A)/표현(B)으로 분해. `/goal` 명령어가 기본 트랙 A만 밀도록 갱신.
- **2026-07-06** `/goal A` 실행: **SEC-3**(SSRF, `isOwnR2RefUrl` R2 오리진 allowlist, 11/11) + **SEC-4**(비용 API 캡, check_rate_limit 4함수 재사용, deno clean ×4) 구현·검증. 배포 대기.
- **2026-07-06** **자기리뷰**: SEC-2 업로드 키 프리픽스 3종(sources/recordings/outputs) 실코드 대조 — 정상 흐름 무손상 확인. SEC-1 오탐(성공시도 계수) 발견 → **정답 시 카운터 리셋** 추가·DB 실측. join-room deno check는 기존 password.ts 타입에러로 막힘(내 코드 무관, DB로 대체 검증).
- **2026-07-06** **SEC-5**(대본 큐 서버 릴레이): 새 Edge `advance-script-cue` + 클라 4배선(rooms 래퍼·receiver 스푸핑방어·sendCue 릴레이·handleCue self-echo 게이트). type-check·lint·test 50/50·deno clean. 배포 대기. **보안 SEC-1~5 전부 구현·검증 완료**(SEC-6 TOCTOU만 A-P2 잔여). 다음=A-SEAM-1(UX 로직 seam).
- **2026-07-06** **A-SEAM-1**(피드백 채널 seam): `stores/toastStore.ts`(큐+4s 자동소멸 store 소유) + `hooks/useToast.ts`(`toast`/`useToast()` emit API) + `tests/unit/toastStore.test.ts`(3) 신설, cue relay 침묵 swallow → `toast.error(i18n.t('room.cueSyncFailed'))` 배선(ko 키 1). type-check·lint clean·**test 53/53**·build PASS. 초안의 no-op/console 대신 실 큐 채널로 격상 → 트랙 B는 `<ToastHost/>` 렌더만(타이밍 로직 불필요). 배포 불필요(프론트, CF Pages 재배포로 라이브). 다음=A-SEAM-2(진행/ETA 데이터 노출).
- **2026-07-06** **CLAUDE.md 교정**: "Phase 0 코드 없음"(stale) → "구현 진행 중·Phase 0~3 대부분 충족·보안+seam 단계"로, 먼저읽을것에 DOGFOOD-AUDIT §0 최우선 백로그 추가, features 목록·MILESTONES 포인터 갱신.
- **2026-07-06** `/goal A` 연속 실행(트랙 A P1): **A-SEAM-2**(VGEN `estimateVgenSeconds`+`currentJobEtaSec` 노출·DUB는 기존 로컬상태, test 56/56) → **A-SEAM-3**(`useRealtimeRow` 훅·DUB 2구독·수동버튼 제거·컬럼 실대조, test 56/56) → **A-FUNC-1**(callFn 3중복→공유 edgeFn+15s 타임아웃/취소, test 58/58) → **A-FUNC-2**(인증 복구 3액션·LoginPage/RegisterPage 배선·/reset 페이지·비번규칙 공유추출, test 62/62). 각 type-check·lint·build PASS. **트랙 A P1 완료.** 프론트라 배포 불필요(CF Pages 재배포로 라이브·A-SEAM-3 realtime/A-FUNC-2 이메일은 배포후 실측). 다음=A-P2(SEC-6·A-SEAM-4·5·A-FUNC-3).
- **2026-07-07** **`/goal SEC-7 배포까지 프로드노출확인` — SEC-7·SEC-8 수정+프로드 배포+실측 완료.** 새 마이그 `20260707120000_lock_rpc_execute.sql`(check_rate_limit·deduct_credit·refund_credit·reconcile_stuck_vgen_jobs 를 `public,anon,authenticated` 완전 revoke; RLS 헬퍼 current_user_id/is_room_member/is_dub_member 는 의도적 유지). **격리 pg17.6.1.127 실측**(BEFORE 4함수 auth=t → AFTER anon/auth=f·**svc=t** = Edge 무손상). **프로드 실측**(psql pooler): 배포 **전** `deduct_credit`·`refund_credit` anon=t·auth=t = **라이브 노출 확정**(크레딧 마이그는 이미 배포돼 있었음)·`check_rate_limit` 프로드 미존재 → `supabase db push`(마이그 2개: rate_limit + lock) → 배포 **후** 5함수 전부 anon=f·auth=f·svc=t. **SEC-7 라이브 구멍 차단 완료.** 마이그 파일 미커밋(git 커밋 승인 대기 — 배포본-소스 드리프트 방지 위해 커밋 권장).
- **2026-07-07** **재감사(`/dogfood-audit`)**: 정찰 3종(하이쿠 인벤토리+소넷 보안표면+소넷 UX여정) → 메인 직접 검증(성역). **신규 확정 2건**(격리 pg17.6.1.127 `has_function_privilege` 실측): **SEC-7**(High, `deduct_credit`·`refund_credit` `revoke from public`만 → Supabase default-priv가 anon/authenticated에 EXECUTE 명시부여라 revoke 무효, `auth ... =t` 실측 → 무한 무료생성/크레딧고갈) · **SEC-8**(Med, `check_rate_limit` revoke 전무 → anon/auth EXECUTE=t → 피해자 429 DoS·SEC-1/4/6 무력화). 정수정=`join_room_as_participant` 패턴(`revoke from public, anon, authenticated`) 신규 마이그 1개. **반증**: muted_by_host 노출(의도)·seed_user_credits(트리거·멱등)·reconcile(가드로 실익0)·webhook-race(차감선행)·advance-script-cue 퇴장후 브로드캐스트(Low, 호스트 자기방). UX 발견은 전부 트랙 B 기존 항목(스피너·ToastHost 미마운트·에러 auto-dismiss·진행바·i18n·모바일리액션)에 흡수. **⚠️ 크레딧 마이그는 이미 프로덕션 배포 가능성 → SEC-7 라이브 노출 여부 prod 확인 필요.**
- **2026-07-07** `/goal A` 트랙 A **P2 완주**: **SEC-6**(trigger-vgen 일일한도 count→insert 비원자를 check_rate_limit 원자화, deno clean) → **A-SEAM-4**(뷰어 권한 seam=roomStore `myRole`+순수 `roomPermissions`; 서버는 이미 canPublish 강제·전체 ViewerGate/MobileViewer/invite Edge/anon 은 P2 기능 defer, test 64/64) → **A-SEAM-5**(i18n `coverage.ts` missing/orphan + 가드 테스트=en/ja⊆ko 확인·B worklist, test 67/67) → **A-FUNC-3**(호스트 이양 host_id 기반+폴백[무배포]·mute 마운트 로드[list-room-members muted_by_host, 배포 게이트], test 67/67·deno clean). **트랙 A 전 항목(P0~P2) 완료.** 배포 대기 추가분: trigger-vgen(SEC-6)·list-room-members(mute). 남은 것 = 트랙 B(UIUX 프레젠테이션 1회 패스)뿐.
- **2026-07-08** **트랙 B P0 3종 완료(주인님 목업 검수 승인 후 구현)**: 실토큰 인터랙티브 목업(Artifact)으로 사전 검수 → 채택안 = 0-의존성 CSS/SVG 마이크로 모션(Lottie 플레이어·스프라이트 도입 없음, 글리프는 컴포넌트 경계로 격리해 spritegen 교체 대비). **①ToastHost**(전역 마운트·의미색 고정·체크 드로우·에러 쉐이크) **②ProgressBar+VGEN ETA+DUB 단계 바**(`--scene-accent` 연동·95% 캡·불씨 선단) **③조인 취소**(joinRoom signal 관통·모닥불 글리프·"모닥불에 다가가는 중…" 카피). **실측:** tsc0·lint clean·test 70/70(+3 etaProgress)·build + **헤드리스 실렌더 13/13**(토스트 3종/roles/4.2s 소멸/360px · route 홀드→취소→로비 · VGEN 바/aria/ETA 문구) + 스크린샷 육안. 함정 기록: dev HMR 후 evaluate 모듈 주입은 `?t=` 이중 인스턴스 → **서버 재시작 후 검증**. 배포 불필요(프론트 — CF Pages 재배포로 라이브). 다음 = 트랙 B 잔여(반응형·모바일 뷰어·다국어·모달/그림자).
- **2026-07-08** **트랙 B 연속 2건 — 다국어 완역 + 반응형 P-5.** ① en/ja 232키 전량 번역(coverage 0/0·test 70/70·실렌더 EN/JA 확인; i18n 폴백 테스트는 합성 프로브 키로 정수정). ② P-5: 무대 동적 슬롯(88/120, `useSlotPx` — 아바타 캔버스는 size 가 이펙트 deps 라 재생성 안전) + 터치 롱프레스→휠 sticky 개화(합성 mousedown 억제 함정 처리) + 숫자키 핫키 + 검색폭/패딩 반응형. 헤드리스 실측 9/9 + 360px 스크린샷. **모바일 뷰어는 표현이 아니라 기능 게이트**(뷰어 입장 경로 미구현)로 판정 — 뷰어 조인 슬라이스와 함께. 커밋: 트랙 A seam(1e9bdc7)·아트 피벗(2bd2a3f)·트랙 B P0(054d44b) + 이번 2건 별도 커밋. 참고: 토스트 개통으로 **advance-script-cue 미배포가 가시화**(호스트 입장 시 cue 전송 실패 토스트) — Edge 배포 대기 목록의 실사용 동기.
