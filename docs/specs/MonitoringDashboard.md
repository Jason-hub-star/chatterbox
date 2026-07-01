---
tags: [spec, monitoring]
---

> G-134 산출 문서. 운영 모니터링 대시보드 및 비용 알림 전략.
> 
> **AGENT-OPS 연동**: 이 대시보드의 모든 지표는 AGENT-OPS.md §일간 체크리스트에서 매일 자동으로 확인되며, 임계값 초과 시 Slack #agent-log 또는 #security-alerts로 에스컬레이션된다.

# 운영 모니터링 대시보드 설계

무료 모니터링 스택 + pg_cron 비용 알림으로 DAU 100~10K 규모의 운영 가시성 확보.

---

## 무료 모니터링 스택

| 도구 | 용도 | 메트릭 | 비용 | 통합 |
|-----|------|--------|------|------|
| **Supabase Pro Dashboard** | DB 모니터링 | 쿼리 성능·테이블 크기·활성 연결 | ✓ 무료 (Pro) | 대시보드·Realtime |
| **LiveKit Cloud Dashboard** | 방송 모니터링 | 실시간 방 수·참가자·비트레이트·에러 | ✓ 무료 | REST API |
| **Cloudflare Analytics** | CDN 모니터링 | Pages 요청·캐시 히트율·응답시간 | ✓ 무료 | 웹 UI |
| **Sentry** (무료 tier) | 에러 로깅 | 프론트엔드 exception·성능 지표 | 5K/월 이벤트 | SDK·DSN |
| **pg_cron + Edge Function** | 비용 알림 | VGEN 일일 비용·DAU·LiveKit 누적비용 | ✓ 무료 | Slack Webhook |

---

## 각 서비스별 주요 메트릭

### 1. Supabase Dashboard (Pro 이상)

**경로:** Project Settings → Database → Monitoring

| 메트릭 | 단위 | 주기 | 목표 |
|-------|------|------|------|
| **Query Performance** | ms (p95) | 실시간 | <100ms |
| **Connection Count** | 개수 | 실시간 | <20/동시 |
| **Database Size** | GB | 일일 | <5GB (처음) |
| **Realtime Messages** | msg/초 | 실시간 | <1K msg/s |
| **Row Count** (테이블별) | 개수 | 일일 | 방문당 예상값 |

**자주 확인할 테이블:**
- `rooms`: 활성 방 개수
- `room_participants`: 누적 참가자
- `vgen_jobs`: 영상 생성 큐 길이
- `dub_sessions`: 더빙 작업 상태

---

### 2. LiveKit Cloud Dashboard

