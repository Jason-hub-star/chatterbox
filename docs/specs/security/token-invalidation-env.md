---
tags: [spec]
---

<!-- 이 파일은 SecurityPolicies.md에서 분할됨 (2026-07-08, 1500줄 회전 임계). 부모 허브: ../SecurityPolicies.md -->

# ChatterBox 보안 정책 — 토큰 무효화·Replay 방어·환경변수·Phase1 게이트 (§8–§10)

> 부모 인덱스: [`SecurityPolicies.md`](../SecurityPolicies.md) · 원본 섹션 번호 유지.

---

## 8. LiveKit 토큰 무효화 + Replay 방어 (G-37·G-44)

> **목적**: 강퇴/자발적 퇴장/방 종료 이후에도 TTL(1h) 창 내에서 기발급 LiveKit JWT로 재입장할 수 있는 취약점(C1)과 토큰·메시지 재생 공격(C7)을 막는다.
> **산출**: 본 섹션 + `specs/livekit-edge-fn.md` §4.1·§6 + `DATA-SCHEMA.md §1.3` 주석
> **상태**: P0 (구현 착수 전 완료)

### 8.1 위협 모델

| 위협 | 설명 | 영향 |
|---|---|---|
| T1 기발급 토큰 재입장 | 호스트 강퇴 후에도 기발급 JWT로 LiveKit 재연결 시도 | 부정 접근, 방 교란 |
| T2 자발적 퇴장 후 재입장 | `state='left'` 이후에도 기발급 토큰 유효 | 우회 재입장 |
| T3 토큰 탈취 재사용 | 공격자가 타인의 토큰을 캡처해 다른 기기에서 사용 | 신원 도용 |
| T4 DataChannel 메시지 재생 | `host_transfer`/`cue_advance` 메시지를 캡처·재전송 | 권한 탈취, 큐 조작 |
| T5 Refresh 토큰 재생 | Supabase Auth refresh 토큰 재사용 | 세션 하이재킹 |

### 8.2 설계 결정: token_version 기반 3단계 방어

`room_participants.token_version` 컬럼은 MVP부터 둔다. `is_disabled_by_host` + `state` + `left_at`만으로는 기발급 JWT 재접속 후 webhook 제거 전 1~3초 창이 남아 공연 방해가 가능하다. 토큰 발급 시 LiveKit AccessToken `metadata.token_version`에 현재 값을 싣고, 강퇴/퇴장/안전 조치마다 DB 값을 증가시킨다.

```
[강퇴/퇴장 트리거]
   ↓
(1) DB 신호: token_version += 1, token_revoked_at=now(), is_disabled_by_host=true 또는 state='left' / left_at=now()
   ↓
(2) LiveKit RoomService.removeParticipant(roomId, identity) — 즉시 연결 끊기
   ↓
[재입장 시도 — 기발급 토큰(v1)로 LiveKit 재연결]
   ↓
(3a) Edge Function 발급 게이트 (사전 차단)
     - 새 토큰 요청 시 token_version 최신값을 metadata에 싣고, is_disabled_by_host=true 또는 state='left' → 403
     - 자발적 퇴장 후 새 토큰 발급 시도는 이미 차단됨; 남은 빈틈은 "기발급 토큰으로 LiveKit 직접 재연결" → (3b) webhook이 커버
   ↓
(3b) LiveKit webhook participant_joined (사후 제거, 1~3초 내)
     - Edge Function이 webhook 수신 시 room_participants 재조회
     - metadata.token_version 불일치, is_disabled_by_host=true, 또는 state='left' → removeParticipant 즉시 호출
     - 이미 연결된 기기에도 동일 적용 (멀티탭/다른 기기 커버)
   ↓
(3c) 클라이언트 self-check (fallback, 10초 주기)
     - 클라이언트가 자기 room_participants 행을 Supabase Realtime 구독
     - is_disabled_by_host=true 또는 state='left' 감지 시 자발적 연결 해제
     - Realtime 장애 시 10초 폴링 fallback
   ↓
[TTL 10m 경과] → 자연 만료 (최종 안전망)
```

### 8.3 철회 트리거 매트릭스

| 트리거 | DB 업데이트 | LiveKit 조치 | 즉시성 |
|---|---|---|---|
| 호스트 강퇴 (HOST-01) | `token_version += 1`, `token_revoked_at=now()`, `is_disabled_by_host=true` | `removeParticipant` 즉시 | ~1초 |
| 참가자 자발적 퇴장 | `token_version += 1`, `token_revoked_at=now()`, `state='left'`, `left_at=now()` | `removeParticipant` 즉시 | ~1초 |
| 호스트 이탈 (HOST-06) | `rooms.host_id` 이전 + `authority_epoch += 1` | (참가자는 유지, 호스트 권한만 이전) | N/A |
| 방 종료 (ROOM-01) | `rooms.status='ended'` | `DeleteRoom` (모든 참가자 퇴장) | ~1초 |
| LiveKit 측 퇴장 (네트워크) | webhook `participant_left` → DB 동기화 | (이미 끊김) | 즉시 |

