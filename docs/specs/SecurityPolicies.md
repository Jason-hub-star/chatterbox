---
tags: [spec]
---

<!--
  specs/ 문서 — Phase 1 DB 구축 전 필수 보안 정책
  Updated: 2026-07-01 · PLATFORM-SECURITY-RISKS-B §5 Phase 게이트 · VUL-01/VUL-03/VUL-04 반영
  Sources: OWASP, Supabase docs, LiveKit docs, OpenAI Moderation API, NIST
-->
<!-- opencode: 2026-06-29 - LiveKit 토큰 무효화 + replay 방어 §8 신설 (G-37·G-44·C1·C7). Coded with OpenCode; high-cost model review recommended. -->

# ChatterBox 보안 정책 (SEC)

> **범위**: 인증·인가·토큰·미디어·모더레이션·환경변수 정책
> **적용**: Phase 1 DB 마이그레이션 전 모두 완료
> **책임**: 백엔드 리더가 체크리스트 항목별 구현/검증 후 DONE 마킹

---

## 0. P0 보안 차단 게이트

아래 항목은 구현 착수 전 `DONE`이어야 한다. 하나라도 비어 있으면 DB/Edge Function 구현을 시작하지 않는다.

| ID | 차단 항목 | 확정 규칙 |
|---|---|---|
| SEC-P0-01 | LiveKit 토큰 발급 | `rooms.id` 확인만으로 발급 금지. host 또는 활성 `room_participants(room_id,user_id)` 행이 있어야 한다. |
| SEC-P0-02 | RLS room 상관 검증 | `auth.uid() IN (SELECT user_id FROM room_participants)` 단독 금지. 모든 정책은 대상 row의 `room_id`와 참가자 row의 `room_id`를 묶는다. |
| SEC-P0-03 | 방 비밀번호 해시 | `rooms.password_hash` 금지. `room_secrets.password_hash`로 분리하고 클라이언트 SELECT 불가. |
| SEC-P0-04 | 초대/게스트 권한 | 배열 컬럼 `invited_guests` 금지. `room_invites` 테이블 + 만료/폐기/사용횟수로 검증한다. |
| SEC-P0-05 | DataChannel SSOT | 허용 채널은 `room-authority`, `chat`, `script-cue`, `blendshape`뿐이다. 새 기능은 기존 채널의 `type`/`message_type`만 확장하거나 Edge/DB relay로 처리한다. |
| SEC-P0-06 | Stage mode 상태머신 | `normal`, `vgen`, `dub`는 `state-machines/StageMode.md`만 따른다. VGen/DUB 동시 활성 금지. |
| SEC-P0-07 | fal.ai 호출 | 클라이언트 `fal.subscribe()` 금지. Edge Function/Workflow만 FAL_KEY를 보유하고 호출한다. |
| SEC-P0-08 | R2 URL | `getPublicUrl()` 금지. 오브젝트 키 저장 + 서버 발급 signed URL만 사용한다. |

### Invite Code 엔트로피 요구사항 (SEC-INVITE-ENTROPY)

| 항목 | 값 | 근거 |
|---|---|---|
| 코드 형식 | `crypto.randomUUID()` 기반 32자 hex 또는 Base62 22자 | 128-bit 엔트로피 |
| 저장 형식 | `invite_code_hash = SHA256(raw_code)` — 원문 DB 저장 금지 | 해시 탈취 시 원문 추정 불가 |
| Rate limit | IP당 분당 5회 (Edge Function 내 검증) | IP 단독 방어 한계 존재 |
| 추가 방어 | 10회 연속 실패 IP → 1시간 차단 (`blocked_ips` 테이블 또는 Upstash) | 분산 브루트포스 완화 |
| URL 노출 | `?invite={raw_code}` — HTTPS 필수 (평문 전송 금지) | TLS 없이 invite URL 공유 금지 |

> **브루트포스 위협:** 128-bit 엔트로피에서 단일 IP 5회/분 제한으로 전수조사는 사실상 불가능하나,  
> IP 로테이션 분산 공격(VPN/Tor)에 대해 10회 실패 임계값 + Cloudflare/Supabase Edge Rate Limit 이중 방어를 권장.

## 1. 인증 정책 (AUTH)

### 1.1 로그인 방식
- **Supabase Auth** (이메일 + Google OAuth2)
- **이메일 비밀번호 검증**: bcrypt 해싱 (Supabase 자체 관리)
- **Google OAuth**: Consent screen + `email` scope 만 요청

### 1.2 토큰 만료

| 토큰 | 만료 시간 | 용도 |
|---|---|---|
| Access Token | 1시간 | API 요청 인증 |
| Refresh Token | 30일 | 새 Access Token 발급 |
| LiveKit JWT | 10분 | 방 입장 (livekit-edge-fn.md SSOT: ttl=600) |

### 1.3 세션 관리

```typescript
// 로그인 시 세션 재생성 (세션 고정 방지)
supabase.auth.refreshSession()

// 로그아웃 시 정리
await supabase.auth.signOut()
// localStorage 클리어 (Zustand는 자동 초기화)
```

### 1.4 MUST NOT (금지사항)

- ❌ 비밀번호 평문 저장
- ❌ JWT를 URL 파라미터로 전달 (`?token=...` 금지)
- ❌ Access Token을 localStorage가 아닌 쿠키에 저장 (XSS 취약)
- ❌ 만료 검증 없이 토큰 사용

### 1.5 연령 확인 게이트 (SEC-AGE)

- Auth 완료 후 첫 방 진입 전 `users.age_band`와 `users.age_attested_at`이 있어야 한다.
- 허용 값은 `14_17`, `18_plus` 두 개뿐이다. 만 14세 미만은 가입·방 진입·익명 viewer 입장을 차단한다.
- 생년월일 원문은 저장하지 않는다. UI에서 확인한 결과만 `age_band`로 저장한다.
- `age_band='14_17'` 사용자는 보호자 동의 플로우가 생기기 전까지 녹화/DUB/OBS/public demo room 노출 대상에서 제외한다.
- `livekit-token`, `accept-invite`, `join-public-room`, `record-consent`, `start-recording`, `create-dub-session`, `trigger-vgen`, `create-obs-token`은 서버에서 age gate를 재검증한다.
- 보호자 동의 플로우 전까지 `trigger-vgen`은 `age_band='18_plus'`만 허용한다. 크레딧 차감·provider 호출보다 먼저 차단한다.

### 1.6 익명 뷰어의 연령 검증 범위 제외 (MVP 의도된 제한)

**현황**: ViewerGate.md의 익명 초대링크 뷰어(userId 없음, `resolveRole()` line 37~51)는 age_band 필드가 없어 §1.5의 연령 검증 대상이 아니다. 이는 **정책 공백이 아니라 MVP 단계의 의도된 범위 제한**이다.

**의미**:
- 익명 뷰어는 현재 `age_band` 검증을 거치지 않으며, 이로 인해 미성년자가 초대링크만으로 age-restricted 콘텐츠(녹화/DUB/public room/OBS)에 접근할 수 있다.
- 이 갭은 정식 익명 인증 모델(anonymous auth with session tracking)이 구현될 때까지 보류된다.

**향후 확장**:
- 익명 사용자 수명주기 관리가 필요하면 (예: persistent anonymous session, age click-through), 별도 기능 설계 단계에서 age click-through 또는 경량 age verification 메커니즘을 추가할 수 있다.
- 현재는 초대링크 발급자(로그인한 호스트)가 대상 시청자의 연령 적절성을 판단하는 것으로 간주한다.

---

## 2. RLS 정책 (Row Level Security)

### 2.1 활성화 선언

모든 테이블:
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;
```

### 2.1.1 간접 경로 검증 원칙

> **외래키 체인 검증**: session_id → session → room_id 처럼 외래키가 2단계 이상인 경우, **모든 단계에서 room 소속 확인**이 필수입니다.
> - ❌ 1단계만 확인: `session_id` 존재 여부만 체크
> - ✅ 모든 단계: `session` 레코드의 `room_id` 후 `room` 참가자 목록 검증
> 
> 이를 위해 서브쿼리 JOIN을 통해 최종 `rooms` 테이블까지 도달하는 경로를 RLS 정책에 명시합니다.

### 2.2 핵심 테이블별 정책

> **ID 비교 규칙:** `auth.uid()`는 Supabase Auth UID이고, `rooms.host_id`, `room_participants.user_id`, `models.user_id` 등은 `users.id`를 참조한다. 아래 SQL 예시는 `current_app_user_id()`가 `(SELECT id FROM users WHERE auth_id = auth.uid())`를 반환하는 helper라고 가정한다. `auth.uid()`를 앱 FK와 직접 비교하지 않는다.

**rooms 테이블**
```sql
CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$;

-- 호스트만 수정 가능
CREATE POLICY "host_can_update" ON rooms FOR UPDATE
  USING (current_app_user_id() = host_id);

-- 참가자 + 유효 초대자만 상세 읽기. 공개 방 목록은 password_hash 없는 view로 분리한다.
CREATE POLICY "participants_can_read" ON rooms FOR SELECT
  USING (
    current_app_user_id() = host_id
    OR EXISTS (
      SELECT 1 FROM room_participants rp
      WHERE rp.room_id = rooms.id
        AND rp.user_id = current_app_user_id()
        AND rp.state <> 'left'
    )
    OR EXISTS (
      SELECT 1 FROM room_invites ri
      WHERE ri.room_id = rooms.id
        AND ri.invited_user_id = current_app_user_id()
        AND ri.revoked_at IS NULL
        AND ri.expires_at > now()
    )
  );
```

**users 테이블** (C11 연동 — HIGH 핵심 해소: §2.2에 누락된 RLS 추가)
```sql
-- 본인 행 전체 읽기 + 같은 방 참가자의 표시 정보만 읽기 (host_id·email 노출 금지)
CREATE POLICY "users_read_own" ON users FOR SELECT
  USING (auth.uid() = auth_id);

CREATE POLICY "users_read_same_room" ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_participants rp1
      JOIN room_participants rp2 ON rp1.room_id = rp2.room_id
      WHERE rp1.user_id = users.id
        AND rp2.user_id = current_app_user_id()
        AND rp1.state <> 'left'
        AND rp2.state <> 'left'
    )
  );
  -- [DEPRECATED for same-room reads] → public_user_profiles view로 대체됨 (VUL-01 수정)
  -- 이 정책은 본인 읽기(users_read_own)와 조합해 유지하되, 타인 읽기는 view 경유만 허용.

-- [VUL-01 수정] 같은 방 참가자용 공개 필드 제한 뷰
-- users 기본 테이블의 users_read_same_room 정책 대신 이 view를 사용한다.
-- email, is_admin, auth_id, deleted_at 등 민감 필드는 노출하지 않는다.
CREATE VIEW public_user_profiles
  WITH (security_barrier = true)
AS
  SELECT
    id,
    display_name,
    avatar_url,
    status,
    bio,
    language,
    profile_visibility
  FROM users
  WHERE deleted_at IS NULL;

-- public_user_profiles view에 같은 방 참가자 RLS 적용
ALTER VIEW public_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_read_same_room" ON public_user_profiles FOR SELECT
  USING (
    id = current_app_user_id()  -- 본인 항상 허용
    OR EXISTS (
      SELECT 1 FROM room_participants rp1
      JOIN room_participants rp2 ON rp1.room_id = rp2.room_id
      WHERE rp1.user_id = public_user_profiles.id
        AND rp2.user_id = current_app_user_id()
        AND rp1.state <> 'left'
        AND rp2.state <> 'left'
    )
    OR (
      -- profile_visibility='public' 사용자는 전체 인증 사용자에게 노출
      SELECT profile_visibility FROM users WHERE id = public_user_profiles.id
    ) = 'public'
  );

-- 클라이언트는 users 테이블 직접 SELECT 대신 public_user_profiles view만 사용한다.
-- MUST NOT: supabase.from('users').select('*') — 반드시 supabase.from('public_user_profiles').select(...)

