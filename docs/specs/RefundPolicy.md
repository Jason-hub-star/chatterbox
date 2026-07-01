---
tags: [spec]
---

# RefundPolicy — 자동 환불 정책

VGEN 영상생성 실패 또는 DUB 합성 실패 시 자동 100% 환불 기준과 분쟁 신청 프로세스.

## 적용 범위

- **VGEN-02 생성 트리거 후 크레딧 차감 → 생성 실패 (job.status='failed')**
- **DUB-05 합성 트리거 후 크레딧 차감 → 합성 실패 (dubbing_job.status='failed')**
- 환불 대상: 사용자가 결제로 구매한 크레딧만 (월간 무료 할당량 제외)

## 자동 환불 규칙

### VGEN 실패 환불

```sql
-- VGEN-02 생성 실패 감지
CREATE TABLE vgen_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  vgen_job_id UUID NOT NULL REFERENCES vgen_jobs(id),
  job_prompt TEXT,
  credits_charged INT,
  credits_refunded INT,
  failure_reason TEXT, -- 'api_error' | 'timeout' | 'content_moderation' | 'insufficient_credits' | 'user_cancel'
  refund_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  refund_status TEXT DEFAULT 'completed' CHECK (refund_status IN ('pending', 'completed', 'failed')),
  
  CONSTRAINT refund_only_failed CHECK (credits_refunded <= credits_charged)
);

-- 트리거: vgen_jobs.status='failed' → 자동 환불 (app_config 플래그 기반 정책)
CREATE OR REPLACE FUNCTION auto_refund_vgen_job()
RETURNS TRIGGER AS $$
DECLARE
  v_should_refund BOOLEAN := FALSE;
  v_refund_moderation_enabled BOOLEAN;
  v_refund_user_cancel_enabled BOOLEAN;
BEGIN
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    -- app_config에서 환불 정책 플래그 조회
    SELECT (value->>'value')::BOOLEAN INTO v_refund_moderation_enabled
    FROM app_config WHERE key = 'VGEN_REFUND_MODERATION' AND enabled = true;
    
    SELECT (value->>'value')::BOOLEAN INTO v_refund_user_cancel_enabled
    FROM app_config WHERE key = 'VGEN_REFUND_USER_CANCEL' AND enabled = true;
    
    -- 환불 가능 여부 판정 (의사코드)
    -- 기본: 환불 가능
    v_should_refund := TRUE;
    
    -- 예외: 환불 불가 사유 체크 (플래그에 따라 동적 분기)
    IF NEW.failure_reason = 'content_moderation' AND NOT COALESCE(v_refund_moderation_enabled, FALSE) THEN
      v_should_refund := FALSE;  -- content_moderation 플래그가 OFF면 환불 불가
    END IF;
    
    IF NEW.failure_reason = 'user_cancel' AND NOT COALESCE(v_refund_user_cancel_enabled, FALSE) THEN
      v_should_refund := FALSE;  -- user_cancel 플래그가 OFF면 환불 불가
    END IF;
    
    -- 환불 가능 시에만 크레딧 복구
    IF v_should_refund THEN
      UPDATE credit_transactions
      SET refund_id = NEW.id
      WHERE vgen_job_id = NEW.id AND direction = 'debit';
      
      INSERT INTO credits(user_id, amount, transaction_type, source_job_id)
      VALUES (
        NEW.user_id,
        (SELECT SUM(amount) FROM credit_transactions WHERE vgen_job_id = NEW.id AND direction = 'debit'),
        'refund_vgen',
        NEW.id
      );
      
      -- 사용자 알림 (환불 완료)
      INSERT INTO notifications(user_id, type, title, message, data)
      VALUES (
        NEW.user_id,
        'vgen_refund',
        '영상 생성 실패',
        format('요청하신 영상 생성이 실패했습니다. %L 크레딧이 반환되었습니다.',
               (SELECT SUM(amount) FROM credit_transactions WHERE vgen_job_id = NEW.id)),
        jsonb_build_object('vgen_job_id', NEW.id, 'failure_reason', NEW.failure_reason)
      );
    ELSE
      -- 환불 불가인 경우 사용자 알림 (사유 명시)
      INSERT INTO notifications(user_id, type, title, message, data)
      VALUES (
        NEW.user_id,
        'vgen_refund_denied',
        '영상 생성 실패',
        format('영상 생성이 실패했습니다. 사유: %L. 환불 불가 조건에 해당합니다.',
               NEW.failure_reason),
        jsonb_build_object('vgen_job_id', NEW.id, 'failure_reason', NEW.failure_reason)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vgen_auto_refund AFTER UPDATE ON vgen_jobs
FOR EACH ROW EXECUTE FUNCTION auto_refund_vgen_job();
```