### 8.4 Replay 방어 (C7)

#### 8.4.1 LiveKit JWT에 jti 추가 (감사 추적 전용)

```typescript
// supabase/functions/livekit-token/index.ts
const at = new AccessToken(apiKey, apiSecret, {
  identity: appUserId,
  name: user.email ?? user.id,
  ttl: 600,
  metadata: JSON.stringify({ token_version: participant.token_version }),
  // jti: JWT ID — 토큰별 고유 UUID. 블랙리스트 없이 감사 로그·디버깅용.
  // ponytail: jti 블랙리스트는 TTL 10m + token_version 방어에서는 가치가 제한적이라 만들지 않는다.
  //   1초 이내 즉시 철회가 필요해지면 jti + Redis 블랙리스트를 추가한다.
});
at.jwtPayload = { ...at.jwtPayload, jti: crypto.randomUUID() };
```

- **블랙리스트 없음**: TTL 10m 내 자연 만료 + §8.2 token_version 방어로 충분
- **jti는 Edge Function 로그에 기록**: 토큰 발급 추적, 침해 사고 조사 시 활용
- **access_token과 refresh_token 분리**: LiveKit JWT는 단기(10m), Supabase refresh는 30일 (§1.2)

#### 8.4.2 DataChannel 메시지 재생 방어 (이미 구현됨)

`authority_epoch` + `seq` monotonic counter로 이미 방어됨 (`DATA-SCHEMA.md §2.1`):

```
수신자 검증 규칙:
1. msg.authority_epoch < roomStore.authority_epoch → drop (오래된 epoch)
2. msg.authority_epoch == roomStore.authority_epoch AND msg.seq <= lastSeq → drop (재생)
3. msg.host_id != rooms.host_id (DB 최신) → drop (권한 없는 발신자)
4. 위 검증 모두 통과 시에만 store 반영
```

`room-authority`, `script-cue` 채널 모두 동일 규칙 적용. `chat` 채널은 `timestamp_ms` + sender 검증으로 느슨하게 (chat은 재생 피해가 제한적).

#### 8.4.3 Refresh 토큰 재생 방어

Supabase Auth가 자체 처리:
- refresh 시 parent token 무효화 (rotation)
- 세션 고정 방지를 위해 로그인 시 `supabase.auth.refreshSession()` 강제 (§1.3)
- 클라이언트는 refresh 토큰을 메모리에만 보관 (localStorage 의존 최소화)

### 8.5 무효화 프로토콜 상세

#### 8.5.1 강퇴 플로우 (HOST-01 → ROOM-04)

```
1. 호스트가 [강퇴] 클릭 → HostConsole → supabase.functions.invoke('kick-participant', { room_id, user_id })
2. Edge Function 'kick-participant':
   BEGIN;
     UPDATE room_participants 
     SET is_disabled_by_host = true, updated_at = now()
     WHERE room_id = ? AND user_id = ?;
     -- authority_epoch은 유지 (강퇴는 host 이전이 아님)
   COMMIT;
3. 동일 Edge Function에서 LiveKit RoomService.removeParticipant(roomId, identity) 호출
   - identity = user_id (AccessToken.identity와 일치)
   - 결과: LiveKit 연결 즉시 종료
4. 클라이언트(강퇴된 사용자)는 Realtime postgres_changes 구독으로 is_disabled_by_host=true 감지
   → 자발적 LiveKit 연결 해제 + "강퇴되었습니다" 토스트 + LobbyPage로 라우팅
5. 강퇴된 사용자가 재입장 시도:
   - 기발급 토큰(v1)으로 LiveKit connect → webhook participant_joined 트리거
   - 서버가 room_participants 재조회 → is_disabled_by_host=true 확인 → removeParticipant
   - 또는 클라이언트가 새 토큰 요청 → Edge Function 403 반환
```

#### 8.5.2 자발적 퇴장 플로우

```
1. 참가자가 [나가기] 클릭 → RoomView → supabase.functions.invoke('leave-room', { room_id })
2. Edge Function 'leave-room':
   BEGIN;
     UPDATE room_participants
     SET state = 'left', left_at = now(), updated_at = now()
     WHERE room_id = ? AND user_id = ?;
   COMMIT;
3. LiveKit 연결 종료 (클라이언트가 room.disconnect() 호출)
4. 재입장 시도:
   - 기발급 토큰(v1)으로 재연결 → webhook → state='left' 확인 → removeParticipant
   - 또는 새 토큰 발급 요청 → §4.1 게이트에서 state='left' → 403
5. 재입장 허용 조건: 호스트가 별도 초대(room_invites)를 다시 발급한 경우만
```