-- 본인 행만 수정 (display_name, avatar_url, language, preferred_genres 등)
CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING (auth.uid() = auth_id)
  WITH CHECK (auth.uid() = auth_id);

-- INSERT는 Supabase Auth signup 트리거만 (직접 INSERT 금지)
-- DELETE는 본인만 (회원 탈퇴), service role도 허용
CREATE POLICY "users_delete_own" ON users FOR DELETE
  USING (auth.uid() = auth_id);
```

**room_invites 테이블** (HIGH 핵심 해소: §2.2에 누락된 RLS 추가)
```sql
-- 호스트는 자기 방의 모든 초대 읽기, 초대받은 사용자는 본인 초대만 읽기
CREATE POLICY "host_or_invitee_read" ON room_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = room_invites.room_id
        AND r.host_id = current_app_user_id()
    )
    OR invited_user_id = current_app_user_id()
  );

-- 호스트만 초대 생성 (role, max_uses, expires_at 설정)
CREATE POLICY "host_create_invite" ON room_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = room_invites.room_id
        AND r.host_id = current_app_user_id()
    )
  );

-- 호스트만 초대 폐기 (revoked_at 설정)
CREATE POLICY "host_revoke_invite" ON room_invites FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = room_invites.room_id
        AND r.host_id = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = room_invites.room_id
        AND r.host_id = current_app_user_id()
    )
  );

-- 호스트만 초대 삭제
CREATE POLICY "host_delete_invite" ON room_invites FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = room_invites.room_id
        AND r.host_id = current_app_user_id()
    )
  );
```

**models 테이블**
```sql
-- 본인 모델 전체 CRUD
CREATE POLICY "users_own_models" ON models FOR ALL
  USING (current_app_user_id() = user_id);

-- 공개 모델 읽기
CREATE POLICY "view_public_models" ON models FOR SELECT
  USING (is_public = true);
```

**vgen_jobs 테이블**
```sql
-- 방 참가자만 읽기
CREATE POLICY "participants_read_jobs" ON vgen_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      LEFT JOIN room_participants rp
        ON rp.room_id = r.id AND rp.user_id = current_app_user_id() AND rp.state <> 'left'
      WHERE r.id = vgen_jobs.room_id
        AND (r.host_id = current_app_user_id() OR rp.user_id IS NOT NULL)
    )
  );

-- 호스트만 INSERT
CREATE POLICY "host_create_jobs" ON vgen_jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = vgen_jobs.room_id
        AND r.host_id = current_app_user_id()
    )
  );
```

**messages 테이블**
```sql
-- 방 참가자 읽기. 쓰기/삭제는 Edge Function만.
CREATE POLICY "participants_read_write" ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_participants rp
      WHERE rp.room_id = messages.room_id
        AND rp.user_id = current_app_user_id()
        AND rp.state <> 'left'
    )
  );

-- INSERT 정책 없음. actor/host/viewer 모두 send-chat 계열 Edge Function 경유.
-- Edge Function이 sanitize, room_participants 검증, slow mode, blocked_words, rate limit, audit를 처리한 뒤 service role로 INSERT한다.
-- DELETE 정책 없음 (메시지 삭제 불가)
```

### 채팅·리액션 Rate Limit 계약 (SEC-RL)

> Edge Function(`send-chat`, `send-viewer-chat`, `send-viewer-reaction`)에서 강제. RLS 단독으로는 초당 제한 불가.

| 이벤트 | 제한 | 초과 시 응답 |
|---|---|---|
| 채팅 메시지 | 동일 user_id+room_id 기준 **2건/초, 30건/분** | 429 Too Many Requests |
| 리액션 | 동일 user_id+room_id 기준 **5건/초** | 429 Too Many Requests |
| 폴 응답 | room 당 **1회** (idempotency_key) | 409 Conflict |
| 페이셜 데이터 | 동일 user_id+room_id 기준 **600건/분 (10Hz)** | 429 → INSERT 드롭 (DataChannel 계속 유지) |

Actor/host 채팅도 직접 DataChannel publish 또는 직접 `messages` INSERT 금지. 서버 relay가 `messages` INSERT 후 `chat` DataChannel 또는 Realtime으로 브로드캐스트한다.

구현: `rate_limit_counters` 테이블(또는 Upstash Redis) + `supabase.rpc('check_rate_limit', {user_id, room_id, event, window_sec, max_count})`

> **facial_data 제한 근거**: 30Hz 풀 트래킹 = 1800건/분이나, DB INSERT는 10Hz(600건/분)로 충분. 초과분은 클라이언트가 decimation으로 드롭. 미구현 시 actor 계정으로 DB DoS 가능 (VUL-NEW-06).

### users 테이블 컬럼 보호 (SEC-UCOL)

> `room_participants`와 동일 패턴. `is_admin`, `deleted_at`, `auth_id`는 자기 UPDATE 불가.

```sql
CREATE OR REPLACE FUNCTION guard_immutable_user_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin 변경은 서비스 롤 전용';
  END IF;
  IF NEW.auth_id <> OLD.auth_id THEN
    RAISE EXCEPTION 'auth_id 변경 금지';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND
     current_setting('request.jwt.claims.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'deleted_at 변경은 soft_delete_user RPC 경유만 허용';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_immutable_user_columns
  BEFORE UPDATE ON users
  FOR EACH ROW
  WHEN (current_setting('request.jwt.claims.role', true) IS DISTINCT FROM 'service_role')
  EXECUTE FUNCTION guard_immutable_user_columns();
```

### accept-invite 원자적 used_count 증가 (SEC-INVITE-ATOMIC)

`SELECT used_count` 후 `UPDATE` 분리는 TOCTOU 레이스 허용. 반드시 단일 원자 UPDATE:

```sql
-- accept-invite Edge Function 내부 (서비스 롤)
UPDATE room_invites
  SET used_count = used_count + 1
  WHERE id = :invite_id
    AND used_count < max_uses
    AND expires_at > now()
    AND revoked_at IS NULL
RETURNING id;
-- affected rows = 0이면 초대코드 소진/만료 → 409 반환
```

### max_participants 원자적 정원 체크 (SEC-CAPACITY)

ViewerGate의 count 확인 + insert 분리는 동시 입장 시 정원 초과 허용. accept-invite 또는 viewer insert 시 DB 레벨 체크:

```sql
-- room_participants INSERT BEFORE trigger 또는 Edge Function 트랜잭션
INSERT INTO room_participants (room_id, user_id, role)
SELECT :room_id, :user_id, :role
FROM rooms
WHERE id = :room_id
  AND current_participants < max_participants
-- 조건 불일치 시 0 rows → Edge Function이 429 반환
```

**participants 테이블**
```sql
-- [SECURITY] 자기 UPDATE는 퇴장(state='left')·is_ready 토글만 허용.
-- role·slot_index·is_disabled_by_host 변경은 클라이언트에서 직접 불가 — trigger로 강제 차단.

-- BEFORE UPDATE trigger: 민감 컬럼 불변 보장 (서비스 롤 제외)
CREATE OR REPLACE FUNCTION guard_immutable_participant_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'role 변경은 accept-invite·kick-participant Edge Function 경유만 허용';
  END IF;
  IF NEW.slot_index IS DISTINCT FROM OLD.slot_index THEN
    RAISE EXCEPTION 'slot_index 변경은 호스트 Edge Function 경유만 허용';
  END IF;
  IF NEW.is_disabled_by_host IS DISTINCT FROM OLD.is_disabled_by_host THEN
    RAISE EXCEPTION 'is_disabled_by_host 변경은 set-participant-safety Edge Function 경유만 허용';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_immutable_participant_columns
  BEFORE UPDATE ON room_participants
  FOR EACH ROW
  WHEN (current_setting('request.jwt.claims.role', true) IS DISTINCT FROM 'service_role')
  EXECUTE FUNCTION guard_immutable_participant_columns();

-- RLS: 퇴장(누구나) + is_ready 토글(actor·host만) — trigger가 다른 컬럼 보호
CREATE POLICY "self_update_allowed" ON room_participants FOR UPDATE
  USING (current_app_user_id() = user_id)
  WITH CHECK (
    current_app_user_id() = user_id
    AND (
      state = 'left'                    -- 자기 퇴장
      OR role IN ('actor', 'host')      -- is_ready 토글 (trigger가 다른 필드 차단)
    )
  );
```

**voice_tracks 테이블**
```sql
-- 같은 방 참가자만 읽기 (간접 경로 검증: track → room)
CREATE POLICY "room_members_read_tracks" ON voice_tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      LEFT JOIN room_participants rp
        ON rp.room_id = r.id AND rp.user_id = current_app_user_id() AND rp.state <> 'left'
      WHERE r.id = voice_tracks.room_id
        AND (r.host_id = current_app_user_id() OR rp.user_id IS NOT NULL)
    )
  );

-- 본인의 트랙만 INSERT (room 참가자 확인)
CREATE POLICY "user_create_own_track" ON voice_tracks FOR INSERT
  WITH CHECK (
    current_app_user_id() = user_id
    AND EXISTS (
      SELECT 1 FROM rooms r
      LEFT JOIN room_participants rp
        ON rp.room_id = r.id AND rp.user_id = current_app_user_id() AND rp.state <> 'left'
      WHERE r.id = voice_tracks.room_id
        AND (r.host_id = current_app_user_id() OR rp.user_id IS NOT NULL)
    )
  );

-- 본인의 트랙만 UPDATE/DELETE
-- HIGH 핵심 해소: UPDATE에 WITH CHECK로 room 참가자 검증 추가 (강퇴 후 수정 차단)
CREATE POLICY "user_modify_own_track" ON voice_tracks FOR UPDATE
  USING (current_app_user_id() = user_id)
  WITH CHECK (
    current_app_user_id() = user_id
    AND EXISTS (
      SELECT 1 FROM rooms r
      LEFT JOIN room_participants rp
        ON rp.room_id = r.id AND rp.user_id = current_app_user_id() AND rp.state <> 'left'
      WHERE r.id = voice_tracks.room_id
        AND (r.host_id = current_app_user_id() OR rp.user_id IS NOT NULL)
    )
  );

-- [VUL-NEW-05 수정] DELETE도 UPDATE와 동일하게 room 참가자 상태 검증 추가 — 강퇴 후 트랙 삭제 차단
CREATE POLICY "user_delete_own_track" ON voice_tracks FOR DELETE
  USING (
    current_app_user_id() = user_id
    AND EXISTS (
      SELECT 1 FROM rooms r
      LEFT JOIN room_participants rp
        ON rp.room_id = r.id AND rp.user_id = current_app_user_id() AND rp.state <> 'left'
      WHERE r.id = voice_tracks.room_id
        AND (r.host_id = current_app_user_id() OR rp.user_id IS NOT NULL)
    )
  );
```

**facial_data 테이블**
```sql
-- 같은 방 참가자만 읽기 (room_id 조인)
CREATE POLICY "room_members_read_facial" ON facial_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      LEFT JOIN room_participants rp
        ON rp.room_id = r.id AND rp.user_id = current_app_user_id() AND rp.state <> 'left'
      WHERE r.id = facial_data.room_id
        AND (r.host_id = current_app_user_id() OR rp.user_id IS NOT NULL)
    )
  );

-- 본인의 표정 데이터만 INSERT (append-only)
CREATE POLICY "user_append_facial_data" ON facial_data FOR INSERT
  WITH CHECK (
    current_app_user_id() = user_id
    AND EXISTS (
      SELECT 1 FROM room_participants rp
      WHERE rp.room_id = facial_data.room_id
        AND rp.user_id = current_app_user_id()
        AND rp.state <> 'left'
    )
  );

