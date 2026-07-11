---
tags: [spec]
---

<!-- 이 파일은 SecurityPolicies.md에서 분할됨 (2026-07-08, 1500줄 회전 임계). 부모 허브: ../SecurityPolicies.md -->

# ChatterBox 보안 정책 — LiveKit 토큰·미디어·모더레이션·DataChannel·OBS (§3–§7)

> 부모 인덱스: [`SecurityPolicies.md`](../SecurityPolicies.md) · 원본 섹션 번호 유지.

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