**경로:** [https://dashboard.livekit.cloud](https://dashboard.livekit.cloud)

| 메트릭 | 단위 | 주기 | 알림 기준 |
|-------|------|------|---------|
| **Active Rooms** | 개수 | 실시간 | >10개 = 혼잡 경고 |
| **Active Participants** | 개수 | 실시간 | >50명 = 과부하 경고 |
| **Bitrate (video)** | Mbps | 실시간 | >5Mbps = 네트워크 혼잡 |
| **Bitrate (audio)** | kbps | 실시간 | >128kbps = 이상 신호 |
| **Packet Loss** | % | 실시간 | >2% = 네트워크 문제 |
| **Session Duration** | 시간 | 일일 | 평균 시간 추적 |

**LiveKit REST API (programmatic 모니터링):**

```bash
# API 엔드포인트
curl -H "Authorization: Bearer $LIVEKIT_TOKEN" \
  https://your-livekit-instance.livekit.cloud/twirp/livekit.RoomService/ListRooms

# 응답 예시
{
  "rooms": [
    {
      "sid": "RM_...",
      "name": "room-abc123",
      "emptyTimeout": 300,
      "creationTime": "1719712800",
      "numParticipants": 4,
      "numPublishers": 2,
      "activeRecording": false
    }
  ]
}
```

---

### 3. Cloudflare Analytics (Pages)

**경로:** Cloudflare Dashboard → Pages → [snack-web-platform] → Analytics

| 메트릭 | 단위 | 주기 |
|-------|------|------|
| **Requests** | 개수 | 일일 |
| **Cache Hit Ratio** | % | 일일 |
| **Bandwidth** | GB | 일일 |
| **Origin Response Time** | ms | 일일 |

---

### 4. Sentry (에러 추적)

**경로:** [sentry.io](https://sentry.io) → 프로젝트 대시보드

| 메트릭 | 단위 | 주기 | 기준 |
|-------|------|------|------|
| **Error Rate** | % | 실시간 | >1% = 경고 |
| **Event Count** | 개수 | 일일 | 무료 tier 5K/월 |
| **Session Stability** | % | 일일 | <99% = 심각한 버그 |

**구성:**
```javascript
// sentry 초기화
Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.VITE_ENV,
  tracesSampleRate: process.env.VITE_ENV === 'prod' ? 0.01 : 0.1,
  beforeSend(event) {
    // PII 마스킹 (G-125)
    if (event.message) event.message = maskPII(event.message);
    return event;
  }
});
```

---

## 운영용 SQL 쿼리 3개

### 쿼리 1: 일별 VGEN 생성 비용 추정

```sql
-- vgen_jobs 테이블 기반 일일 비용 집계
SELECT
  DATE(created_at) as date,
  COUNT(*) as generation_count,
  SUM(
    CASE
      -- 모델별 단가 (G-118)
      WHEN model_id = 'seedance-v2.5' THEN 0.3 * duration_sec / 1000.0
      WHEN model_id = 'seedance-v2.0' THEN 0.24 * duration_sec / 1000.0
      ELSE 0.24 * duration_sec / 1000.0
    END
  ) as estimated_cost_usd,
  ROUND(
    SUM(
      CASE
        WHEN model_id = 'seedance-v2.5' THEN 0.3 * duration_sec / 1000.0
        WHEN model_id = 'seedance-v2.0' THEN 0.24 * duration_sec / 1000.0
        ELSE 0.24 * duration_sec / 1000.0
      END
    ) * 1000 -- 크레딧 환산 (1 credit ≈ $0.001)
  )::INT as estimated_credits_used
FROM vgen_jobs
WHERE status IN ('done', 'failed')  -- 실제 실행된 작업만
AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;

-- 결과:
-- date       | generation_count | estimated_cost_usd | estimated_credits_used
-- 2026-06-30 | 12               | $2.88              | 2880
-- 2026-06-29 | 8                | $1.92              | 1920
```

### 쿼리 2: DAU 추정 + LiveKit 월 비용 유도

```sql
-- room_sessions (또는 room_participants) 기반 DAU
WITH daily_users AS (
  SELECT
    DATE(created_at) as date,
    COUNT(DISTINCT user_id) as dau,
    COUNT(DISTINCT room_id) as daily_rooms
  FROM room_participants
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at)
)
SELECT
  ROUND(AVG(dau))::INT as avg_dau,
  MAX(dau) as peak_dau,
  ROUND(AVG(daily_rooms))::INT as avg_daily_rooms,
  
  -- LiveKit 월 비용 추정 (분당 $0.0028 기준)
  ROUND(
    AVG(daily_rooms) * 30 *
    (SELECT AVG(EXTRACT(EPOCH FROM (left_at - created_at)) / 60)::INT
     FROM room_participants
     WHERE created_at >= NOW() - INTERVAL '30 days') *
    0.0028 -- 분당 rate
  )::INT as estimated_livekit_cost_usd
FROM daily_users;

-- 결과:
-- avg_dau | peak_dau | avg_daily_rooms | estimated_livekit_cost_usd
-- 145     | 203      | 8               | 340 (월 약 $340)
```

### 쿼리 3: 월별 누적 비용 롤업 + 경고 기준

```sql
-- 월별 비용 대시보드 (Supabase MAU, 스토리지, fal.ai, LiveKit)
WITH monthly_costs AS (
  SELECT
    DATE_TRUNC('month', created_at)::DATE as month,
    
    -- VGEN 비용
    ROUND(
      SUM(
        CASE
          WHEN model_id = 'seedance-v2.5' THEN 0.3 * duration_sec / 1000.0
          WHEN model_id = 'seedance-v2.0' THEN 0.24 * duration_sec / 1000.0
          ELSE 0.24 * duration_sec / 1000.0
        END
      )
    )::INT as vgen_cost_usd,
    
    -- LiveKit 비용 추정
    ROUND(
      COUNT(DISTINCT room_id) *
      (SELECT AVG(EXTRACT(EPOCH FROM (left_at - created_at)) / 60)::INT
       FROM room_participants WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()))
      * 0.0028
    )::INT as livekit_cost_usd
    
  FROM vgen_jobs
  WHERE status = 'done'
  AND created_at >= NOW() - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT
  month,
  vgen_cost_usd,
  livekit_cost_usd,
  ROUND(vgen_cost_usd * 50)::INT as supabase_storage_est_usd, -- 500GB = $50/월
  (vgen_cost_usd + livekit_cost_usd + ROUND(vgen_cost_usd * 50)::INT) as total_monthly_cost_usd,
  
  CASE
    WHEN (vgen_cost_usd + livekit_cost_usd + ROUND(vgen_cost_usd * 50)::INT) > 500 THEN 'ALERT: Over $500'
    WHEN (vgen_cost_usd + livekit_cost_usd + ROUND(vgen_cost_usd * 50)::INT) > 300 THEN 'WARNING: $300-500'
    ELSE 'OK'
  END as alert_status
FROM monthly_costs
ORDER BY month DESC;

-- 결과:
-- month      | vgen_cost_usd | livekit_cost_usd | supabase_storage_est_usd | total_monthly_cost_usd | alert_status
-- 2026-06-01 | 150           | 340              | 75                       | 565                    | ALERT: Over $500
-- 2026-05-01 | 80            | 200              | 50                       | 330                    | WARNING: $300-500
```

### 쿼리 4: 환불 분쟁 적체 모니터링 (RefundPolicy.md 참조)

```sql
-- 최근 7일 분쟁 신청 현황
SELECT 
  status, 
  COUNT(*) as dispute_count, 
  MIN(submitted_at) as oldest_dispute, 
  MAX(submitted_at) as newest_dispute,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - submitted_at)) / 3600))::INT as avg_hours_pending
FROM refund_disputes
WHERE submitted_at > NOW() - INTERVAL '7 days'
GROUP BY status
ORDER BY status;

-- 결과:
-- status    | dispute_count | oldest_dispute        | newest_dispute        | avg_hours_pending
-- submitted | 5             | 2026-06-30 12:00:00   | 2026-06-30 18:30:00   | 8
-- approved  | 2             | 2026-06-29 14:00:00   | 2026-06-30 10:00:00   | 24
-- rejected  | 3             | 2026-06-28 09:00:00   | 2026-06-29 16:00:00   | 32

-- 48시간 SLA 초과 분쟁 (경고 대상)
SELECT 
  COUNT(*) as overdue_count,
  STRING_AGG(id::TEXT, ', ') as dispute_ids
FROM refund_disputes
WHERE status = 'submitted' 
AND submitted_at < NOW() - INTERVAL '48 hours';

-- 결과:
-- overdue_count | dispute_ids
-- 1             | a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6
```

---

## pg_cron 비용 알림 설정

### Edge Function: `daily-cost-check`

```sql
-- Supabase Edge Function (TypeScript)
-- POST /functions/v1/daily-cost-check

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function dailyCostCheck(req: Request) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  // 1. 어제 VGEN 비용 조회
  const { data: vgenJobs } = await supabase
    .from('vgen_jobs')
    .select('duration_sec, model_id')
    .eq(
      'created_at',
      `gte.${yesterday.toISOString().split('T')[0]}`,
      `lt.${new Date().toISOString().split('T')[0]}`
    )
    .eq('status', 'done');

  const vgenCost = (vgenJobs || []).reduce((sum, job) => {
    const unitCost = job.model_id === 'seedance-v2.5' ? 0.3 : 0.24;
    return sum + (unitCost * job.duration_sec / 1000);
  }, 0);

  // 2. Slack 알림
  if (vgenCost > 100) {  // $100 초과 시 알림
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `⚠️ VGEN 일일 비용 경고`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*VGEN 어제 비용: $${vgenCost.toFixed(2)}*\n`
                + `생성 건수: ${vgenJobs?.length || 0}\n`
                + `평균 단가: $${(vgenCost / (vgenJobs?.length || 1)).toFixed(4)}/건`
            }
          }
        ]
      })
    });
  }

  return new Response('OK', { status: 200 });
}