### DUB 실패 환불

```sql
CREATE TABLE dub_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  dub_session_id UUID NOT NULL REFERENCES dub_sessions(id),
  credits_charged INT,
  credits_refunded INT,
  failure_reason TEXT, -- 'composition_timeout' | 'ffmpeg_error' | 'user_cancel' | 'consent_withdrawn'
  refund_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  refund_status TEXT DEFAULT 'completed' CHECK (refund_status IN ('pending', 'completed', 'failed')),
  
  CONSTRAINT refund_only_failed CHECK (credits_refunded <= credits_charged)
);

-- 트리거: dub_sessions.status='failed' → 자동 환불 (app_config 플래그 기반 정책)
CREATE OR REPLACE FUNCTION auto_refund_dub_session()
RETURNS TRIGGER AS $$
DECLARE
  v_should_refund BOOLEAN := FALSE;
  v_refund_user_cancel_enabled BOOLEAN;
BEGIN
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    -- app_config에서 환불 정책 플래그 조회
    SELECT (value->>'value')::BOOLEAN INTO v_refund_user_cancel_enabled
    FROM app_config WHERE key = 'DUB_REFUND_USER_CANCEL' AND enabled = true;
    
    -- 환불 가능 여부 판정 (의사코드)
    -- 기본: 환불 가능
    v_should_refund := TRUE;
    
    -- 예외: 환불 불가 사유 체크 (플래그에 따라 동적 분기)
    IF NEW.failure_reason IN ('user_cancel', 'consent_withdrawn') 
       AND NOT COALESCE(v_refund_user_cancel_enabled, FALSE) THEN
      v_should_refund := FALSE;  -- user_cancel 플래그가 OFF면 환불 불가
    END IF;
    
    -- 환불 가능 시에만 크레딧 복구
    IF v_should_refund THEN
      UPDATE credit_transactions
      SET refund_id = NEW.id
      WHERE dub_session_id = NEW.id AND direction = 'debit';
      
      INSERT INTO credits(user_id, amount, transaction_type, source_job_id)
      VALUES (
        NEW.user_id,
        (SELECT SUM(amount) FROM credit_transactions WHERE dub_session_id = NEW.id AND direction = 'debit'),
        'refund_dub',
        NEW.id
      );
      
      -- 사용자 알림 (환불 완료)
      INSERT INTO notifications(user_id, type, title, message, data)
      VALUES (
        NEW.user_id,
        'dub_refund',
        '더빙 합성 실패',
        format('더빙 합성 중 오류가 발생했습니다. %L 크레딧이 반환되었습니다.',
               (SELECT SUM(amount) FROM credit_transactions WHERE dub_session_id = NEW.id AND direction = 'debit')),
        jsonb_build_object('dub_session_id', NEW.id, 'failure_reason', NEW.failure_reason)
      );
    ELSE
      -- 환불 불가인 경우 사용자 알림 (사유 명시)
      INSERT INTO notifications(user_id, type, title, message, data)
      VALUES (
        NEW.user_id,
        'dub_refund_denied',
        '더빙 합성 실패',
        format('더빙 합성이 중단되었습니다. 사유: %L. 환불 불가 조건에 해당합니다.',
               NEW.failure_reason),
        jsonb_build_object('dub_session_id', NEW.id, 'failure_reason', NEW.failure_reason)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dub_auto_refund AFTER UPDATE ON dub_sessions
FOR EACH ROW EXECUTE FUNCTION auto_refund_dub_session();
```

## 분쟁 신청 프로세스

### 사용자 분쟁 신청

```typescript
// Edge Function: POST /functions/v1/dispute-refund
// Request body
interface DisputeRefundRequest {
  job_id: string; // vgen_job_id 또는 dub_session_id
  job_type: 'vgen' | 'dub';
  reason: string; // 최대 500자
  evidence_url?: string; // 스크린샷 URL (optional)
}

// Response
interface DisputeRefundResponse {
  dispute_id: string;
  status: 'submitted'; // 항상 'submitted'
  review_deadline: string; // ISO 8601, 48시간 후
  support_contact: string; // 고객 지원 링크
}
```

### 검토 및 결정