-- UPDATE/DELETE 명시적 거부 (append-only 정책, P1-VUL 수정)
CREATE POLICY "deny_update" ON facial_data FOR UPDATE USING (false);
CREATE POLICY "deny_delete" ON facial_data FOR DELETE USING (false);
```
**dub_sessions 테이블**

```sql
-- 같은 방 참가자만 읽기 (간접 경로 검증: dub_session → room)
CREATE POLICY "room_members_read_dub" ON dub_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      LEFT JOIN room_participants rp
        ON rp.room_id = r.id AND rp.user_id = current_app_user_id() AND rp.state <> 'left'
      WHERE r.id = dub_sessions.room_id
        AND (r.host_id = current_app_user_id() OR rp.user_id IS NOT NULL)
    )
  );

-- 호스트만 더빙 세션 생성
CREATE POLICY "host_create_dub_session" ON dub_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = dub_sessions.room_id
        AND r.host_id = current_app_user_id()
    )
  );

-- [VUL-NEW-03 수정] created_by 브랜치: 강퇴/퇴장 후 조작 차단 — room_participants 상태 검증 추가
CREATE POLICY "host_or_self_update_dub" ON dub_sessions FOR UPDATE
  USING (
    (
      created_by = current_app_user_id()
      AND EXISTS (
        SELECT 1 FROM room_participants rp
        WHERE rp.room_id = dub_sessions.room_id
          AND rp.user_id = current_app_user_id()
          AND rp.state <> 'left'
      )
    )
    OR EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = dub_sessions.room_id
        AND r.host_id = current_app_user_id()
    )
  )
  WITH CHECK (
    -- 업데이트된 row도 동일한 검증 통과
    (
      created_by = current_app_user_id()
      AND EXISTS (
        SELECT 1 FROM room_participants rp
        WHERE rp.room_id = dub_sessions.room_id
          AND rp.user_id = current_app_user_id()
          AND rp.state <> 'left'
      )
    )
    OR EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = dub_sessions.room_id
        AND r.host_id = current_app_user_id()
    )
  );

-- 호스트만 DELETE
CREATE POLICY "host_delete_dub_session" ON dub_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = dub_sessions.room_id
        AND r.host_id = current_app_user_id()
    )
  );
```

### 2.3 Service Role Key 사용 제한

```
MUST NOT: 클라이언트 코드 또는 브라우저에 노출
MUST ONLY: Supabase Edge Function 내부 + 백엔드 환경변수
```

### 2.4 RLS 정책 검증 체크리스트

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 검증 항목 |
|---|---|---|---|---|---|
| rooms | 호스트/참가자 | - | 호스트만 | - | 범위 제한 ✓ |
| **users** | **본인 + 같은 방** | **Auth 트리거만** | **본인만** | **본인만** | **auth_id 매칭, email 노출 금지** ✓ |
| **room_invites** | **호스트 + 초대받은 본인** | **호스트만** | **호스트만(revoke)** | **호스트만** | **방 소속 검증, expires_at** ✓ |
| models | 본인/공개 | 본인 | 본인 | 본인 | 소유권 확인 ✓ |
| vgen_jobs | 참가자 | 호스트 | - | - | 방 검증 ✓ |
| messages | 참가자 | 참가자 | - | 금지 | 참가자 검증 ✓ |
| room_participants | 참가자 | - | 본인 | - | 소유권 검증 ✓ |
| **voice_tracks** | **방 참가자** | **본인+참가자** | **본인+참가자(WITH CHECK)** | **본인** | **간접 경로: room 검증, 강퇴 후 수정 차단** ✓ |
| **facial_data** | **방 참가자** | **본인** | 금지 | 금지 | **Append-only, 간접 경로** ✓ |
| **dub_sessions** | **방 참가자** | **호스트** | **호스트/본인(WITH CHECK)** | **호스트** | **간접 경로: room 검증, room_id 변조 방지** ✓ |

> **주의**: 외래키가 2단계 이상인 정책(voice_tracks, facial_data, dub_sessions)은 반드시 `room_id` 또는 상위 엔티티의 `rooms` 테이블 소속을 WHERE 절에서 검증해야 합니다. 중간 테이블만 확인하면 **권한 상승(Privilege Escalation)** 취약점이 발생합니다.

---

## 3. LiveKit 토큰 보안

### 3.1 토큰 발급 위치
**Supabase Edge Function** (`supabase/functions/livekit-token/index.ts`) 에서만 생성

```typescript
const at = new AccessToken(apiKey, apiSecret, {
  identity: user.id,
  name: user.email,
  ttl: 600, // 10분 (livekit-edge-fn.md SSOT)
  metadata: JSON.stringify({
    token_version: participant.token_version,
  }),
});

const role = participant.role; // 'actor' | 'viewer'
const canPublish = role === 'actor' || role === 'host';

at.addGrant({
  roomJoin: true,
  room: roomName,
  canPublish,
  canSubscribe: true,
  canPublishData: canPublish, // viewer/mobile/guest는 false. 채팅은 send-viewer-chat Edge Function 경유
});
```

### 3.2 클레임 검증

함수 내부에서:
```typescript
// ✅ 반드시 확인
room_id === requestedRoomId
participant_identity === user.id
user_id ∈ active room_participants for requestedRoomId or user_id === host_id
participant.state !== "left"
participant.is_disabled_by_host !== true
token.metadata.token_version === participant.token_version
participant.role === "viewer"이면 canPublish=false AND canPublishData=false
```

### 3.3 MUST NOT (금지사항)

- ❌ 프론트엔드에서 `LIVEKIT_API_SECRET` 노출
- ❌ 만료 없는 토큰 발급 (`ttl` 필수)
- ❌ viewer/mobile/guest 채팅을 위해 `canPublishData=true` 부여
- ❌ `room_participants.role` 확인 없이 actor 권한 토큰 발급
- ❌ 클라이언트 요청 `room_id`를 검증 없이 토큰에 포함
- ❌ `rooms.id`/`status`만 보고 토큰 발급

---

## 4. 미디어 보안 (Supabase Storage + R2)

### 4.1 서명 URL 만료

| 자산 | 만료 기간 | 용도 |
|---|---|---|
| 생성 영상 | 1시간 | 처리 중/재생 스트림 |
| 아바타 PNG | 7일 | 공개 프로필 |
| 공유 링크 | 7일 | 외부 초대 |
| 모델 rig.json | 영구 | 사용자 보유 자산 |

**❌ 클라이언트에서 NEVER (secret key 노출 위험)**
```typescript
// 금지: 클라이언트에서 직접 signed URL 생성
supabase.storage
  .from("videos")
  .createSignedUrl("path/to/video.mp4", 3600); // ← NEVER
```

**✅ Backend · Edge Function에서만 (RLS 권한 검증 후)**
```typescript
// 올바른 방식: Backend Edge Function 또는 RPC로 signed URL 발급
// supabase/functions/get-signed-video-url/index.ts
const { data, error } = await supabaseServiceRole.storage
  .from("videos")
  .createSignedUrl("path/to/video.mp4", 3600); // service role 사용, RLS 검증 후
```

### 4.2 업로드 크기 제한

| 파일 타입 | 최대 크기 | MIME 타입 |
|---|---|---|
| 생성 영상 | 100MB | `video/mp4`, `video/webm` |
| 아바타 PNG | 5MB | `image/png` |
| 오디오 | 50MB | `audio/webm`, `audio/mp3` |

**구현 위치**: Edge Function 또는 Supabase RLS

```typescript
const MAX_SIZES = {
  "video/mp4": 100 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
};

if (file.size > MAX_SIZES[contentType]) {
  throw new Error("File exceeds size limit");
}
```

### 4.3 Content-Type 검증

```typescript
const ALLOWED_TYPES = {
  "image/png": ["models/*"],
  "video/mp4": ["vgen/*"],
  "audio/webm": ["messages/*"],
};

if (!Object.keys(ALLOWED_TYPES).includes(contentType)) {
  return new Response("Content-Type not allowed", { status: 400 });
}
```

### 4.4 CORS 정책

**Supabase Storage CORS 설정:**
```json
[{
  "origin": ["https://chatterbox.vercel.app", "http://localhost:5173"],
  "methods": ["GET", "POST", "PUT", "DELETE"],
  "allowedHeaders": ["*"],
  "maxAge": 3600
}]
```

> ❌ `origin: ["*"]` 금지

---

## 5. 프롬프트 모더레이션 (VGEN-06)

### 5.1 사전 검사 (프롬프트 입력)

```typescript
// OpenAI Moderation API
const moderation = await fetch("https://api.openai.com/v1/moderations", {
  method: "POST",
  headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
  body: JSON.stringify({ input: userPrompt })
});

const { results } = await moderation.json();
const [{ flagged, categories }] = results;

if (flagged) {
  // 거부 + 로그. DB status는 pending|generating|done|failed|flagged만 사용한다.
  vgen_jobs.update({
    status: "failed",
    failure_reason: "moderation_rejected",
    flagged_categories: categories,
  });
  return;
}
```

### 5.2 사후 검사 (생성 완료)

```typescript
// 생성 완료 후 3프레임 샘플 추출
// OpenAI Vision API로 시각적 검사
const responses = [];
for (const frame of [0.25, 0.5, 0.75]) {
  const resp = await vision.analyze(videoFrame, "Does this frame contain violence/nudity?");
  responses.push(resp);
}

if (responses.some(r => r.contains_violation)) {
  vgen_jobs.update({
    status: "flagged",
    failure_reason: "post_moderation_rejected",
    flagged_categories: ["violence/nudity"],
  });
}
```

### 5.3 크레딧 정산

| 상태 | 크레딧 차감 | 비고 |
|---|---|---|
| `done` | 실제 사용량 | 정상 영상 |
| `failed` + `failure_reason='moderation_rejected'` | 0 | 사전 모더레이션 거부 |
| `failed` | 환불 | provider_error, timeout, validation_failed 등 시스템 오류 |
| `flagged` | 보류 | 사후 모더레이션 검토 대기. 승인 시 `done`, 거절 시 `appeal_status='rejected'`로 비공개 확정; 환불 여부는 운영자가 결정 |

### 5.4 로그 보존

```sql
ALTER TABLE vgen_jobs ADD COLUMN flagged_categories TEXT[];
-- 예: ['sexual', 'violence'] 또는 NULL
```

### 5.5 타임아웃 정책 (fail-close 원칙)

OpenAI Moderation API 호출 시 네트워크/서비스 장애 대응:

```
- API 호출 타임아웃: 10초 (hard limit)
- 타임아웃 발생 시: fail-close 원칙 적용
  → status = "FAILED", reason = "moderation_timeout"
  → 생성 진행 중단
  
- 재시도 정책:
  최대 2회 추가 재시도, 각 5초 간격 (총 최대 30초)
  
- 최종 실패 시:
  FAILED 상태로 전이 + 사용자에게 오류 메시지 전달
  "모더레이션 서비스 일시적 오류 — 잠시 후 다시 시도해주세요"
```

### 5.6 크레딧 차감 순서 명확화

**전체 생성 파이프라인과 크레딧 정산 시점:**

```
1. PROMPT_EDITING
   ↓
2. MODERATING (크레딧 미차감)
   ├─ OpenAI Moderation API 호출
   ├─ 타임아웃 시 FAILED (크레딧 차감 없음)
   └─ 통과 시 다음 단계
   ↓
3. GENERATING 진입 직전 ← ★ 크레딧 차감 시점
   ↓
4. GENERATING (fal.ai 영상 생성)
   ├─ 성공: status = "done"
   └─ 실패: status = "failed"
   ↓
5. POST_MODERATION (Vision API 검사)
   ├─ 위반 감지: status = "flagged", failure_reason = "post_moderation_rejected"
   └─ 통과: 최종 완료

★ 보장사항:
- 타임아웃/거부 시: 크레딧 차감 X
- provider_error/timeout/validation_failed: 자동 환불
- 사용자 취소: provider 미시작/로컬 큐 대기 중이면 환불, provider 시작 후에는 환불 불가
- flagged: 운영자 검토 전까지 보류. 최종 거절 시 환불 정책을 `refund-credit`로 명시 기록
```

### 5.7 VGEN-01 협업 프롬프트 스냅샷

LWW(Last-Writer-Wins) 동시 편집 중 모더레이션 검사 타이밍 불일치 방지:

```typescript
// 모더레이션 체크 진행 전 프롬프트 최종본 저장
const vgenJob = await supabase
  .from("vgen_jobs")
  .update({
    status: "pending",
    prompt_snapshot: userPrompt,  // 검사되는 최종 프롬프트 기록
    checked_at: new Date().toISOString()
  })
  .eq("id", jobId);

