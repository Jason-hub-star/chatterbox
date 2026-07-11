---
tags: [spec]
---

<!-- 이 파일은 SecurityPolicies.md에서 분할됨 (2026-07-08, 1500줄 회전 임계). 부모 허브: ../SecurityPolicies.md -->

# ChatterBox 보안 정책 — 녹화 동의·크레딧 동시성·rate limit·차단 게이트·스토리지 쿼터 (§11–§15)

> 부모 인덱스: [`SecurityPolicies.md`](../SecurityPolicies.md) · 원본 섹션 번호 유지.

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

