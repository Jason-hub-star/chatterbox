---
tags: [guide]
---

# 보안 운영 가이드

> G-149 산출 문서. API 키 로테이션·취약점 스캔·액세스 리뷰 정기 일정.

---

## 보안 운영 일정 요약

| 작업 | 주기 | 담당 | 방법 |
|------|------|------|------|
| API 키 로테이션 | 90일 | 개발자 | 수동 (캘린더 알림) |
| npm 취약점 스캔 | 월 1회 | 개발자 | `npm audit` |
| 의존성 업데이트 | 월 1회 | 개발자 | `npm outdated` + PR |
| 프로덕션 액세스 리뷰 | 분기 1회 | 개발자 | Supabase·LiveKit·Cloudflare 멤버 목록 |
| Supabase RLS 검토 | 분기 1회 | 개발자 | 신규 테이블 RLS 정책 확인 |

---

## 1. API 키 로테이션 (90일 정책)

### 대상 키 목록

| 서비스 | 키 종류 | 저장 위치 | 로테이션 절차 |
|--------|--------|----------|-------------|
| **Supabase** | Service Role Key | Supabase Edge Function Secrets | 대시보드 → Settings → API → Regenerate |
| **LiveKit** | API Key + Secret | Supabase Edge Function Secrets | LiveKit Dashboard → Settings → API Keys → New Key → 구 키 삭제 |
| **fal.ai** | API Key | Supabase Edge Function Secrets | fal.ai Dashboard → API Keys → New Key → 구 키 삭제 |
| **OpenAI** | API Key | Supabase Edge Function Secrets | platform.openai.com → API Keys → Create → 구 키 Revoke |
| **Slack Webhook** | Webhook URL | Supabase Edge Function Secrets | Slack API → Incoming Webhooks → Regenerate |
| **Sentry DSN** | DSN | `.env` (공개 가능, 클라이언트 키) | 필요 시만 교체 |

### 자동화된 키 추적 및 알림 (권장)

수동 캘린더 알림 대신 **api_keys 추적 테이블 + pg_cron** 자동화:

```sql
-- 1. api_keys 테이블 생성
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,    -- 'supabase', 'livekit', 'fal_ai' 등
  key_name TEXT NOT NULL,         -- 'service_role_key', 'api_key' 등
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'active',   -- 'active', 'revoked', 'replaced'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(service_name, key_name, status)
);

-- 2. 기존 키 정보 입력 (예시, 발급일로부터 90일)
INSERT INTO api_keys (service_name, key_name, issued_at, expires_at, status) VALUES
  ('Supabase', 'service_role_key', NOW() - INTERVAL '30 days', NOW() + INTERVAL '60 days', 'active'),
  ('LiveKit', 'api_key', NOW() - INTERVAL '45 days', NOW() + INTERVAL '45 days', 'active'),
  ('fal.ai', 'api_key', NOW() - INTERVAL '20 days', NOW() + INTERVAL '70 days', 'active');

-- 3. pg_cron 자동 알림 (매일 09:00 UTC = 18:00 KST)
SELECT cron.schedule('api-key-rotation-alert', '0 9 * * *', $$
  SELECT
    COALESCE(SUM(
      CASE WHEN expires_at <= NOW() + INTERVAL '7 days' AND status = 'active' THEN 1 ELSE 0 END
    ), 0) as expiring_soon
  INTO expiring_count
  FROM api_keys;
  
  -- Slack 알림 (Edge Function 호출)
  IF expiring_count > 0 THEN
    PERFORM http_post(
      'https://[project-id].functions.supabase.co/functions/v1/alert-key-rotation',
      json_build_object('expiring_count', expiring_count)::text,
      'application/json'
    );
  END IF;
$$);
```

**Slack 알림 메시지 (Edge Function에서 발송):**
```
[API 키 로테이션 알림] 7일 내 만료되는 키 2개

- Supabase service_role_key: 2026-07-08 만료 예정
- LiveKit api_key: 2026-07-06 만료 예정

👉 Slack #security-alerts 또는 console.supabase.co에서 확인하세요.
```