// 생성 시점: prompt_snapshot 사용 (원본 prompt 아님)
// → 검사된 내용과 생성 입력이 동일함을 보장
const generateRequest = {
  prompt: vgenJob.prompt_snapshot,  // ✅ 스냅샷 사용
  // ... 기타 파라미터
};
```

**검증 내용:**
- `prompt_snapshot`에 저장된 프롬프트로만 생성 진행
- 동시 편집 중 프롬프트 변경 시 재검사 필요
- 거부된 프롬프트는 스냅샷에 `is_flagged_version: true` 마킹

**MUST NOT (VUL-NEW-04)**:
- ❌ fal.ai 호출 시 `prompt_text` 재조회 사용 — 반드시 `prompt_snapshot`만 사용
- ❌ 모더레이션 완료 후 `prompt_snapshot` 재갱신 — 스냅샷은 검사 시점에 freeze됨
- ❌ 동시 편집(LWW) 중 `prompt_text` 변경 시 모더레이션 재통과 없이 생성 진행

---

## 6. DataChannel 보안

### 6.1 메시지 인증

LiveKit 자체 DataChannel E2EE 암호화 사용:
```
클라이언트1 → [암호화] → LiveKit → [복호화] → 클라이언트2
```

> ✅ 방 참가자만 수신 가능

### 6.2 메시지 크기 제한

```typescript
const MAX_MESSAGE_SIZE = 16 * 1024; // 16KB (LiveKit 기본값)

if (message.length > MAX_MESSAGE_SIZE) {
  throw new Error("Message exceeds 16KB limit");
}
```

### 6.3 호스트 권한 검증

> **[VUL-03]** `room-authority` 메시지의 권한 판정은 반드시 `event.participant.identity`(LiveKit 서버 보장)를 사용한다.  
> `message.sender_id` 또는 `message.host_id`는 공격자가 임의 설정 가능하므로 권한 판정에 사용 금지.  
> actor(`canPublishData=true`)가 DataChannel로 `{type:"room-authority", sender_id: hostUUID}`를 보낼 수 있기 때문.

`room-authority` 타입 메시지 (방장 권위):
```typescript
// 수신자 측 검증 (신뢰 불필요)
// [VUL-03 수정] msg.sender_id(공격자 제어)가 아닌 LiveKit participant.identity(서버 보장) 사용
const message = await livekit.onDataMessage();
if (message.type === "room-authority") {
  // LiveKit SDK가 수신 시 event.participant.identity를 제공한다.
  // identity는 AccessToken 발급 시 서버가 설정(identity: appUserId)하므로 위변조 불가.
  const senderIdentity = event.participant.identity;  // LiveKit 인증값
  
  const { data: room } = await supabase
    .from("rooms")
    .select("host_id")
    .eq("id", roomId)
    .single();
  
  if (!room || room.host_id !== senderIdentity) {
    console.warn("Unauthorized authority message ignored — sender identity mismatch");
    return;
  }
  // MUST NOT: message.sender_id 또는 message.host_id를 isHost 판정에 사용하지 않는다.
  // msg 본문의 host_id/sender_id는 표시 목적(UI)에만 참조하고, 권한 판정은 identity만 사용.
}
```

### 6.4 채팅 XSS 방지 + 3단계 sanitize (G-36)

> **목적**: `javascript:`·`data:` 프로토콜을 통한 XSS, markdown 링크 악용, HTML 주입을 3단계 계층으로 차단한다.
> **산출**: 본 섹션 + `contracts/ChatPanel.md`·`contracts/ChatOverlay.md` MUST NOT

#### 6.4.1 1단계 — 입력 sanitize (클라이언트 전송 전)

```typescript
// src/lib/chatSanitize.ts
// ponytail: markdown 렌더링이 필요 없으면 DOMPurify도 생략한다.
//   Phase 1은 평문 + 제한 링크만 지원. markdown 지원 추가 시 DOMPurify 도입.

const MAX_MESSAGE_LENGTH = 500;
const ALLOWED_URL_PROTOCOLS = ['https:', 'mailto:'] as const;

/** 클라이언트가 send-chat 계열 Edge Function 호출 전 반드시 통과 */
export function sanitizeChatInput(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  // (1) 길이 제한
  if (raw.length === 0) return { ok: false, reason: 'empty' };
  if (raw.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too_long' };

  // (2) 제어 문자 제거 (null byte, Bell 등)
  const text = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // (3) 프로토콜 화이트리스트 — javascript:, data:, vbscript: 차단
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const found = text.match(urlPattern) ?? [];
  for (const url of found) {
    try {
      const parsed = new URL(url);
      if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
        return { ok: false, reason: `blocked_protocol:${parsed.protocol}` };
      }
    } catch {
      return { ok: false, reason: 'invalid_url' };
    }
  }

  // (4) HTML 태그 감지 — <script>, <iframe>, <img onerror=> 등 차단
  //     Phase 1은 평문만 허용. markdown 허용 시 DOMPurify로 전환.
  if (/<\s*(script|iframe|object|embed|form|input|button|svg|math)/i.test(text)) {
    return { ok: false, reason: 'html_tag_blocked' };
  }

  return { ok: true, text };
}
```

**차단 프로토콜:**
| 프로토콜 | 차단 이유 |
|---|---|
| `javascript:` | XSS 스크립트 실행 |
| `data:` | data:text/html,<script> 인젝션 |
| `vbscript:` | IE 구형 벡터 (방어적 차단) |
| `file:` | 로컬 파일 접근 시도 |

#### 6.4.2 2단계 — 서버 검증 (Edge Function + service role INSERT)

```sql
-- 클라이언트 INSERT 정책은 만들지 않는다.
-- send-chat/send-viewer-chat Edge Function이 participant/role/room_id/sanitize/rate limit 검증 후 service role로 INSERT한다.
-- 필요 시 DB CHECK 제약으로 length(content) <= 500, HTML 태그 거부를 보조한다.
```

**서버 측 방어:**
- 클라이언트 직접 INSERT 정책 없음. 우회 시 RLS deny.
- Edge Function에서 sanitize를 재실행하고, slow mode/blocked_words/room_participants/role을 검증한다.
- rate limit: sender당 초당 5 메시지 초과 시 Edge Function에서 429 또는 drop.

#### 6.4.3 3단계 — 출력 sanitize (렌더 시)

```typescript
// ChatPanel, ChatOverlay 메시지 렌더 규칙

// ❌ 절대 금지
<div dangerouslySetInnerHTML={{ __html: message.text }} />

// ✅ 기본 — React가 자동 이스케이프
<div>{message.text}</div>

// ✅ 링크 렌더 시 (Phase 2 markdown 지원 후)
// React 자동 이스케이프 + href 프로토콜 재검증
function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  try {
    const parsed = new URL(href);
    if (!['https:', 'mailto:'].includes(parsed.protocol)) {
      return <span>{children}</span>;  // 링크 아닌 텍스트로 표시
    }
    return <a href={parsed.toString()} target="_blank" rel="noopener noreferrer">{children}</a>;
  } catch {
    return <span>{children}</span>;
  }
}
```

**렌더 규칙:**
- `dangerouslySetInnerHTML` 절대 사용 금지
- 링크는 `SafeLink` 컴포넌트 경유만 (프로토콜 재검증)
- `target="_blank"` 시 `rel="noopener noreferrer"` 필수 (역참조 공격 방지)
- 이모지·반응(`reaction_type`)은 화이트리스트 기반 렌더 (ChatOverlay.md 참조)

#### 6.4.4 구현 체크리스트

- [ ] `src/lib/chatSanitize.ts` 작성 — `sanitizeChatInput()` 함수
- [ ] ChatPanel 입력창 send 핸들러에 `sanitizeChatInput()` 적용 (UX용 1차 방어)
- [ ] `send-chat`/`send-viewer-chat` Edge Function에 길이·제어문자·HTML 태그 검사 추가
- [ ] ChatOverlay 메시지 렌더에 `dangerouslySetInnerHTML` 미사용 확인
- [ ] (Phase 2) DOMPurify 도입 시 markdown 렌더링 지원

#### 6.4.5 MUST NOT

- ❌ `dangerouslySetInnerHTML` 사용 (React 자동 이스케이프만)
- ❌ `javascript:`·`data:`·`vbscript:` 프로토콜 링크 허용
- ❌ 500자 초과 메시지 전송 (클라이언트 + RLS 이중 차단)
- ❌ 제어 문자(`\x00`-`\x1F`) 포함 메시지 저장
- ❌ `<script>`·`<iframe>` 등 HTML 태그 포함 메시지 저장 (Phase 1 평문만)
- ❌ `target="_blank"` 시 `rel="noopener noreferrer"` 생략

---

## 7. OBS 방송 송출 옵션 게이트 (P2, OBS-01·OBS-02·OBS-03)

OBS는 P0/MVP 필수 기능이 아니라 P2 방송 송출용 옵션이다. 구현 전까지 OBS 라우트·스토어·Realtime 구독을 스캐폴딩하지 않는다. 구현한다면 `obs_viewer_tokens` 테이블 기반 signed read token으로만 보호하며, `?obs=1` 또는 `?transparent=1` 같은 토큰 없는 레거시 진입은 영구 금지한다.

> **스키마**: `DATA-SCHEMA.md §1.17 obs_viewer_tokens` (token_hash, obs_mode, target_slot_index, expires_at, revoked_at)
> **계약서**: `contracts/OBSViewer.md` (OBS-01~03 3개 모드)

### 7.1 토큰 발급 정책

| 항목 | 값 | 비고 |
|---|---|---|
| 발급 권한 | 호스트만 (`rooms.host_id = current_app_user_id()`) | RLS host only |
| 토큰 형식 | `crypto.randomUUID() + secret` (256-bit) | 단기 signed read token |
| 저장 | `token_hash = SHA256(token)`만 DB 저장 | 평문 토큰은 발급 시 1회만 반환 |
| TTL | 4시간 (OBS 세션 길이) | `expires_at = now() + 4h` |
| 폐기 | 호스트 수동 (`revoked_at`) 또는 room 종료 시 자동 | `rooms.status='ended'` 확인 후 검증 거부 |
| 재사용 | 단일 room scope, 읽기 전용 | 쓰기 권한 없음, 다른 room 접근 불가 |

발급 전 고지:
- `create-obs-token`은 방 전체에 "방송/OBS 출력 활성화" system message와 visible badge를 먼저 남기고 `audit_logs(event_type='obs_token_created')`를 기록한다.
- 녹화 또는 외부 송출 가능성이 있는 room은 `record-consent`와 동일한 captured-subject 고지 문구를 표시한다.
- P2 승격 전까지 API는 release-blocked 상태이며, 구현 중에도 LiveKit token을 반환하지 않는다.

### 7.2 허용된 3개 OBS 모드

| 모드 | obs_mode 값 | URL 파라미터 | 용도 |
|---|---|---|---|
| OBS-01 투명 배경 | `transparent` | `?obs_token={token}&obs=transparent` | 알파 채널 투명 배경, 브라우저 소스 |
| OBS-02 크로마키 | `chromakey` | `?obs_token={token}&obs=chromakey` | 녹색 배경, 크로마키 합성용 |
| OBS-03 풀스크린 아바타 | `fullscreen` | `?obs_token={token}&obs=fullscreen&slot={i}` | 단일 아바타 확대, `target_slot_index` 지정 |

### 7.3 RLS 정책

```sql
-- 호스트만 토큰 발급·조회·폐기
CREATE POLICY "host_manage_obs_tokens" ON obs_viewer_tokens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = obs_viewer_tokens.room_id
        AND r.host_id = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      WHERE r.id = obs_viewer_tokens.room_id
        AND r.host_id = current_app_user_id()
    )
  );