Deno.serve(dailyCostCheck);
```

### pg_cron 스케줄 (Supabase SQL Editor)

```sql
-- 매일 08:00 UTC (한국 17:00, 오후 5시) VGEN 비용 체크
select
  cron.schedule(
    'daily-vgen-cost-check',
    '0 8 * * *',  -- UTC 기준 (한국 = UTC+9 = 17:00 KST)
    $$
    select
      http_post(
        'https://[project-id].functions.supabase.co/functions/v1/daily-cost-check',
        '{}',
        'application/json'
      )
    $$
  );

-- 매월 1일 08:00 UTC 월별 비용 리포트
select
  cron.schedule(
    'monthly-cost-report',
    '0 8 1 * *',
    $$
    select
      http_post(
        'https://[project-id].functions.supabase.co/functions/v1/monthly-cost-report',
        '{}',
        'application/json'
      )
    $$
  );

-- 리스트 확인
select * from cron.job;

-- 작업 비활성화 (필요시)
select cron.unschedule('daily-vgen-cost-check');
```

---

## 즉시 적용 체크리스트 (5항목)

### 1. Supabase Dashboard 활성화

- [ ] Supabase Pro 플랜 확인 (https://supabase.com/pricing)
- [ ] Project Settings → Database → Monitoring 접속
- [ ] 주요 테이블 (rooms, vgen_jobs, room_participants) 추가
- [ ] 매주 금요일 오전에 데이터 리뷰 (캘린더 알림 설정)

### 2. LiveKit Dashboard 링크

- [ ] LiveKit Cloud 계정 (https://dashboard.livekit.cloud)
- [ ] Project API Key + Secret 발급 확인
- [ ] Slack Bot Token 준비 (선택)
- [ ] Rooms 페이지에서 주간 활성 방 수 추적

### 3. Cloudflare Analytics 설정

- [ ] Cloudflare 계정 로그인
- [ ] snack-web-platform Pages 프로젝트 선택
- [ ] Analytics 탭 자동 수집 확인 (별도 설정 불필요)

### 4. Sentry 초기화

- [ ] Sentry 계정 생성 (https://sentry.io)
- [ ] DSN 발급 (Settings → Projects → Client Keys)
- [ ] .env 파일에 `VITE_SENTRY_DSN` 추가
- [ ] 프로덕션 배포 후 에러 수신 확인

### 5. pg_cron + Edge Function 배포

- [ ] Supabase Edge Function 생성: `daily-cost-check`
- [ ] Slack Webhook URL 발급 (https://api.slack.com/messaging/webhooks)
- [ ] `SLACK_WEBHOOK_URL` 환경변수 Supabase에 추가
- [ ] pg_cron 스케줄 SQL 실행 (위 코드 참고)
- [ ] 테스트 실행: `curl -X POST https://[project].functions.supabase.co/functions/v1/daily-cost-check`