#### 8.5.3 LiveKit webhook 핸들러 (신규)

```typescript
// supabase/functions/livekit-webhook/index.ts
// endpoint: POST /functions/v1/livekit-webhook
// LiveKit 서버가 participant_joined/participant_left 이벤트를 전송

Deno.serve(async (req) => {
  const event = await req.json();
  // LiveKit webhook 서명 검증 (Authorization header 또는 SHA256 signature)
  if (!verifyLiveKitWebhook(event, req.headers)) {
    return new Response("Invalid signature", { status: 401 });
  }

  if (event.type === 'participant_joined') {
    const { roomId, identity } = event.participant;
    const supabase = createServiceClient(); // service role key 사용
    
    const { data: p } = await supabase
      .from('room_participants')
      .select('is_disabled_by_host, state')
      .eq('room_id', roomId)
      .eq('user_id', identity)
      .single();
    
    if (p?.is_disabled_by_host || p?.state === 'left') {
      // 무효화된 참가자의 재입장 → 즉시 퇴장
      await livekit.roomService.removeParticipant(roomId, identity);
      // Preview/Prod에서는 audit_logs INSERT 또는 외부 log sink 전송이 필수.
      // Local dev에서만 console fallback 허용.
      await supabase.from('audit_logs').insert({
        event: 'token_revoked_participant_removed',
        room_id: roomId,
        actor_user_id: identity,
        target_type: 'participant',
        target_id: identity,
        metadata_json: {
          reason: p.is_disabled_by_host ? 'disabled_by_host' : 'state_left',
        },
      });
    }
  }

  if (event.type === 'participant_left') {
    // LiveKit 측 퇴장을 DB에 동기화 (H6 reaper와 연동)
    // 단, 자발적 퇴장/강퇴가 이미 DB에 반영되어 있으면 중복 업데이트 금지
  }

  return new Response("ok", { status: 200 });
});
```

**MUST NOT:**
- ❌ webhook 서명 검증 없이 `removeParticipant` 호출
- ❌ service role key를 클라이언트에 노출
- ❌ webhook 처리 중 블로킹 I/O (타임아웃 5초 내 반환)

### 8.6 구현 체크리스트

- [ ] `livekit-edge-fn.md §4.1` 발급 게이트에 `state='left'` + `is_disabled_by_host` + `role` 권한 검사 포함
- [ ] `livekit-edge-fn.md §1` 코드에 `jti: crypto.randomUUID()` 추가
- [ ] 신규 Edge Function `kick-participant` 작성: DB 업데이트 + LiveKit removeParticipant
- [ ] 신규 Edge Function `leave-room` 작성: DB state='left' + LiveKit 연결 종료 통지
- [ ] 신규 Edge Function `livekit-webhook` 작성: participant_joined 시 무효화 검증
- [ ] 클라이언트 `room_participants` Realtime 구독: `is_disabled_by_host`·`state` 변경 시 자발적 연결 해제
- [ ] 클라이언트 10초 폴링 fallback: Realtime 구독 장애 시 DB 직접 조회
- [ ] audit_logs 테이블 또는 외부 audit sink에 토큰 철회 이벤트 기록 (Preview/Prod 필수, console fallback은 local dev only)
- [ ] LiveKit webhook 서명 검증 로직 구현 (HMAC-SHA256, LiveKit 문서 참조)

### 8.7 잔존 위험 + 업그레이드 경로

| 위험 | 현재 완화 | 업그레이드 |
|---|---|---|
| webhook 지연 중 재입장 시도 | token_version metadata mismatch로 즉시 제거 + TTL 10m | Redis jti 블랙리스트 (토큰 단위 즉시 철회 필요 시) |
| jti 블랙리스트 없음 | token_version + TTL 10m 자연 만료 | Redis jti 블랙리스트 |
| DataChannel 메시지 재생 | authority_epoch + seq | 추가 조치 불필요 (이미 충분) |
| Supabase refresh 토큰 재생 | Supabase 자체 rotation | 추가 조치 불필요 |

---

## 9. 환경 변수 관리

### 9.1 분류표