-- 토큰 소지자는 Edge Function 경유로만 room 데이터 조회
-- (클라이언트가 직접 rooms/room_participants SELECT 불가, Edge Function이 service role로 대신 조회)
```

### 7.4 토큰 검증 플로우

```
[OBS Browser Source: ?obs_token={token}&obs=transparent]
   ↓
[OBSViewer 마운트]
   ↓
[Edge Function verify-obs-token]
   1. token_hash = SHA256(token) 계산
   2. obs_viewer_tokens 조회: token_hash 매칭 + expires_at > now() + revoked_at IS NULL
   3. 성공: room_id 확정, service role로 room 데이터 조회 → 클라이언트에 읽기 전용 데이터 반환
   4. last_used_at 갱신 (감사)
   5. 실패: 403 Forbidden, OBSViewer에 "토큰 만료 또는 무효" 표시
   ↓
[OBSViewer 렌더]
   - obs_mode에 따라 transparent/chromakey/fullscreen 렌더
   - LiveKit 연결 없음 (읽기 전용, DataChannel 구독 없음)
   - Supabase Realtime 구독: room_participants 상태만 (slot_index, character_role)
   - 자동 토큰 갱신 없음: 만료 전 경고만 표시하고, 호스트가 새 토큰을 수동 재발급
```

### 7.5 MUST NOT

- ❌ **obs_token 없이 OBS 라우트 접근 허용** — `?obs=1`만으로는 403 Forbidden
- ❌ **P0/MVP 작업에서 OBS 라우트·스토어·Realtime 구독 스캐폴딩** — P2 방송 송출 옵션으로만 구현
- ❌ **토큰 평문을 DB에 저장** — `token_hash = SHA256(token)`만 저장, 평문은 발급 시 1회만 반환
- ❌ **토큰에 쓰기 권한 부여** — OBS는 읽기 전용, room_participants·rooms 수정 불가
- ❌ **토큰을 여러 room에 재사용** — 단일 room_id scope, 다른 room 접근 시 403
- ❌ **TTL 4시간 초과 토큰 허용** — `expires_at > now()` 검증 필수
- ❌ **호스트가 아닌 사용자의 토큰 발급** — `rooms.host_id = current_app_user_id()` RLS 강제
- ❌ **OBSViewer에서 LiveKit 연결** — 읽기 전용, DataChannel 구독 없음, 아바타 렌더만

### 7.6 잔존 위험

- **토큰 탈취**: URL에 토큰이 포함되므로 OBS 로그·브라우저 히스토리에 남을 수 있음. HTTPS 강제 + 토큰 짧은 TTL(4h)로 완화.
- **OBS 세션 중 토큰 만료**: 4시간 초과 시 OBS 브라우저 소스에 에러 표시. 권한 연장을 피하기 위해 자동 갱신하지 않고, 호스트 수동 재발급만 허용한다.
- **room 종료 시 토큰 무효화**: 호스트는 `rooms.status='ended'`만 수행한다. `verify-obs-token`은 매 요청마다 room status를 재확인하고 ended면 403을 반환한다. hard DELETE/CASCADE는 retention worker만 수행.

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

## 11. 녹화/DUB 사용자 동의 + 보존기간 정책 (G-39·G-43)

> **목적**: 녹화(ROOM-13)·더빙(DUB-05) 시 모든 참가자의 사전 동의를 법적 증거(GDPR §5)와 함께 기록하고, 보존기간 만료 후 자동 삭제한다.
> **산출**: 본 섹션 + `DATA-SCHEMA.md §1.11·§1.12` consent_json 컬럼 + `state-machines/DubSession.md` consent 게이트
> **상태**: P0 (구현 착수 전 완료)

### 11.1 동의 프로토콜 — 2단계 (사전 + 사후)

#### 11.1.1 사전 동의 (pre-consent) — 녹화/더빙 시작 전

```
[호스트: 녹화 시작 버튼 클릭]
   ↓
[모든 활성 참가자에게 동의 요청 UI 표시]
   - "이 방은 녹화됩니다. 음성·영상이 저장될 수 있습니다."
   - [동의] / [거절] 버튼
   ↓
[각 참가자 동의 수집]
   - consented: true/false
   - consented_at: ISO 8601 timestamp
   - consent_type: 'pre'
   - ip_hash: SHA256(req.headers['x-forwarded-for'] + salt)  — GDPR §5 증거
   ↓
[consent_json.all_consented 검증]
   - false: 녹화 시작 차단, "모든 참가자 동의 필요" 토스트
   - true: status='recording' 전이 허용
```

#### 11.1.2 사후 확인 (post-consent) — 녹화/더빙 완료 후

```
[녹화 완료: status='processing' → 'ready']
   ↓
[모든 참가자에게 사후 확인 요청]
   - "녹화가 완료되었습니다. 저장된 영상을 확인하세요."
   - [저장 동의] / [삭제 요청] 버튼
   ↓
[삭제 요청 시]
   - 즉시 visibility='private_hold'로 전환하고 signed URL 발급 중단
   - 호스트와 운영자에게 알림: "참가자 X가 녹화 삭제를 요청했습니다"
   - 운영자 결정: 삭제 또는 비공개 evidence hold
   - evidence hold 시: 삭제 요청 사실을 consent_json에 기록하고 일반 사용자/호스트 재생 차단
   - 삭제 시: recordings 행 삭제 + R2 오브젝트 삭제
```

### 11.2 consent_json 구조 (recordings·dub_sessions 공통)

```typescript
type ConsentJson = {
  participants: {
    [user_id: string]: {
      consented: boolean;
      consented_at: string;  // ISO 8601
      consent_type: 'pre' | 'post';
      ip_hash: string;  // SHA256(ip + salt), GDPR §5 증거
      post_action?: 'keep' | 'request_delete';  // 사후 확인만
      captured_subjects?: Array<'voice' | 'avatar' | 'display_name' | 'chat_overlay' | 'reaction'>;
    };
  };
  all_consented: boolean;  // 모든 활성 참가자 동의 완료
};
```

**저장 위치:**
- `recordings.consent_json` — 녹화 동의 (ROOM-13)
- `dub_sessions.consent_json` — 더빙 동의 (DUB-05)

### 11.3 동의 전파 정책 (G-43)

```
recordings.consent_json ⇏ dub_sessions.consent_json  (자동 전파 없음)
```

- **독립성**: 녹화 동의와 더빙 동의는 별개 프로세스. 한쪽 동의가 다른쪽으로 자동 전파되지 않는다.
- **UX 힌트**: 같은 방에서 이미 녹화에 동의한 참가자는 더빙 동의 UI에서 "녹화에 이미 동의" 배지 표시 (UX only, 법적 효과 없음).
- **재동의**: 새로운 녹화/더빙 세션마다 별도 동의 필요. 이전 세션 동의는 자동 갱신되지 않는다.
- **참가자 퇴장**: 동의 후 퇴장한 참가자의 consent 기록은 유지 (철회하지 않는 한 유효).

### 11.4 보존기간 정책 (retention)

| 자산 | 기본 보존기간 | 연장 | 만료 처리 |
|---|---|---|---|
| recordings | 90일 (ended_at + 90) | 운영자 승인 시 1회 90일 연장 가능 | pg_cron daily 삭제 + R2 DELETE |
| dub_sessions | 90일 (completed_at + 90) | 운영자 승인 시 1회 90일 연장 가능 | pg_cron daily 삭제 + R2 DELETE |
| dub_tracks | dub_sessions과 동일 | — | 부모 삭제 시 CASCADE |
| dub_outputs | dub_sessions과 동일 | — | 부모 삭제 시 CASCADE |

**pg_cron 자동 삭제 (daily):**

```sql
-- 매일 00:00 KST 실행
DELETE FROM recordings 
WHERE retention_expires_at < now() 
  AND status IN ('ready', 'failed');
-- R2 오브젝트 삭제는 Edge Function 또는 Cloudflare Worker에서 트리거

DELETE FROM dub_sessions
WHERE retention_expires_at < now()
  AND status IN ('completed', 'failed');
-- CASCADE로 dub_tracks, dub_outputs 자동 삭제
```

**호스트 연장:**

```sql
UPDATE recordings rec
SET retention_expires_at = retention_expires_at + INTERVAL '90 days'
FROM rooms r
WHERE rec.id = ?
  AND rec.room_id = r.id
  AND r.host_id = current_app_user_id()  -- 호스트만 연장 가능
  AND rec.retention_expires_at < now() + INTERVAL '10 days';  -- 만료 10일 내에만 연장 허용
```

### 11.5 동의 철회 메커니즘

참가자는 보존기간 내 언제든 동의를 철회할 수 있다:

```
[참가자: 내 녹화 목록에서 철회 요청]
   ↓
[recordings.consent_json.participants[user_id].consented = false]
[recordings.consent_json.participants[user_id].post_action = 'request_delete']
   ↓
[recordings.visibility = 'private_hold' 또는 dub_sessions.status='hold']
[signed URL 발급 중단 + 일반 room/member 갤러리에서 숨김]
[호스트와 운영자에게 알림: "참가자 X가 녹화 삭제를 요청했습니다"]
   ↓
[운영자 결정]:
   - 삭제: recordings 행 삭제 + R2 오브젝트 삭제
   - 비공개 evidence hold: 철회 사실 기록, admin/evidence view에서만 접근
   ↓
[30일 유예]: 호스트 미응답 시 30일 후 자동 삭제
```

### 11.6 구현 체크리스트

- [ ] `recordings` 테이블에 `consent_json JSONB`·`retention_expires_at TIMESTAMPTZ` 컬럼 추가
- [ ] `dub_sessions` 테이블에 `consent_json JSONB`·`retention_expires_at TIMESTAMPTZ` 컬럼 추가
- [ ] 동의 수집 Edge Function `record-consent` 작성: `{ room_id, recording_id?, dub_session_id?, user_id, consented, ip_hash }`
- [ ] 동의 수집 UI: 각 참가자 [동의]·[거절] 버튼, 호스트 진행 상황 모니터링
- [ ] 녹화 시작 게이트: `consent_json.all_consented = true` 검증 (recordings)
- [ ] 더빙 시작 게이트: `consent_json.all_consented = true` 검증 (dub_sessions, DubSession.md READY→RECORDING)
- [ ] 사후 확인 UI: 녹화 완료 후 [저장 동의]·[삭제 요청] 버튼
- [ ] pg_cron job: daily retention_expires_at 만료 행 삭제 + R2 오브젝트 삭제
- [ ] 호스트 연장 API: retention_expires_at + 90일 (만료 10일 내 1회)
- [ ] 동의 철회 API: consented = false, post_action = 'request_delete', visibility='private_hold', signed URL 차단, 호스트+운영자 알림
- [ ] 30일 유예 자동 삭제: 호스트 미응답 시 pg_cron이 삭제

### 11.7 MUST NOT

- ❌ 동의 없이 녹화/더빙 시작 (`all_consented = true` 게이트 필수)
- ❌ `consent_json` 없이 recordings/dub_sessions 행 생성 (NULL 허용하되 녹화 시작 전에는 게이트 통과 불가)
- ❌ 보존기간 무제한 (`retention_expires_at` 필수, 90일 기본)
- ❌ 동의 기록 없이 R2 오브젝트 보존 (GDPR §5 위반)
- ❌ 호스트 연장 무제한 (1회 90일만, 만료 10일 내에만)
- ❌ 동의 철회 요청 무시 (30일 유예 후 자동 삭제)
- ❌ 동의 철회 후 호스트/room member가 계속 재생 가능한 상태 유지
- ❌ ip_hash 없이 동의 기록 (법적 증거 부재)

### 11.8 잔존 위험

- **동의 UI 미구현 시**: 녹화/더빙 기능 자체를 출시하면 안 됨 (법적 리스크)
- **YouTube 소스(DUB-01b)**: ToS 위반 가능성, 법무 검토 전 출시 금지 (SCOUT.md 참조)
- **미성년자 동의**: 보호자 동의 프로세스 전까지 `age_band='14_17'` 사용자는 녹화/DUB/public room/OBS 송출 대상에서 제외한다.
- **국가별 데이터 보존법**: 90일은 한국 기준, EU/일본 진출 시 현지법 재검토 필요

---

## 12. 크레딧 동시성·격리 레벨·할당량 (G-40·G-41·G-42)

> **목적**: 크레딧 트랜잭션의 Phantom Read·동시성 문제·월별 할당량 경계를 정의한다.
> **산출**: 본 섹션 + `DATA-SCHEMA.md §1.8·§1.9·§1.10` (Vgen.md 크레딧 차감 원자성 규칙과 연동)
> **상태**: P0 (VGEN-02 구현 전 완료)

### 12.1 트랜잭션 격리 레벨 (G-42)

PostgreSQL 기본 격리 레벨은 READ COMMITTED. 크레딧 차감 시 Phantom Read를 방지하기 위해 **SERIALIZABLE** 또는 **SELECT FOR UPDATE**를 사용한다.

```sql
-- 크레딧 차감 트랜잭션 (Edge Function 내부)
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;  -- 기본값, 명시적 선언