---

## 모니터링 대시보드 링크 (북마크)

| 도구 | 링크 | 업데이트 주기 |
|-----|------|-------------|
| Supabase | https://supabase.com/dashboard/project/[project-id] | 실시간 |
| LiveKit | https://dashboard.livekit.cloud/projects | 실시간 |
| Cloudflare | https://dash.cloudflare.com/pages/snack-web-platform | 일일 |
| Sentry | https://sentry.io/organizations/[org]/issues | 실시간 |
| Google Sheets (수동 정리용) | [공유 링크 - 선택] | 주별 |

---

## 알림 임계값 & 수신자 정의 (G-144)

### 알림 규칙 테이블

| 메트릭 | 임계값 | 수신 채널 | 에스컬레이션 |
|--------|--------|----------|------------|
| **VGEN 일일 비용** | > $50 경고 / > $100 위험 | Slack `#ops-alerts` | P1 인시던트 선언 |
| **fal.ai 401 에러율** | 5분 내 3회 이상 | Sentry Alert → Slack | P1 인시던트 — INCIDENT-PLAYBOOK.md §P1-fal.ai 절차 참조 — 서버 flag `VGEN_ENABLED=false` 즉시 전환 |
| **Supabase DB 연결 수** | > 20 동시 | Supabase Dashboard 경고 | 유휴 연결 강제 종료 |
| **LiveKit WebRTC 실패율** | > 5% (5분 기준) | LiveKit Dashboard 수동 확인 | P2 인시던트 |
| **LiveKit Packet Loss** | > 2% | LiveKit Dashboard | 네트워크 검토 |
| **Sentry 에러율** | 1분 내 10건 이상 | Sentry Alert → 이메일 | 코드 레벨 버그 확인 |
| **Sentry 이벤트 수** | > 4,000/월 (무료 티어 5K) | 수동 확인 (월말) | 샘플링 비율 조정 |
| **월 누적 비용** | > $300 경고 / > $500 위험 | pg_cron 월간 리포트 | 비용 제어 액션 COST-ESTIMATE.md 참조 |
| **환불 분쟁 적체** | 48시간 SLA 초과 분쟁 1건 이상 | Slack `#ops-alerts` | P2 인시던트 — INCIDENT-PLAYBOOK.md 참조, 분쟁 검토 급선무 |
| **환불 분쟁 합계** | 미승인('submitted') 분쟁 > 10건 (7일 기준) | 수동 확인 (주간) | 검토 인력 추가 검토 필요 |