| 변수 | 위치 | 클라이언트 노출 | 용도 |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | ✅ YES | 클라이언트 Supabase 연결 |
| `VITE_SUPABASE_ANON_KEY` | `.env` | ✅ YES | 클라이언트 Auth (RLS로 보호됨) |
| `VITE_LIVEKIT_URL` | `.env` | ✅ YES | 클라이언트 WebRTC 연결 |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` / Vercel | ❌ NO | Edge Function 전용 |
| `LIVEKIT_API_SECRET` | `.env.local` / Vercel | ❌ NO | Edge Function 토큰 서명 |
| `OPENAI_API_KEY` | `.env.local` / Vercel | ❌ NO | 모더레이션 API |
| `FAL_KEY` | `.env.local` / Vercel | ❌ NO | fal.ai 영상 생성 |

### 9.2 파일 관리

```bash
# .gitignore
.env
.env.local
.env.*.local
supabase/functions/.env.local
```

```typescript
// vite.config.ts
export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL),
    // VITE_* 만 클라이언트 번들에 포함
  }
});
```

### 9.3 Vercel 환경변수 설정

**대시보드 → Settings → Environment Variables**

| 변수 | 환경 | Server-only? |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development | ✅ Server |
| `LIVEKIT_API_SECRET` | Production, Preview, Development | ✅ Server |
| `OPENAI_API_KEY` | Production, Preview, Development | ✅ Server |
| `FAL_KEY` | Production, Preview, Development | ✅ Server |

> "Server-only" 체크 후 저장 (클라이언트 번들에 포함 안 됨)

---

## 10. Phase 1 게이트 체크리스트

**DB 마이그레이션 전 완료 필수:**

- [ ] **RLS**: 모든 테이블 `ENABLE ROW LEVEL SECURITY` 선언 확인
  - [ ] `rooms`, `room_participants`, `models`, `messages`, `vgen_jobs` 포함
  - [ ] 각 테이블별 정책 쿼리 실행 완료

- [ ] **Service Role Key**: 클라이언트 노출 없음 확인
  - [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY" src/` 결과 0건
  - [ ] `.env`, `.env.local` 모두 `.gitignore`에 포함

- [ ] **LiveKit 함수**: `livekit-token` Edge Function 배포 완료
  - [ ] 토큰 만료 `ttl = 600` (10분) 확인 — livekit-edge-fn.md §1 기준
  - [ ] 함수 내부에서 room_id 검증 로직 확인
  - [ ] 테스트: 잘못된 room_id로 요청 시 403 반환
  - [ ] **§8 토큰 무효화**: `jti` + `token_version` metadata 포함 확인 (§8.4.1)
  - [ ] **§8 발급 게이트**: `token_version`, `state='left'`, `is_disabled_by_host` 검사 포함 확인 (§8.2 3a)
  - [ ] **§8 webhook**: `livekit-webhook` Edge Function 배포 + 서명 검증 (§8.5.3)
  - [ ] **§8 철프 트리거**: `kick-participant`·`leave-room` Edge Function 배포 (§8.5.1·§8.5.2)
  - [ ] 테스트: 강퇴 후 기발급 토큰으로 재입장 시도 → 1~3초 내 퇴장 확인

- [ ] **Storage CORS**: 도메인 제한 설정 완료
  - [ ] `https://chatterbox.vercel.app` + `http://localhost:5173` 만 허용
  - [ ] `origin: ["*"]` 없음 확인

- [ ] **Moderation**: OpenAI Moderation API 키 서버 환경변수에만 존재 확인
  - [ ] `OPENAI_API_KEY` = Vercel "Server-only" 체크됨
  - [ ] fal.ai 비밀키 (`FAL_KEY`) 동일 설정
  - [ ] Moderation API 타임아웃 10초 설정 확인
  - [ ] fail-close 동작 테스트 (API mock 타임아웃 시뮬레이션)
  - [ ] 크레딧 차감이 GENERATING 진입 직전에만 발생하는지 확인

- [ ] **환경변수**: `.env` vs `.env.local` 분리 확인
  - [ ] `.env`: VITE_* 공개 변수만
  - [ ] `.env.local`: 비밀키 (gitignore 대상)

- [ ] **감시 메커니즘** (선택사항, Phase 2 이전):
  - [ ] Sentry 연동 (토큰 노출 감시)
  - [ ] CloudFlare WAF 규칙 (비밀키 패턴 감지)

- [ ] **녹화/DUB 동의 (§11)**: consent_json 컬럼 + 게이트 구현
  - [ ] recordings 테이블에 `consent_json`·`retention_expires_at` 컬럼 추가
  - [ ] dub_sessions 테이블에 `consent_json`·`retention_expires_at` 컬럼 추가
  - [ ] 동의 수집 UI: 각 참가자 [동의] 버튼, `consented_at`·`ip_hash` 기록
  - [ ] 녹화/더빙 시작 게이트: `consent_json.all_consented = true` 검증
  - [ ] pg_cron daily: `retention_expires_at < now()` 행 삭제 + R2 오브젝트 삭제

---