| 상황 | 처리 | 기한 |
|---|---|---|
| 자동 환불 이미 완료 | 분쟁 거절 (이미 처리됨) | 즉시 |
| 크레딧 차감 기록 없음 | 분쟁 거절 (차감 확인 불가) | 즉시 |
| 유효한 실패 기록 + 구매 크레딧 증명 | 분쟁 승인 (환불 완료) | 48시간 |
| 사용자 실수/센서 문제 | 분쟁 거절 (환불 불가 사유 명시) | 48시간 |

### Supabase 스키마

```sql
CREATE TABLE refund_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  job_id UUID NOT NULL, -- vgen_job_id 또는 dub_session_id (외래키 없음, FK constraint 복잡성 회피)
  job_type TEXT NOT NULL CHECK (job_type IN ('vgen', 'dub')),
  reason TEXT NOT NULL,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected')),
  decision_reason TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_admin UUID REFERENCES admins(id),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '48 hours'),
  
  CONSTRAINT valid_job_id CHECK (job_id IS NOT NULL)
);

CREATE INDEX idx_refund_disputes_user_id ON refund_disputes(user_id);
CREATE INDEX idx_refund_disputes_status ON refund_disputes(status);
CREATE INDEX idx_refund_disputes_expires_at ON refund_disputes(expires_at);

-- 48시간 후 자동 거절 (미검토 분쟁)
CREATE OR REPLACE FUNCTION auto_reject_expired_disputes()
RETURNS void AS $$
BEGIN
  UPDATE refund_disputes
  SET status = 'rejected',
      decision_reason = '검토 기한 만료. 48시간 이내 검토되지 않았습니다.',
      reviewed_at = NOW()
  WHERE status = 'submitted' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- pg_cron: 1시간마다 실행
SELECT cron.schedule('auto_reject_expired_disputes', '0 * * * *', 'SELECT auto_reject_expired_disputes()');
```

## 환불 가능/불가 판정 규칙

### 환불 가능 ✅

- VGEN: job.status='failed' + 사용자 구매 크레딧 차감 기록 있음
- DUB: dub_session.status='failed' + 사용자 구매 크레딧 차감 기록 있음
- 월간 무료 할당량 사용 중이라도, 구매 크레딧이 차감되었으면 그 부분만 환불

### 환불 불가 ❌

- VGEN: content_moderation (부적절 콘텐츠 거절) — 환불 대신 가이드라인 제시
- DUB: 사용자가 명시적 취소 (user_cancel, consent_withdrawn) — 선택사항이므로 환불 불가
- 월간 무료 크레딧만 사용한 경우 — 환불 대상 아님
- 분쟁 신청 없이 48시간 경과 후 (자동 거절)

## 고객 커뮤니케이션

### 자동 환불 알림 (사용자)

```
제목: 영상 생성 실패 — 크레딧 환불 완료

요청하신 영상 생성이 실패했습니다.
차감되었던 500 크레딧이 계정으로 복구되었습니다.

[실패 사유]: API 타임아웃

문제가 지속되면 고객 지원에 문의해주세요.
```

### 분쟁 거절 알림

```
제목: 환불 분쟁 검토 완료

요청하신 환불 분쟁을 검토했습니다.

[결정]: 거절
[사유]: 부적절한 콘텐츠로 인해 거절되었습니다.
         가이드라인: https://...

다시 시도하실 때는 커뮤니티 가이드라인을 참고해주세요.
```

## Edge Function: refund-credit

```typescript
// POST /functions/v1/refund-credit
// Internal use only (크론 또는 관리자 전용)

interface ManualRefundRequest {
  user_id: string;
  amount: number;
  reason: 'dispute_approved' | 'customer_service' | 'promotion';
  reference_id?: string; // dispute_id 또는 support_ticket_id
}

// 동시성 제어
const upsertRefund = async (userId, amount) => {
  const { data, error } = await supabase.rpc('credit_refund_transaction', {
    p_user_id: userId,
    p_amount: amount,
    p_idempotency_key: `dispute_${disputeId}`, // 중복 환불 방지
  });
  if (error) throw error;
  return data;
};
```

## 관련 문서

- `../FEATURE-SPEC.md` — INF-08 결제/크레딧 구매 (P1 격상)
- `../GAP-MATRIX.md` — G-202 자동 환불 플로우 갭
- `../FEATURE-CONTRACT-MAP.md` — INF-08 계약 매핑
- `../DATA-SCHEMA.md` — credit_transactions, vgen_refunds, dub_refunds, refund_disputes 테이블
- `SecurityPolicies.md` — 크레딧 동시성 제어 (§12)
