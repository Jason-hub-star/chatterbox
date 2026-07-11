---
tags: [spec]
---

<!-- 이 파일은 SecurityPolicies.md에서 분할됨 (2026-07-08, 1500줄 회전 임계). 부모 허브: ../SecurityPolicies.md -->

# ChatterBox 보안 정책 — 인증·RLS (§0–§2)

> 부모 인덱스: [`SecurityPolicies.md`](../SecurityPolicies.md) · 원본 섹션 번호 유지.

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
- **Supabase Auth** — 간편인증(소셜) 우선, 이메일은 보조. UI 순서: 카카오(주버튼)→Google→"또는"→이메일.
  - **1차(간편인증)**: Kakao·Google OAuth2 — `userStore.loginWithOAuth('google'|'kakao')`. 로그인/가입 상단 노출.
  - **2차(보조)**: 이메일+비밀번호 — 폐기하지 않음(자동화 검증·계정 복구 경로). OAuth 활성 시 "이메일로 로그인/가입" 토글 뒤로 강등.
- **이메일 비밀번호 검증**: bcrypt 해싱 (Supabase 자체 관리)
- **Google OAuth**: Consent screen + `email` scope 만 요청
- **Kakao OAuth**: 이메일 **필수동의**(비즈앱 검수 필요) — 없으면 이메일 가입 계정과 자동 연결 안 돼 동일인 계정 분열
- **노출 게이트**: `VITE_OAUTH_PROVIDERS`(예: `"kakao,google"`) 설정 시에만 버튼 노출. Supabase 대시보드 프로바이더 등록 선행. 미설정이면 이메일만 노출.

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