### 캘린더 알림 설정 (대체 방안)

자동화 불가 경우, 서비스별로 90일 반복 캘린더 이벤트 생성:
- **이벤트 제목**: "🔑 [서비스명] API 키 로테이션"
- **알림**: 7일 전 사전 알림 + 당일 알림

### 로테이션 절차 (48시간 병행 운영)

```
1. 신규 키 발급 (서비스 대시보드에서)
   - Supabase: Settings → API → Regenerate
   - LiveKit: Dashboard → Settings → API Keys → New Key
   - fal.ai: Dashboard → API Keys → Create
   
2. Supabase Edge Function Secrets 업데이트 (신규 키로 교체)
   - Supabase Dashboard → Settings → Edge Functions → Secrets
   - 키 이름은 기존과 동일하게 유지 (코드 변경 불필요)

3. Edge Function 재배포
   - supabase functions deploy [function-name]

4. 48시간 병행 운영 (신규 + 구 키 모두 유지)
   - 신규 키로 모든 요청 처리되도록 설정됨
   - 구 키는 서비스 대시보드에서 아직 활성 상태 유지 (삭제 금지)
   - 이 기간 동안 에러 로그 모니터링:
     - Sentry Issues → 401/403 에러 추적
     - MonitoringDashboard.md 지표 확인

5. 에러 0 확인 (48시간 후)
   - SELECT count(*) FROM postgres_logs WHERE error_code IN ('401', '403') AND created_at > NOW() - INTERVAL '48 hours';
   - 401 에러 0건 확인 시 다음 단계 진행
   - 401 에러 있으면 롤백: 구 키로 복원 후 신규 키 재발급 후 다시 시도

6. 구 키 삭제/Revoke (에러 0 확인 후)
   - Supabase: Settings → API → Revoke
   - LiveKit: Dashboard → Settings → API Keys → Delete
   - fal.ai: Dashboard → API Keys → Revoke
   - 삭제 직후 Slack #security-alerts에 완료 보고

7. api_keys 테이블 업데이트
   UPDATE api_keys SET status = 'revoked' WHERE service_name = 'Supabase' AND key_name = 'service_role_key' AND status = 'replaced';
```

**Edge Function Secrets 업데이트:**
```bash
# Supabase CLI 사용 (로컬 터미널)
supabase secrets set FAL_KEY=fal_new_key_here
supabase secrets set LIVEKIT_API_SECRET=new_secret_here

# 확인
supabase secrets list
```

---

## 2. npm 취약점 스캔 (월 1회)

### 실행

```bash
# 취약점 스캔
npm audit

# 자동 수정 가능한 것만 적용
npm audit fix

# 전체 출력 (JSON)
npm audit --json > audit-report.json
```

### 판단 기준

| 심각도 | 조치 |
|--------|------|
| **critical** | 즉시 수정 (당일 PR) |
| **high** | 1주 이내 수정 |
| **moderate** | 다음 월간 업데이트 포함 |
| **low** | 분기 업데이트 포함 |

### 수동 수정이 필요한 경우

```bash
# 특정 패키지만 업데이트
npm install [패키지명]@latest

# 하위 의존성 강제 교체
npm install --save [취약한 패키지]@[안전한 버전]
# 또는 overrides 사용
# package.json:
# "overrides": { "취약한패키지": "^안전한버전" }
```

---

## 3. 의존성 업데이트 (월 1회)

```bash
# 구버전 패키지 확인
npm outdated

# 마이너/패치 버전 자동 업데이트 (Breaking Change 없음)
npx npm-check-updates -u --target minor
npm install

# 업데이트 후 테스트
npm run type-check && npm run test && npm run build
```

**PR 체크리스트:**
- [ ] `npm audit` 통과
- [ ] `tsc --noEmit` 에러 0개
- [ ] `npm run test` 통과
- [ ] `npm run build` 성공
- [ ] Breaking Change 있으면 마이그레이션 가이드 확인

---