BEGIN;
  -- 비관적 잠금: 다른 트랜잭션이 같은 행을 동시에 수정하지 못하게 함
  SELECT balance FROM credits WHERE user_id = ? FOR UPDATE;
  -- 이 시점에서 다른 트랜잭션은 같은 user_id의 credits 행에 대해 대기
  
  IF balance >= cost THEN
    UPDATE credits SET balance = balance - cost, updated_at = now() WHERE user_id = ?;
    INSERT INTO credit_transactions (user_id, amount, reason, ref_id) VALUES (?, -cost, 'vgen_job', ?);
  ELSE
    ROLLBACK;
    RETURN 402;
  END IF;
COMMIT;
```

**격리 레벨 선택 규칙:**

| 작업 | 격리 레벨 | 이유 |
|---|---|---|
| 크레딧 차감 | READ COMMITTED + `FOR UPDATE` | 비관적 잠금으로 충분, SERIALIZABLE은 오버헤드 |
| 크레딧 잔액 조회 | READ COMMITTED | 실시간 잔액 표시, 정확성 < 응답 속도 |
| 월별 할당량 계산 | REPEATABLE READ | 월 시작/끝 경계에서 일관성 필요 |
| credit_transactions 로그 | READ COMMITTED | append-only, 충돌 없음 |

> **SERIALIZABLE 사용 안 함**: 크레딧 차감은 `FOR UPDATE`로 충분히 보호됨. SERIALIZABLE은 데드락·재시도 오버헤드가 크고, 단일 행 업데이트에는 과대설계.

### 12.2 동시성 제어 (G-41)

동시 크레딧 차감 요청 처리:

```
[참가자 A·B 동시 VGEN 생성 요청]
   ↓
1. Edge Function이 두 요청을 동시 수신
2. 참가자 A: SELECT balance FOR UPDATE → balance=100, cost=40 → UPDATE balance=60
3. 참가자 B: SELECT balance FOR UPDATE → A의 COMMIT 대기 → balance=60 → 60>=40 → UPDATE balance=20
4. 결과: A=60, B=20, 총 80 차감 (정확)
```

**idempotency_key와 연동** (Vgen.md C3):
- 10초 버킷 내 동일 요청은 `idempotency_key UNIQUE` 충돌로 1회만 처리
- `FOR UPDATE` 잠금 + `idempotency_key` 이중 방어

**크레딧 환불 동시성:**
- 환불도 동일한 `FOR UPDATE` 패턴 사용
- `credit_refunded_at IS NOT NULL` 검증으로 이중 환불 방지
- 환불 시 `credit_transactions INSERT (reason='refund')` 같은 트랜잭션

### 12.3 월별 할당량 경계 (G-40) + UTC 타임존 통일 (G-82)

```
월별 무료 크레딧 할당: 매월 1일 00:00 KST → 100 credits (= 15:00 UTC 전날)
경계 조건:
  - 월 중간 가입자: 가입일 기준 일할 계산 (예: 15일 가입 → 50 credits)
  - 월 말 진행 중인 job: 다음 달 할당량에서 차감 (월경계 job)
  - 미사용 크레딧 이월: P2에서 설계 (P1은 매월 초기화)
```

**pg_cron 월별 할당 (UTC 타임존, G-82):**

```sql
-- 매월 1일 15:00 UTC 실행 (= 매월 1일 00:00 KST)
UPDATE credits 
SET balance = balance + 100,  -- 무료 100 credits 추가
    total_earned = total_earned + 100,
    updated_at = now()
WHERE user_id IN (
  SELECT id FROM users 
  WHERE status = 'active' 
    AND created_at < now() - INTERVAL '1 day'  -- 가입 후 24시간 경과
);

-- 일할 계산 (월 중간 가입자)
UPDATE credits
SET balance = balance + ROUND(100 * EXTRACT(day FROM age(now(), created_at)) / 30.0),
    total_earned = total_earned + ROUND(100 * EXTRACT(day FROM age(now(), created_at)) / 30.0)
WHERE user_id IN (
  SELECT id FROM users
  WHERE created_at >= date_trunc('month', now() - INTERVAL '1 month')
    AND created_at < date_trunc('month', now())
);
```

**모든 pg_cron 스케줄 UTC 통일 원칙 (G-82):**
- 모든 스케줄은 UTC 기준으로 작성
- KST 시간으로 변환: KST = UTC + 9
- 예시: 
  - `0 15 * * *` = 매일 15:00 UTC = 매일 00:00 KST
  - `0 4 * * *` = 매일 04:00 UTC = 매일 13:00 KST
  - `0 15 1 * *` = 매월 1일 15:00 UTC = 매월 1일 00:00 KST

### 12.4 구현 체크리스트

- [ ] 크레딧 차감 Edge Function에 `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` 명시
- [ ] `SELECT balance FOR UPDATE` 비관적 잠금 적용
- [ ] `idempotency_key` UNIQUE 제약으로 이중 차감 방지 (Vgen.md C3와 연동)
- [ ] 크레딧 환불 시 `credit_refunded_at IS NOT NULL` 이중 환불 방지
- [ ] pg_cron 월별 할당 job: 매월 1일 00:00 KST
- [ ] 일할 계산 로직: 월 중간 가입자

### 12.5 MUST NOT

- ❌ 크레딧 차감 시 `FOR UPDATE` 없이 `SELECT` (Phantom Read로 이중 차감 위험)
- ❌ SERIALIZABLE 격리 레벨 사용 (단일 행 업데이트에 과대설계, 데드락 위험)
- ❌ `credit_refunded_at` 검증 없이 환불 (이중 환불 위험)
- ❌ 월별 할당량 없이 무제한 크레딧 (남용 방지)

---

## 13. 입장·방 생성·초대코드 rate limit (HIGH 핵심)

> **목적**: `verify-invite-code`, `create-room`, `livekit-token` Edge Function에 rate limit을 적용해 초대코드 brute-force, 방 생성 스팸, 토큰 발급 폭주를 막는다.
> **연동**: `LobbyPage.md §초대링크 수락` + `SecurityPolicies §0 SEC-P0-04`

### 13.1 Rate limit 정책

| 경로 | 제한 대상 | 제한 | 비고 |
|---|---|---|
| `verify-invite-code` | IP + invite_code hash prefix | 분당 5회 | brute-force 방어. 5회 초과 시 429 |
| `create-room` | user_id + IP | 시간당 10회 | 방 생성 스팸 방어 |
| `livekit-token` / refresh | user_id + room_id + IP | 분당 30회 | reconnect 폭주 방어. 정상 reconnect 여유 포함 |
| 저장 | Supabase `rate_limits` 테이블 또는 Redis/KV | 슬라이딩 윈도우 | Local dev만 in-memory Map 허용. Preview/Prod는 공유 저장소 없으면 release blocker |

### 13.2 구현

```typescript
// supabase/functions/verify-invite-code/index.ts
// rate limit 미들웨어 (Edge Function 공통)

const RATE_LIMIT_WINDOW_MS = 60 * 1000;  // 1분
const RATE_LIMIT_MAX_ATTEMPTS = 5;

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  // Preview/Prod: Supabase rate_limits 테이블 또는 Redis/KV shared store 필수.
  // ponytail: local dev smoke에서만 in-memory Map fallback 허용.
  const key = `invite:${ip}`;
  const now = Date.now();
  const attempts = rateLimitMap.get(key) ?? [];
  const recent = attempts.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  
  if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }
  
  recent.push(now);
  rateLimitMap.set(key, recent);
  return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - recent.length };
}

Deno.serve(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { allowed, remaining } = await checkRateLimit(ip);
  
  if (!allowed) {
    return new Response(JSON.stringify({ 
      error: "Too many attempts. Try again in 1 minute." 
    }), { 
      status: 429,
      headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" }
    });
  }
  
  // ... 기존 verify-invite-code 로직 ...
});
```

### 13.3 MUST NOT

- ❌ rate limit 없이 초대코드 검증 (brute-force 공격 허용)
- ❌ Preview/Prod에서 in-memory Map rate limit 사용 (다중 인스턴스 우회)
- ❌ `x-forwarded-for` 검증 없이 IP 신뢰 (프록시 헤더 변조 주의)
- ❌ 차단 시 에러 메시지에 남은 시도 횟수 노출 (공격자에게 정보 제공)

---

## 14. 차단 사용자 방 입장 게이트 (SEC-04·G-84)

> **목적**: 사용자 간 차단(block) 관계를 실시간으로 검증해, 차단 관계가 있으면 같은 방에 입장할 수 없도록 원천 차단한다.
> **구현**: `livekit-token` Edge Function에서 token 발급 시 검증
> **산출**: `DATA-SCHEMA.md §1.18 user_blocks`, `livekit-edge-fn.md §4`

### 14.1 정책 규칙

| 시나리오 | 동작 | 상태 코드 |
|---------|------|------|
| A가 B를 차단한 상태에서 B가 방에 있는데 A가 입장 시도 | A 입장 거부 | 403 |
| A가 B를 차단한 상태에서 A가 방에 있는데 B가 입장 시도 | B 입장 거부 | 403 |
| A·B 둘 다 방에 있는데 A가 B를 차단 | 즉시 local mute/unsubscribe + chat collapse + stage invite 차단. 새 LiveKit token 발급 거부 | 200 |

### 14.2 구현 위치 및 데이터 접근

**Edge Function `livekit-token` (방 토큰 발급 시점):**
```
1. 요청자 user_id 확인
2. 방에 현재 활성 참가자 목록 조회:
   SELECT user_id FROM room_participants
   WHERE room_id = {roomId} AND state != 'left'
   
3. 차단 관계 존재 확인:
   SELECT id FROM user_blocks
   WHERE (
     (blocker_user_id = {요청자} AND blocked_user_id IN {활성참가자들})
     OR
     (blocked_user_id = {요청자} AND blocker_user_id IN {활성참가자들})
   )
   LIMIT 1
   
4. 차단 관계 1건 이상 있으면:
   → HTTP 403 "차단 관계로 인해 입장할 수 없습니다"
   (구체적인 누가 누구를 차단했는지 노출하지 않음)
```

### 14.3 RLS 보호

`user_blocks` 테이블:
```sql
-- 본인의 차단 기록만 읽기/쓰기
CREATE POLICY "user_blocks_own" ON user_blocks FOR ALL
  USING (blocker_user_id = current_app_user_id())
  WITH CHECK (blocker_user_id = current_app_user_id());