### Sentry Alert 설정

**경로:** Sentry Dashboard → Alerts → Create Alert Rule

**룰 1 — fal.ai 401 에러 급증:**
```
조건: error.message contains "401" AND transaction contains "fal"
임계값: 5분 내 3건 이상
액션: Slack #ops-alerts + 이메일
```

**룰 2 — 전체 에러율 급증:**
```
조건: event.count > 10 per 1 minute
임계값: 10건/분
액션: 이메일 알림
```

**룰 3 — 크래시율 (Session Stability):**
```
조건: sessions.crashed_rate > 1%
임계값: 1%
액션: Slack #ops-alerts
```

### pg_cron 일일 비용 알림 임계값 조정

`daily-cost-check` Edge Function의 알림 기준:

```typescript
// 현재: $100 초과 시 알림
// 조정: 단계적 알림
if (vgenCost > 100) {
  await sendSlackAlert({ level: 'danger', cost: vgenCost })
} else if (vgenCost > 50) {
  await sendSlackAlert({ level: 'warning', cost: vgenCost })
}
// $50 이하: 알림 없음 (정상 범위)
```

### pg_cron 주간 환불 분쟁 적체 알림

```sql
-- 매주 월요일 09:00 UTC (한국 18:00) 분쟁 적체 현황 체크
select cron.schedule(
  'dispute-backlog-check',
  '0 9 * * 1',  -- 매주 월요일 09:00 UTC
  $$
  select http_post(
    'https://[project-id].functions.supabase.co/functions/v1/dispute-backlog-check',
    '{}',
    'application/json'
  )
  $$
);
```

**Edge Function 로직 (`dispute-backlog-check`)**:

