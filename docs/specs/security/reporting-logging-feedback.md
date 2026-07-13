---
tags: [spec]
---

<!-- 이 파일은 SecurityPolicies.md에서 분할됨 (2026-07-08, 1500줄 회전 임계). 부모 허브: ../SecurityPolicies.md -->

# ChatterBox 보안 정책 — 신고·차단·PII 로깅·피드백 루프·참고 (§16–§18, 참고)

> 부모 인덱스: [`SecurityPolicies.md`](../SecurityPolicies.md) · 원본 섹션 번호 유지.

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

### 16.6 인앱 피드백/문의 (ISS-04 창구, 2026-07-13)

신고(§16.1 = 타인 대상 운영 큐)와 분리된 "내 경험의 문제" 접수 채널. 구현: `feedback` 테이블 + Edge `create-feedback` + 의상실 [문제 알리기] 모달(`FeedbackModal`).

- 쓰기는 Edge 전용(INSERT 정책 0) — category 화이트리스트(avatar·room·audio·other)·description 1~1000자·rate limit 2/분+10/시를 서버가 강제.
- **진단 번들은 opt-in** — 클라 임의 구조를 그대로 저장하지 않고 서버가 화이트리스트 키만 재구성: `avatar_job_id`(uuid 검증)·`avatar_url`·`user_agent`·`app_url` (각 ≤300자). 업로드 원본 이미지·이메일 등 미포함, 동의 UI가 수집 항목을 제출 전 그대로 표시한다.
- 조회는 RLS 본인 행만(`feedback_select_own`) — 접수번호(id 앞 8자)·상태(received→investigating→fixed→closed) 추적 UI.
- 보존 90일: `purge_old_feedback()`(DEFINER, 3-role revoke) + pg_cron `feedback-purge-90d`(04:20).
- 접수 시 `audit_logs` `feedback_created`(meta 는 category·has_diag 만 — diag 본문 미복제).

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