-- 피차단자는 자신이 차단당했다는 사실을 알 수 없음
-- (방 입장 실패로만 간접 확인 가능)
```

### 14.4 클라이언트 측 안내

- 방 입장 실패 시 에러 메시지: **"이 방에 참가할 수 없습니다. 자세한 내용은 호스트에 문의하세요."**
- 차단한 사용자 목록을 클라이언트에서 로컬 필터하지 않는다 (서버 게이트가 primary)
- 로비에서 차단한 사용자의 방은 여전히 보이지만, 입장 시점에 차단된다
- 현재 세션에서 차단하면 클라이언트는 즉시 상대 오디오 구독 해제, 채팅 접힘, 무대 초대/손들기 상호작용 숨김을 수행한다. 서버는 다음 `refresh-livekit-token`부터 양방향 차단 관계를 403으로 닫는다.

### 14.5 MUST NOT

- ❌ 차단 관계를 클라이언트 localStorage-only로 관리

---

## 15. 스토리지 쿼터 정책 (G-83)

> **목적**: 사용자당 R2/Supabase 스토리지 한도(기본 10GB)를 설정하고, 초과 시 경고·차단하여 스토리지 비용 폭발을 방지한다.
> **산출**: `DATA-SCHEMA.md §1.11.1 user_storage_quota` + 본 섹션
> **상태**: P1 (구현 순서)

### 15.1 기본 한도

- **기본 쿼터**: 사용자당 10 GiB (10,737,418,240 bytes)
- **포함 자산**: 
  - `vgen_jobs.result_url` 파일 크기 (`result_object_key` 대상)
  - `recordings.file_size_bytes` (저장된 영상)
  - `dub_outputs` 합성 영상 (cascade로 recording 일부 포함 시 중복 계산 주의)

### 15.2 경고 + 차단 게이트

| 상태 | 사용량 | 동작 | 메시지 |
|---|---|---|---|
| 정상 | <80% | 없음 | — |
| 경고 | 80~100% | 설정 페이지 배너 표시 | "저장 공간이 80% 찼습니다. 오래된 영상을 삭제하세요." |
| 차단 | 100% | VGEN 생성 요청 거부 + 녹화 시작 거부 | "저장 공간이 가득 찼습니다. 영상을 삭제한 후 다시 시도하세요." |

**구현 위치:**

```typescript
// Edge Function: trigger-vgen, start-recording 시점
const { data: quota } = await supabase
  .from('user_storage_quota')
  .select('used_bytes, limit_bytes')
  .eq('user_id', userId)
  .single();

const percentUsed = (quota.used_bytes / quota.limit_bytes) * 100;

if (percentUsed >= 100) {
  return new Response(JSON.stringify({
    error: "Storage quota exceeded"
  }), { status: 402 });  // Payment Required (쿼터 의미)
}
```

### 15.3 정리 정책

#### 15.3.1 사용자 주도 삭제

```
사용자가 recordings/vgen_jobs 삭제 버튼 클릭
  ↓
Edge Function: DELETE recording/vgen_job → R2 오브젝트 삭제
  ↓
자동 트리거: user_storage_quota.used_bytes 차감
  ↓
UI 반영: 경고 배너 사라짐 (또는 퍼센트 갱신)
```

#### 15.3.2 pg_cron 일일 정리

```sql
-- 매일 04:00 UTC (= 매일 13:00 KST) 실행
-- 고아 R2 오브젝트 정리 후 used_bytes 재집계

-- 1단계: 고아 객체 찾기 (DB에 기록 없는 R2 오브젝트)
-- R2 LIST → 각 object_key를 recordings/vgen_jobs에서 SELECT
-- → 없으면 R2 DELETE (Cloudflare Worker 또는 Edge Function)

-- 2단계: used_bytes 재집계
UPDATE user_storage_quota
SET used_bytes = (
  SELECT COALESCE(SUM(file_size_bytes), 0)
  FROM (
    SELECT file_size_bytes FROM recordings WHERE user_id = user_storage_quota.user_id
    UNION ALL
    SELECT file_size_bytes FROM vgen_jobs WHERE triggered_by = user_storage_quota.user_id
      AND result_object_key IS NOT NULL
  ) AS all_files
),
    updated_at = now()
WHERE user_id IN (SELECT id FROM users);
```

### 15.4 쿼터 업그레이드 (미래)

| 시나리오 | 한도 | 조건 |
|---|---|---|
| 기본 무료 | 10 GB | 모든 사용자 |
| Stripe 구독 (P2) | 100 GB | 월 $5 구독 |
| 크리에이터 티어 (P3) | 1 TB | 월 평균 10개 공연 + 운영팀 수동 승인 |

### 15.5 구현 체크리스트

- [ ] `user_storage_quota` 테이블 생성 (user_id·used_bytes·limit_bytes·updated_at)
- [ ] `vgen_jobs`·`recordings` 테이블에 `file_size_bytes` 컬럼 추가 (nullable, R2 업로드 후 갱신)
- [ ] Edge Function `trigger-vgen`에 쿼터 차단 게이트 추가 (402 반환)
- [ ] Edge Function `start-recording`에 쿼터 차단 게이트 추가 (402 반환)
- [ ] SettingsPage에 "저장공간" 탭 추가 (쿼터 시각화: 프로그레스 바 + GB 표시)
- [ ] 쿼터 경고 배너 (80% 초과 시 LobbyPage/RoomView 상단)
- [ ] pg_cron job: 매일 04:00 UTC 고아 객체 정리 + used_bytes 재집계
- [ ] RLS: `user_storage_quota` SELECT는 본인만, UPDATE는 service_role만
- [ ] 테스트: 10GB 도달 시 VGEN 거부, 삭제 후 다시 활성화 확인

### 15.6 MUST NOT

- ❌ 쿼터 체크 없이 VGEN/녹화 시작 (비용 폭발)
- ❌ `file_size_bytes` 없이 used_bytes 추정 계산 (부정확)
- ❌ 삭제 시 used_bytes 미차감 (쿼터 해제 안 됨)
- ❌ pg_cron 없이 고아 객체 방치 (비용 낭비)
- ❌ 클라이언트에서 쿼터 검증만 하고 서버 게이트 없음
- ❌ 차단 조회를 public 테이블로 노출 (RLS 필수)
- ❌ 에러 메시지에 "XX님이 차단했습니다" 같은 구체적 정보 노출
- ❌ 차단 후 즉시 강제 퇴장 (현재 세션은 유지, 다음 재입장 시 차단)

---

## 16. 신고·차단·메시지 숨김·감사 로그 (SEC-04·INF-07)

> **목적**: 라이브 커뮤니티에서 사용자 신고, 개인 차단, 채팅 숨김, 운영자 조치를 UI-only 기능으로 만들지 않고 DB/RLS/audit 경계로 강제한다.
> **산출**: `DATA-SCHEMA.md §1.18~1.20`, `messages.status`, `audit_logs`, `moderation_reports`, `user_blocks`.

### 16.1 사용자 신고

```
[사용자: 신고 클릭]
  → Edge Function create-report
  → moderation_reports INSERT(status='pending')
  → audit_logs INSERT(event_type='report_created')
  → 운영자/관리자 review queue 노출
```

- 신고 대상은 `reported_user_id`, `message_id`, `room_id` 중 하나 이상을 포함해야 한다.
- 신고자는 본인 신고 목록만 읽는다. 운영자는 전체 보고서를 읽고 `status`를 변경한다.
- 신고 생성은 rate limit 대상이다: `reporter_user_id + room_id` 기준 분당 3회, 시간당 20회.

### 16.2 개인 차단

- `user_blocks`는 개인 경험 필터다. DB 증거 삭제가 아니라 클라이언트 표시 숨김/접기만 한다.
- ChatPanel, MobileViewer, Participant list는 차단한 사용자의 메시지를 기본 접힘 처리한다.
- 차단은 moderation report를 자동 생성하지 않는다. 사용자가 신고를 눌렀을 때만 report를 만든다.

### 16.3 메시지 숨김 / tombstone

- `messages`는 hard delete 금지. author/host/moderator 액션은 Edge Function으로 `status='tombstone'|'hidden'`, `hidden_reason`, `hidden_by`, `hidden_at`만 갱신한다.
- UI는 tombstone을 "삭제된 메시지입니다"로 표시하고 원문을 숨긴다.
- 운영자 action은 `audit_logs.event_type='message_hidden'`를 반드시 남긴다.

### 16.4 감사 로그 release gate

- Preview/Prod에서 아래 이벤트는 `audit_logs` 또는 외부 audit sink에 반드시 기록한다:
  - token issued / refreshed / revoked
  - participant kicked / disabled / host transferred
  - report created / actioned / dismissed
  - message hidden / tombstoned
  - consent changed / withdrawal requested
  - credit deducted / refunded
- Local dev만 console fallback을 허용한다. Preview/Prod에서 audit sink가 없으면 릴리스 차단이다.

### 16.5 MUST NOT

- ❌ 신고/차단을 localStorage-only 기능으로 구현
- ❌ 메시지를 hard delete해서 운영 증거를 제거
- ❌ 차단한 사용자 메시지를 DB에서 삭제
- ❌ 운영자 조치 후 audit_logs 누락
- ❌ 신고 대상 사용자에게 reporter_user_id 노출

---

## 17. Error Logging PII 필터링 정책 + 로그 보존 기간 (G-125)

> **목적**: Sentry/audit_logs/console에서 개인정보(PII)가 유출되는 것을 방지하고, GDPR·개인정보보호법 "저장 제한" 원칙을 준수하며, 감시 도구로 강제할 수 없는 console.log는 코드 리뷰 규칙으로 명시한다.
> **산출**: 본 섹션 + `src/lib/sentryConfig.ts` + 백엔드 로깅 정책
> **상태**: P1 (데이터베이스 마이그레이션과 동시)

### 17.1 PII 정의

이 애플리케이션에서 **PII(Personally Identifiable Information)**로 간주하는 데이터:

| 항목 | 예시 | 상태 | 로깅 금지 대상 |
|---|---|---|---|
| 이메일 주소 | `user@example.com` | 민감함 | Sentry, console.log |
| display_name | "김철수", "Jason" | 민감함 | Sentry body (metadata OK) |
| IP 주소 | `203.0.113.45` | 민감함 | Sentry, 감사로그 (x-forwarded-for) |
| user_id (외부 공개 시) | UUID가 URL/메시지에 노출 | 중간 | Sentry 필터링 권장 |
| 채팅 메시지 내용 | "Hello, 너는 누구야?" | 민감함 | console.log, Sentry body |
| Blendshape 스트림 | `[0.5, 0.3, 0.1, ...]` | 중간 | Sentry (facial_data payload) |
| room_id + timestamp 조합 | `room-abc + 14:32:15` | 중간 | 시계열 분석 위험 |
| 음성 데이터 | WAV/WebM 바이너리 | 민감함 | 저장 금지 (§11 동의 별도) |
| 더빙/영상 URL | `https://r2.../dub-output-abc.mp4` | 중간 | 로그 저장 시 만료 시간 표시만 |

### 17.2 Sentry 필터링 규칙

**핵심**: `beforeSend` 훅에서 아래 데이터를 반드시 제거하거나 마스킹한다.