```typescript
// POST /functions/v1/dispute-backlog-check
// 48시간 SLA 초과 또는 미승인 분쟁이 10건 이상이면 Slack 알림

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function disputeBacklogCheck(req: Request) {
  // 1. 48시간 SLA 초과 분쟁 체크
  const { data: overdueDisputes } = await supabase
    .from('refund_disputes')
    .select('id, user_id, submitted_at')
    .eq('status', 'submitted')
    .lt('submitted_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString());

  // 2. 미승인 분쟁 합계 (7일 기준)
  const { data: pendingDisputes } = await supabase
    .from('refund_disputes')
    .select('id')
    .eq('status', 'submitted')
    .gt('submitted_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());

  // 3. 알림 조건
  const alertTriggered = (overdueDisputes?.length || 0) > 0 || (pendingDisputes?.length || 0) > 10;

  if (alertTriggered) {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '⚠️ 환불 분쟁 적체 경고',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*48시간 SLA 초과*: ${overdueDisputes?.length || 0}건\n`
                + `*미승인 분쟁 (7일)*: ${pendingDisputes?.length || 0}건\n\n`
                + `신속한 검토가 필요합니다.`
            }
          }
        ]
      })
    });
  }

  return new Response('OK', { status: 200 });
}

Deno.serve(disputeBacklogCheck);
```

### 수동 확인 주기

| 도구 | 확인 주기 | 담당 |
|------|---------|------|
| LiveKit Dashboard | 매일 오전 (접속 시) | 개발자 |
| Supabase Dashboard | 매주 금요일 | 개발자 |
| Cloudflare Analytics | 매주 금요일 | 개발자 |
| Sentry | 이슈 알림 수신 시 즉시 | 개발자 |

---

## Product Analytics Layer (G-178)

이 문서의 기존 대시보드는 운영 안정성 중심이다. 제품 개선에는 별도 이벤트 테이블과 퍼널/코호트 정의가 필요하다.

### 최소 이벤트 스키마

```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  anonymous_session_id TEXT,
  event_name TEXT NOT NULL,
  room_id UUID REFERENCES rooms(id),
  invite_code_hash TEXT,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_name_time ON analytics_events(event_name, created_at DESC);