## 4. 프로덕션 액세스 리뷰 (분기 1회)

**목적:** 불필요한 프로덕션 접근 권한 제거.

### Supabase

```
1. Supabase Dashboard → Settings → Team
2. 현재 멤버 목록 확인
3. 퇴사자 또는 역할이 바뀐 멤버 제거
4. Service Role Key 접근자 확인
```

### LiveKit Cloud

```
1. LiveKit Dashboard → Settings → Team Members
2. 불필요한 멤버 제거
3. API Key 목록 확인 — 미사용 키 삭제
```

### Cloudflare

```
1. Cloudflare Dashboard → My Profile → Members
2. 불필요한 멤버 제거
3. API Token 목록 확인 — 미사용 토큰 삭제
```

### GitHub

```
1. 레포지토리 → Settings → Collaborators & Teams
2. 불필요한 협업자 제거
3. Secrets & Variables → Actions → 사용되지 않는 시크릿 삭제
```

---

## 5. Supabase RLS 검토 (분기 1회)

새 테이블이 추가될 때마다 RLS가 활성화되어 있는지 확인.

```sql
-- RLS 비활성화된 테이블 확인
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- 결과가 있으면 즉시 RLS 활성화
ALTER TABLE [테이블명] ENABLE ROW LEVEL SECURITY;

-- 각 테이블의 RLS 정책 목록 확인
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**확인 체크리스트:**
- [ ] 모든 `public` 테이블에 `ENABLE ROW LEVEL SECURITY` 적용
- [ ] 각 테이블에 SELECT/INSERT/UPDATE/DELETE 정책 명시
- [ ] `WITH CHECK` 조건이 타 사용자 데이터를 덮지 않는지 확인

---

## 6. 보안 사고 대응 (신속 절차)

### API 키 유출 의심 시

```
1. 즉시 해당 키 Revoke (콘솔에서 삭제)
2. 신규 키 발급 → Supabase Secrets 업데이트 → 재배포
3. Supabase 로그에서 해당 키로 비정상 요청 확인
4. INCIDENT-PLAYBOOK.md §P0 절차 진행
5. 포스트모템: 키 노출 경로 파악 + 재발 방지
```

**유출 경로 확인:**
```bash
# git 이력에서 키 노출 여부 확인
git log -p | grep -E "(SUPABASE_SERVICE|FAL_KEY|LIVEKIT_API_SECRET)" | head -20
```

### 비정상 트래픽 탐지

```sql
-- 단기간 과다 VGEN 요청 탐지 (30분 내 5회 이상)
SELECT user_id, COUNT(*) as requests, MIN(created_at) as first, MAX(created_at) as last
FROM vgen_jobs
WHERE created_at > NOW() - INTERVAL '30 minutes'
GROUP BY user_id
HAVING COUNT(*) >= 5
ORDER BY requests DESC;
```

---

## 초기 체크리스트 (Phase 4 배포 전)

- [ ] 모든 API 키 `.env.example`에만 있고 실제 키는 절대 커밋되지 않음 확인
- [ ] `npm audit` — critical/high 취약점 0개
- [ ] `.gitignore`에 `.env*` 포함 확인
- [ ] Supabase Service Role Key가 클라이언트 코드에 없음 확인 (`grep -r "service_role" src/`)
- [ ] Sentry `beforeSend` PII 필터 작동 확인 (SentryConfig.md §beforeSend)
- [ ] RLS 전 테이블 활성화 확인 (위 SQL 쿼리 실행 → 결과 0행)
- [ ] API 키 로테이션 캘린더 알림 설정 완료 (키 발급일 기준 +90일)
- [ ] 프로덕션 접근자 최소화 확인 (Supabase/LiveKit/Cloudflare 멤버)

---

## 관련 문서

- [[SecurityPolicies]] — RLS·PII·Rate Limit 전체 (G-83~G-94)
- [[SentryConfig]] — Sentry 환경별 설정 (G-126)
- [[INCIDENT-PLAYBOOK]] — 인시던트 대응 (G-145)