```typescript
// src/lib/sentryConfig.ts
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    new Sentry.Replay({
      maskAllText: true,  // 화면 기록에서 모든 텍스트 마스킹
      blockAllMedia: true, // 미디어 콘텐츠 차단
    }),
  ],
  beforeSend(event, hint) {
    // 1단계: 에러 메시지에서 이메일·display_name·IP 제거
    if (event.message) {
      event.message = event.message
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
        .replace(/(\d{1,3}\.){3}\d{1,3}/g, "[IP]")
        .replace(/user_id:\s*[\w-]+/gi, "user_id:[REDACTED]");
    }

    // 2단계: 스택 트레이스는 유지 (파일명·라인번호·함수명만)
    // 단, 로컬 변수나 인자는 제거
    if (event.exception) {
      event.exception.values?.forEach((exception) => {
        exception.stacktrace?.frames?.forEach((frame) => {
          // frame.vars, frame.pre_context, frame.post_context 제거
          delete frame.vars;
          delete frame.pre_context;
          delete frame.post_context;
        });
      });
    }

    // 3단계: breadcrumb에서 PII 제거
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((bc) => {
        if (bc.data) {
          // message.content (채팅) 제거
          delete bc.data.message_content;
          delete bc.data.content;
          delete bc.data.display_name;
          delete bc.data.email;
          // blendshape_payload 제거
          delete bc.data.blendshape_payload;
        }
        return bc;
      });
    }

    // 4단계: 요청 본문(Request context)에서 민감 정보 제거
    if (event.request) {
      delete event.request.headers?.["authorization"];
      delete event.request.headers?.["x-forwarded-for"];
      delete event.request.data;  // POST body
    }

    // 5단계: 기타 context에서 민감 정보 제거
    if (event.contexts) {
      if (event.contexts.user) {
        event.contexts.user = {
          id: event.contexts.user.id,  // ✅ user_id만 유지 (식별용)
          // email, username, ip_address 제거
        };
      }
      delete event.contexts.room;  // room_id + timestamp 조합 제거
    }

    // 허용 데이터: 에러 코드, 컴포넌트 이름, HTTP 상태, 파일명·라인번호
    return event;
  },
});
```

**Sentry에서 허용되는 데이터:**
- ✅ 에러 스택 트레이스 (파일명, 라인번호, 함수명)
- ✅ 에러 코드 (`ERR_QUOTA_EXCEEDED`, `ERR_LIVEKIT_TOKEN`)
- ✅ 컴포넌트 이름 (`RoomView`, `ChatPanel`)
- ✅ HTTP 상태 코드 (403, 402, 5xx)
- ✅ 타임스탬프 (언제 발생했는지, 어떤 시간대 가능한지는 아님)

**Sentry에서 차단되는 데이터:**
- ❌ 이메일, 전화번호, 주민번호, 신용카드
- ❌ display_name, 채팅 메시지 원문
- ❌ IP 주소, 기기 식별자
- ❌ Blendshape 수치 배열
- ❌ 녹화/더빙 파일 URL (원본, 만료 시간 필수)

### 17.3 로그 보존 기간

| 저장소 | 데이터 타입 | 기본 보존 | 자동 삭제 | 비고 |
|---|---|---|---|---|
| **audit_logs DB** | 토큰 발급/철회, 권한 변경, 신고, 메시지 숨김 | 90일 | pg_cron daily | `created_at < now() - INTERVAL '90 days'` → DELETE |
| **Sentry 이벤트** | 에러 로그 (필터링됨) | 90일 | Sentry 자동 | Sentry 대시보드 설정: Retention = 90 days |
| **console.log** | 디버그 메시지 | 개발 환경만 | 브라우저 종료 | **프로덕션에서 PII console.log 금지** (코드 리뷰 필수) |
| **R2/Storage 파일** | 녹화, VGEN 결과물, dub_outputs | 90일 (§11) | pg_cron + Cloudflare Worker | §15 스토리지 쿼터와 독립적, 콘텐츠 보존 = 90일 기준 |

**pg_cron 자동 삭제 (audit_logs):**

```sql
-- 매일 03:00 UTC (= 매일 12:00 KST) 실행
DELETE FROM audit_logs
WHERE created_at < now() - INTERVAL '90 days'
  AND status NOT IN ('flagged_for_investigation');  -- 조사 대상은 수동 보관
```

### 17.4 console.log 금지 패턴

#### 금지 예시 (프로덕션에서 제거해야 함)

```typescript
// ❌ 금지: 이메일 로깅
console.log("User logged in:", user.email);  // "User logged in: alice@example.com"

// ❌ 금지: 채팅 내용 로깅
console.log("Chat message:", message.content);  // "Chat message: 너 나한테 이상한 거 했잖아"

// ❌ 금지: 개인 정보 객체 전체
console.log("Room participant:", participant);  // { user_id, display_name, email, ip_hash, ... }

// ❌ 금지: Blendshape 스트림 직렬화
console.log("Blendshape data:", blendshapes);  // [0.5, 0.3, 0.1, 0.0, ...]

// ❌ 금지: room_id + timestamp 조합 (시계열 분석 위험)
console.log(`Event at ${new Date().toISOString()} in room ${roomId}`);
```

#### 허용 예시

```typescript
// ✅ 허용: 에러 코드만 로깅
console.error("Failed to generate video:", "ERR_MODERATION_REJECTED");

// ✅ 허용: 사용자 구분은 ID만, 마스킹
console.log("User action completed, user_id:", userId?.slice(0, 8) + "...");

// ✅ 허용: 컴포넌트·함수명 + 상태
console.log("[ChatPanel] Message send initiated, status:", messageStatus);

// ✅ 허용: 일반 카운트/지표 (개인화 없음)
console.log("Active participants count:", roomParticipants.length);

// ✅ 허용: 에러 메타데이터 (PII 제거)
console.error("Sentry event created", {
  event_type: "token_revoked",
  error_code: "ERR_DISABLED_BY_HOST",
  timestamp: new Date().toISOString(),
});
```

#### 개발 환경에서만 허용

```typescript
// ✅ 개발 전용: isDev 가드
if (isDev) {
  console.debug("Full user object for debugging:", user);
}

// ✅ 개발 전용: localStorage only fallback (§8.5.3 audit_logs 대체)
if (!import.meta.env.PROD) {
  // Local dev audit sink — Preview/Prod는 audit_logs INSERT 필수
  localStorage.setItem(`audit_${Date.now()}`, JSON.stringify(event));
}
```

### 17.5 MUST NOT

- ❌ Sentry의 `beforeSend` 필터 없이 에러 전송 (모든 요청/응답 노출)
- ❌ console.log에 PII 직렬화 (프로덕션 빌드에서도 소스맵으로 복원 가능)
- ❌ audit_logs를 무제한 저장 (90일 보존 원칙 위반, 저장 제한 원칙)
- ❌ Sentry 이벤트 보존 기간 설정 없이 자동 삭제 의존 (명시적 90일 정책 필수)
- ❌ R2 파일 URL을 audit_logs에 평문 저장 (만료 시간 표시 필수)
- ❌ console.fallback(§8.5.3 audit sink)을 프로덕션에서 그대로 사용 (외부 audit sink 필수)

---

## 18. 신고 접수→처리 피드백 루프 (G-93)

### 18.1 신고 접수 확인 (즉시)

신고 제출 시 즉각 사용자 피드백:

```
[사용자: 신고 클릭]
  → Edge Function create-report
  → moderation_reports INSERT(status='pending')
  → audit_logs INSERT(event_type='report_created')
  ↓
토스트 알림 (즉시, 1초 이내):
"신고가 접수되었습니다. 처리 상태를 이메일로 알려드립니다."
↓
신고 ID 발급: reports.id (추적 기준)
↓
Edge Function send-report-receipt:
사용자에게 이메일 발송
  Subject: "[ChatterBox] 신고 접수 확인"
  Body: 신고ID·접수 일시·처리 절차 안내
```

### 18.2 처리 상태 구분

| 상태 | 설명 | 사용자 통보 | 기한 |
|------|------|-----------|------|
| `pending` | 접수 완료, 검토 대기 중 | 접수 확인 이메일 | — |
| `reviewing` | 관리자 검토 진행 중 | 변경 없음 (내부 상태) | — |
| `resolved_action` | 조치 완료 (경고·정지·차단) | "신고하신 내용에 따라 조치가 완료되었습니다." | 24h (성인), 72h (스팸) |
| `resolved_noaction` | 검토 후 조치 없음 | "신고를 검토했으나 가이드라인 위반이 확인되지 않았습니다." | 7영업일 |
| `resolved_appeal` | 피신고자 이의 인용 | "피신고자의 이의가 인용되어 조치가 취소되었습니다." | — |

### 18.3 신고 유형별 SLA (처리 기한)

| 신고 유형 | 우선 | 목표 기한 | 조치 |
|---------|------|---------|------|
| 성인 콘텐츠·폭력 | P1 | 24시간 | 경고·일시정지·차단 |
| 스팸·사칭 | P2 | 72시간 | 경고·일시정지 |
| 저작권 침해 | P2 | 5영업일 | 콘텐츠 삭제 |
| 기타 (민원·불편) | P3 | 7영업일 | 적절한 조치 |

### 18.4 피신고자 통보 (조치 시)

**경고 조치**:
```
이메일 발송 (피신고자)
Subject: "[ChatterBox] 커뮤니티 가이드라인 경고"
Body:
  - 경고 사유 (신고 내용 요약)
  - "다음 위반 시 계정 정지될 수 있습니다"
  - 이의제기 링크 (7일 이내)
```

**정지 조치**:
```
이메일 + 인앱 배너 (피신고자)
Subject: "[ChatterBox] 계정 일시정지"
Body:
  - 정지 기간 (예: "3일")
  - 정지 사유
  - "이의를 제기하려면..." 링크
  
인앱 배너 (로그인 시):
┌──────────────────────────────────┐
│ ⚠️  계정이 3일간 일시정지 중입니다 │
│ (2026-07-03 23:59까지)            │
│ [이의 제기하기]                   │
└──────────────────────────────────┘
```

**MUST NOT**: 피신고자에게 신고자 정보 노출 금지 (이메일·username·IP)

### 18.5 피신고자 이의제기 (appeal)

**이의 제기 가능 조건**:
- 정지/차단 조치 후 7일 이내
- 이전에 이의를 제기한 같은 신고건이 아님

**이의 제기 프로세스**:
```
[피신고자: 이의 제기 버튼]
  ↓
이의 사유 입력 (최소 20자)
  ↓
reports_appeals 테이블 INSERT
  (report_id, respondent_id, reason, status='pending')
  ↓
피신고자 이메일:
"이의 신청이 접수되었습니다. 최대 7일 내에 검토 결과를 알려드립니다."
  ↓
관리자 검토 (최대 7일)
  ├─ [인용] → 조치 철회, 피신고자 + 신고자 통보
  └─ [기각] → 조치 유지, 피신고자 통보 "이의가 기각되었습니다"
```

### 18.6 데이터베이스 스키마

```sql
-- reports 테이블 확장 (기존 §16.1)
ALTER TABLE moderation_reports
ADD COLUMN appeal_count INT DEFAULT 0,
ADD COLUMN final_status TEXT CHECK(final_status IN ('pending', 'resolved_action', 'resolved_noaction', 'resolved_appeal'));

-- 신규 테이블: reports_appeals (이의제기)
CREATE TABLE reports_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES moderation_reports(id) ON DELETE CASCADE,
  respondent_id uuid NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK(length(reason) >= 20),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'approved', 'rejected')),
  created_at TIMESTAMP DEFAULT now(),
  reviewed_at TIMESTAMP,
  reviewer_id uuid REFERENCES users(id),
  
  UNIQUE(report_id, respondent_id)  -- 중복 이의 방지
);

-- audit_logs 추가 행
INSERT INTO audit_logs VALUES (
  event_type='report_submitted' | 'report_resolved' | 'appeal_submitted' | 'appeal_resolved'
)
```

### 18.7 MUST NOT

- ❌ 신고자에게 신고 이후 처리 상태 상세 공개 (privacy)
- ❌ 피신고자에게 신고자 신원 노출
- ❌ SLA 기한 도과 시 자동 dismiss (수동 검토 필수)
- ❌ 이의 제기를 여러 번 허용 (같은 신고당 1회만)
- ❌ 피신고자가 신고자 신원 추측하도록 유도하는 통보문

---

## 참고 자료

- [OWASP Top 10 Web Application Security Risks](https://owasp.org/www-project-top-ten/)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/row-level-security)
- [LiveKit Tokens & Grants](https://docs.livekit.io/frontends/reference/tokens-grants/)
- [OpenAI Moderation API](https://platform.openai.com/docs/guides/moderation)
- [NIST Secure Software Development Framework](https://csrc.nist.gov/publications/detail/sp/800-218/final)