CREATE INDEX idx_analytics_events_user_time ON analytics_events(user_id, created_at DESC);
CREATE INDEX idx_analytics_events_invite ON analytics_events(invite_code_hash);
```

### 핵심 이벤트

| 이벤트 | 발생 시점 | 주요 properties |
|---|---|---|
| `onboarding_started` | 최초 가입/게스트 시작 | locale, device_type, referrer |
| `onboarding_step_completed` | 역할/장르/권한 단계 완료 | step, elapsed_ms |
| `invite_clicked` | 초대 링크 진입 | invite_code_hash, host_id_hash |
| `greenroom_step_completed` | 얼굴/마이크/최종미리보기 통과 | step, result, error_code |
| `room_joined` | LiveKit 입장 완료 | role, device_type, connection_ms |
| `vgen_prompt_started` | VGEN 프롬프트 입력 시작 | entry_point |
| `vgen_generate_confirmed` | 크레딧 확인 후 생성 확정 | credits, duration_sec |
| `vgen_completed` | 생성 완료/실패 | status, latency_ms, failure_reason |
| `share_link_created` | 녹화/클립 공유 링크 생성 | asset_type, visibility |
| `performance_marker_created` | 공연 중 하이라이트/리허설 marker 생성 | marker_type, source, offset_ms |
| `reaction_burst_detected` | 일정 시간 내 리액션 급증 | count, window_sec, top_reaction |
| `gift_sent` | P2 관객 선물/후원 전송 | target_type, target_id_hash, gift_type, amount_bucket |
| `creator_dashboard_opened` | 방장/극단이 성과 대시보드 조회 | scope, room_id, date_range |
| `external_trigger_received` | P2 Twitch/YouTube 등 외부 이벤트 수신 | provider, trigger_type, mapped_action, allowed |
| `report_submitted` | 신고 제출 | reason, target_type |
| `block_created` | 사용자 차단 | source_surface |

### 퍼널 정의

| 퍼널 | 단계 |
|---|---|
| 첫 방 참여 | `onboarding_started` → `greenroom_step_completed(final_preview)` → `room_joined` |
| 초대 전환 | `invite_clicked` → `onboarding_started` → `room_joined` |
| VGEN 전환 | `vgen_prompt_started` → `vgen_generate_confirmed` → `vgen_completed(status=success)` → `share_link_created` |
| 공연 성과 | `room_joined(role=viewer)` → `reaction_burst_detected` → `performance_marker_created` → `share_link_created` |
| 크리에이터 경제(P2) | `gift_sent` → creator balance hold → payout requested → payout completed |
| 신뢰/안전 | `report_submitted` → admin reviewed → user notified |

### 코호트/리텐션

- D1/D7/D30 retention: 첫 `room_joined` 날짜 기준으로 재방문/재입장 추적.
- Viral coefficient: 초대 링크 생성자 1명당 `invite_clicked`와 `room_joined` 전환 수.
- Creator loop: `vgen_completed` 또는 `recording_completed` 후 24시간 내 `share_link_created` 비율.

### Creator Performance Dashboard (ANA-01)

운영자용 장애/비용 대시보드와 분리된 방장·극단용 제품 대시보드다.

| 카드 | 지표 |
|---|---|
| Audience | unique viewers, peak concurrent viewers, average watch duration |
| Engagement | reactions per minute, reaction burst timestamp, poll participation, chat density |
| Content loop | clip markers, share links, replay views, VGEN shares |
| Rehearsal quality | turn timing misses, overlap count, 10s replay markers |
| Revenue P2 | gifts/tips received, held balance, refundable/chargeback hold |

MVP/P1에서는 집계 쿼리 + JSONB properties로 충분하다. creator payout, subscription, external trigger 분석은 `ECON-*`/`EXT-01` 구현 전까지 빈 카드나 mock 지표를 노출하지 않는다.

---

## APAC Launch Quality Gate (G-179)

일본 런칭 전에는 인프라 리전과 사용자 체감 품질을 분리해서 검증한다.

| 항목 | 통과 기준 | 측정 위치 |
|---|---|---|
| WebRTC 연결 성공률 | 일본 테스트 기기 95% 이상 | LiveKit Dashboard + `room_joined.connection_ms` |
| ICE 실패율 | 5% 미만 | LiveKit/Sentry |
| MediaPipe 시작 성공률 | 기기/브라우저별 90% 이상 | `greenroom_step_completed` |
| 모바일 viewer 입장 | iOS Safari/Android Chrome에서 viewer mode 성공 | Playwright 수동 보강 |
| VGEN 완료 시간 | p95 90초 이하 | `vgen_completed.latency_ms` |

리전 결정은 출시 전 실제 측정값으로 판단한다. Supabase/LiveKit 리전이 일본과 멀다면 APAC 리전 또는 LiveKit Cloud 지역 설정 변경을 검토한다.

---

## 관련 문서

- [[VgenCostAnalysis]] — 모델 단가 상세 (G-118)
- [[COST-ESTIMATE]] — 월별 비용 예상 (G-133)
- [[SecurityPolicies]] §15 — R2 스토리지 쿼터 (G-83)
- [[SecurityPolicies]] §17 — Sentry PII 필터링 (G-125)
- [[INCIDENT-PLAYBOOK]] — 알림 수신 후 대응 절차 (G-145)

---

## 한줄정리

snack-web은 Supabase·LiveKit·Cloudflare·Sentry의 무료 대시보드 4개 + pg_cron 일일 비용 알림으로 운영 모니터링을 구성하며, SQL 쿼리 3개로 VGEN·LiveKit·Supabase 비용을 집계하고 $100 초과 시 Slack 알림을 송신하며, DAU·활성 방·에러율을 실시간 추적할 수 있다.
