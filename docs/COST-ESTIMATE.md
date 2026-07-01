---
tags: [hub]
---

# 인프라 비용 추정 및 스케일링 전략

> G-133 산출 문서. 조사일: 2026-06-30 기준 공식 요금.

## 서비스별 요금표

| 서비스 | 플랜 | 기본료/월 | 종량제 단가 |
|--------|------|----------|-----------|
| **Supabase** | Pro | $25 | MAU 초과 $0.00325/MAU · 스토리지 초과 $0.125/GB |
| **LiveKit Cloud** | Ship | $50 | WebRTC $0.0005/분(150K분 초과) · Egress $0.001/분(600분 초과) |
| **fal.ai Seedance 2.0** | Fast | — | **$0.2419/초** (생성 영상 길이 기준) |
| **OpenAI gpt-4o-transcribe** | — | — | $0.006/분 |
| **Cloudflare R2** | Standard | — | $0.015/GB·월 · Class A $4.50/백만req · Class B $0.36/백만req · egress 무료 |
| **Vercel Pro** | Pro | $20 | — |
| **Cloudflare Pages** | Free | — | — |

---

## DAU별 월 비용 추정

### 가정

| 항목 | 값 |
|------|---|
| 방 평균 세션 길이 | 60분 |
| VGEN 생성 평균 | 5초 |
| 음성 더빙 평균 | 3분 |
| 녹화 파일 평균 | 50MB |

### DAU 100 (소규모)

| 가정 항목 | 값 |
|----------|---|
| 동시접속 평균 | 10명 |
| 일 방 개수 | 5개 |
| VGEN 생성 | 일 10회 (월 300회 × 5초 = 1,500초) |
| 더빙 | 일 5회 |

| 서비스 | 계산 | 월 비용 |
|--------|------|--------|
| Supabase Pro | 기본료 | $25 |
| LiveKit Cloud | 기본료 + Egress 150회×10분 = 1,500분 (600분 초과 × $0.001) | $50.90 |
| fal.ai Seedance | 1,500초 × $0.2419 | $363 |
| OpenAI Whisper | 150회 × 3분 × $0.006 | $2.70 |
| Cloudflare R2 | 스토리지 + 요청 소량 | $8 |
| Vercel Pro | 기본료 | $20 |
| **합계** | | **$469** |

### DAU 1,000 (성장기)

| 가정 항목 | 값 |
|----------|---|
| 동시접속 평균 | 80명 |
| 일 방 개수 | 30개 |
| VGEN 생성 | 일 100회 (월 3,000회 × 5초 = 15,000초) |
| 더빙 | 일 30회 |

| 서비스 | 계산 | 월 비용 |
|--------|------|--------|
| Supabase Pro | 기본료 | $25 |
| LiveKit Cloud | 기본료 + Egress 900회×10분 | $58 |
| fal.ai Seedance | 15,000초 × $0.2419 | $3,629 |
| OpenAI Whisper | 900회 × 3분 × $0.006 | $16 |
| Cloudflare R2 | ~500GB × $0.015 | $46 |
| Vercel Pro | 기본료 | $20 |
| **합계** | | **$3,794** |

### DAU 10,000 (스케일)

| 가정 항목 | 값 |
|----------|---|
| 동시접속 평균 | 600명 |
| 일 방 개수 | 200개 |
| VGEN 생성 | 일 800회 (월 24,000회 × 5초 = 120,000초) |
| 더빙 | 일 200회 |

| 서비스 | 계산 | 월 비용 |
|--------|------|--------|
| Supabase Pro | 기본료 (MAU 100K 한도 내) | $25 |
| LiveKit Cloud | 기본료 + WebRTC 360K분(초과 210K분 × $0.0005) + Egress | $214 |
| fal.ai Seedance | 120,000초 × $0.2419 | $29,028 |
| OpenAI Whisper | 6,000회 × 3분 × $0.006 | $108 |
| Cloudflare R2 | ~3,000GB × $0.015 + 요청 | $304 |
| Vercel Pro | 기본료 | $20 |
| **합계** | | **$29,699** |

---

## 핵심 비용 드라이버

**fal.ai Seedance 2.0가 전체 비용의 77~90%** (DAU별 상이).

```
DAU 1,000 기준 비용 분해:
  fal.ai:     $3,629  (95.7%)
  LiveKit:    $58     (1.5%)
  R2:         $46     (1.2%)
  Supabase:   $25     (0.7%)
  OpenAI:     $16     (0.4%)
  Vercel:     $20     (0.5%)
```

**결론**: VGEN 생성 초 수가 월 비용을 결정한다. DAU보다 1인당 생성 횟수·길이가 중요.

---

## 손익분기 분석

### 크레딧 플랜 기반 (현재 모델)

- **1 크레딧 = Seedance 2.0 Fast 1초 생성** (VgenCostAnalysis.md §2 참조)
- **월 100 크레딧 플랜 = $10/월** (목표 단가)

```
DAU 1,000 기준:
  월 비용:       $3,794
  VGEN 비용:     $3,629 (95.7%)
  
  크레딧 가격:   $0.2419/크레딧 (원가)
  목표 마진:     30%
  → 크레딧 단가: $0.2419 / 0.7 = $0.346/크레딧
  
  월 100 크레딧 플랜 적정 가격: $34.6/월
  (현재 $10 목표 대비 3.5배 높음)
```

**선택지**:
1. 가격 인상: 월 100 크레딧 → $30~40
2. 크레딧 절감: 생성 횟수·길이 제한 강화 (일 3회, 최대 10초)
3. 모델 전환: Seedance 2.0 Standard (-40% 단가)

---

## 비용 제어 전략

### 즉시

- [ ] VGEN 일일 제한: 사용자당 3회 (Feature Flag `VGEN_DAILY_LIMIT: 3`)
- [ ] 최대 생성 길이: 10초 (1크레딧 = 10원가 $2.419, 허용 가능)
- [ ] Feature Flag `VGEN_ENABLED`: 기본값 false, 운영 승인 후 true. Edge Function에서 서버측 재검증 필수

### 1개월 내

- [ ] Seedance 2.0 Standard 모드 A/B 테스트 (단가 40% 절감 예상)
- [ ] fal.ai 선불 크레딧 $500 구매 (볼륨 할인 가능성 확인)
- [ ] 생성 캐싱: 동일 프롬프트 결과물 재활용 (R2 저장 후 URL 반환)

### 3개월 내

- [ ] 구독 플랜 단가 재설계 (위 손익분기 분석 반영)
- [ ] 생성 마켓플레이스: 공개 작품 재구매 옵션 (fal.ai 요청 20% 감소 목표)
- [ ] Whisper 로컬 모델 파일럿 (OpenAI 비용 제거, 레이턴시 트레이드오프)

---

## Japan Pricing & Credit UX Readiness (G-172, G-177)

일본 출시 준비는 단순 일본어 번역이 아니라 가격 표시·결제 복구·크레딧 소비 통제까지 같은 화면에서 설명되어야 한다. 아래 항목은 출시 전 법무/결제사 검토가 필요한 로드맵이며, 현재 단가표의 확정 가격이 아니다.

### 일본 가격/결제 체크리스트

- [ ] JPY 가격표: USD/KRW 기준 가격을 JPY로 표시하고, 환율 변동 시 가격 고정 주기를 정한다.
- [ ] 현지 결제 후보 조사: Stripe 지원 범위, 편의점 결제, PayPay, carrier billing, Apple/Google 인앱결제 필요 여부를 비교한다.
- [ ] 세금/영수증: 소비세 표시, 영수증 이메일, 법인 결제용 청구서 요구를 분리한다.
- [ ] 무료 체험 종료: "무료 크레딧이 끝났습니다" 화면에서 남은 기능과 유료 전환 가치를 같이 보여준다.

### 크레딧 소비 통제 UX

| 통제 | 기본값 | 사용자 설명 |
|---|---|---|
| 일일 한도 | 사용자당 3회 | 과금 폭주 방지, 설정에서 낮출 수 있음 |
| 방별 한도 | 방당 10회 | 호스트가 방 비용을 예측할 수 있게 함 |
| 1회 생성 한도 | 최대 10초 | 생성 전 예상 크레딧과 예상 원가를 보여줌 |
| 예산 알림 | 80% / 100% | 인앱 토스트 + 이메일, 추후 푸시 |

### 환불/폐기 정책 초안

- 생성 전 취소: 크레딧 차감 없음.
- 생성 실패: 자동 환급하고 `credit_transactions.reason = 'vgen_failed_refund'`로 남긴다.
- 생성 결과 폐기: 정책상 1회 재시도 또는 부분 환급 중 하나를 A/B 테스트한다.
- 결제 실패: 카드 재시도, 다른 결제수단, 무료 기능 계속 사용 경로를 같은 모달에서 제공한다.

### 사용 내역 UI

`credit_transactions`는 사용자에게도 보여줘야 한다. 최소 컬럼은 시간, 방 이름, 액션, 사용/환급 크레딧, 생성물 링크, 실패/환급 사유다.

### Creator Economy P2 Guardrails (ECON-01~03)

관객 선물/후원은 단순 크레딧 구매와 다르다. 돈이 창작자에게 귀속되는 순간부터 payout, 세금, 환불, chargeback, 미성년자 보호가 모두 붙는다.

| 항목 | P2 구현 전 결정 |
|---|---|
| Gift/tip | 플랫폼 크레딧으로 보낼지, 현금성 포인트로 분리할지 결정 |
| Creator balance | `available`, `pending`, `refundable_hold`, `chargeback_hold` 분리 |
| Platform fee | 고정 수수료/비율 수수료/무료 프로모션 범위 결정 |
| Payout | KYC, 최소 지급액, 지급 주기, 일본 세금/원천징수 검토 |
| Minor safety | 미성년자 gift 수신/송신 제한, 보호자 동의 필요 여부 |

ponytail: ECON-01은 먼저 무대 효과 + 감사 메시지 mock으로 검증하고, 실제 지급 ledger는 결제/법무 결정 후 만든다.

---

## 확장성 병목 및 포화점 (DAU별)

이 섹션은 DAU 성장에 따라 인프라 포화 신호를 조기에 감지하고 확장 계획을 세우기 위한 지표다.

### DAU 1,000 ~ 5,000 범위

| 지표 | 임계값 | 현재 추정 | 포화 시그널 | 대응 방안 |
|------|--------|---------|---------|---------|
| **Supabase Realtime 채널 수** | 10,000 채널/프로젝트 | 50~200 (방별 1~2 채널) | 채널 구독 실패 또는 지연 > 5초 | 채널 설계 최적화 (room + global 2개 사용) |
| **Supabase 데이터베이스 연결 풀** | 20 동시 연결 (Pro 기본) | 5~10 동시 | 연결 풀 > 70% 점유율 | Pro → Business 업그레이드 또는 연결 수 최적화 |
| **LiveKit TURN 릴레이 점유율** | 50% 권장 / 85% 이상 위험 | 15~25% (대부분 직접 연결) | 패킷 손실 > 2% 또는 ICE 실패율 > 5% | TURN 서버 추가 또는 지역별 배포 |
| **LiveKit 월 WebRTC 분당 요금** | $0.0005/분 (초과분) | 1,000분 = $0.50/월 | 월 300K분 초과 (약 $150) | Standard 모드 전환 또는 비트레이트 자동 조절 |
| **Cloudflare Pages 빌드 시간** | 3분 이내 권장 | 1~2분 | 빌드 > 5분 또는 재시작 빈도 증가 | 빌드 최적화 (bundle 분석, 의존성 정리) |
| **R2 월 egress 트래픽** | 월 100GB 이상 시 비용 검토 | 5~20GB | 월 500GB 초과 (약 $7.50) | vgen 결과물 캐싱 또는 CDN 확산 |
| **fal.ai VGEN API 응답 시간 P95** | 15초 이내 | 8~12초 | P95 > 20초 또는 타임아웃 증가 | 모델 대기열 최적화 또는 Standard 모드 전환 |

### DAU 5,000 ~ 10,000 범위

| 지표 | 임계값 | DAU 5K 추정 | DAU 10K 추정 | 포화 시그널 | 대응 방안 |
|------|--------|---------|---------|---------|---------|
| **Supabase 데이터베이스 크기** | 100GB Pro 한도 | 2~5GB | 10~30GB | 크기 > 80GB 또는 쿼리 성능 저하 | 아카이브 정책 수립 (구 방·트랜스크립트) |
| **Supabase MAU 한도** | 100K MAU (Pro) | 5K~10K MAU | 15K~25K MAU | 자동 요금 청구 시작 | Enterprise 요금제 협상 또는 구독 모델 변경 |
| **LiveKit 동시 방 수** | 50개 권장 | 20~30개 | 40~60개 | 동시 방 > 85% 또는 새 방 생성 지연 | LiveKit 셀프호스팅 또는 지역별 인스턴스 분산 |
| **LiveKit 월 총 비용** | $500 기준 | $200~350 | $500~1000 | 월 비용 > $1000 | 셀프호스팅 전환 ($50 → ~$200 고정 월간) |
| **Cloudflare R2 월 비용** | $30 기준 | $10~20 | $50~100 | R2 비용 > $150 | 콘텐츠 정책 수립 (자동 삭제, 압축) 또는 AWS S3 전환 검토 |
| **fal.ai VGEN 월 비용** | $3000 기준 | $1000~2000 | $3000~5000 | 월 비용 > $5000 | Standard 모드 A/B 테스트 또는 모델 경량화 |
| **전체 인프라 월 비용** | — | $1500~2000 | $4000~6000 | 월 > $10,000 | 가격 협상 또는 플랫폼 경제 모델 도입 (크레딧 판매) |

### DAU 10,000+ 범위

| 지표 | 권장 대응 |
|------|---------|
| **Supabase Pro 한도 도달** | Enterprise 요금제 협상 (커스텀 연결 풀, MAU 무제한) |
| **LiveKit Cloud 비용 > 월 $2000** | 셀프호스팅 또는 하이브리드 (Cloud + 자체 TURN 서버) 전환 |
| **fal.ai VGEN 월 비용 > 월 $10,000** | 모델 경량화, Standard 모드 검증, 또는 대체 모델 평가 |
| **R2 egress > 월 1TB** | AWS S3 + CloudFront 또는 다중 리전 에지 캐싱 검토 |
| **데이터베이스 크기 > 200GB** | 읽기 복제본, 파티셔닝, 또는 시계열 DB 분리 (녹화 메타) |
| **Realtime 채널 구독 지연** | 채널 계층화 (room-level 소규모 + 글로벌 대규모 분리) |

---

## 스케일 시 재검토 체크리스트

| DAU 도달 | 검토 항목 | 담당 | 대상 문서 |
|---------|---------|------|---------|
| 1,000 | fal.ai Standard vs Fast A/B 테스트, 구독 단가 재설계 | 비용/제품 | COST-ESTIMATE.md |
| 5,000 | LiveKit Cloud 셀프호스팅 검토, Realtime 채널 설계 최적화 | 인프라 | MonitoringDashboard.md + 아키텍처 |
| 10,000 | Supabase Pro → Enterprise 협상, fal.ai 볼륨 할인 협상 | 비용/인프라 | COST-ESTIMATE.md + 계약 |
| 10,000+ | 멀티 리전 배포, 데이터 아카이빙, 플랫폼 경제 모델 도입 | 제품/인프라/비용 | PROJECT-STATUS.md → Phase 라벨 |

---

## 비용 모니터링 쿼리 (Supabase)

### 일별 VGEN 생성 비용 추정

```sql
-- 일별 VGEN 생성 비용 추정
SELECT
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS requests,
  SUM(duration_sec) AS total_sec,
  SUM(duration_sec) * 0.2419 AS estimated_usd
FROM vgen_jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;
```

### 일별 VGEN 비용 급증 자동 알림

일 예산 임계값(예: $100) 초과 시 자동으로 Slack 알림 + 필요시 VGEN_ENABLED 플래그 비활성화:

**pg_cron 스케줄 작업 (매시간 체크):**

```sql
-- 1. cron 작업 생성 (매시간 실행)
-- Supabase 대시보드 > SQL Editor 또는 supabase CLI

SELECT cron.schedule(
  'check-daily-vgen-budget',
  '0 * * * *',  -- 매시간 0분 (UTC)
  $$
  SELECT 
    CASE 
      WHEN (
        SELECT COALESCE(SUM(duration_sec) * 0.2419, 0)
        FROM vgen_jobs
        WHERE DATE(created_at) = CURRENT_DATE
      ) > 100 THEN
        -- Slack webhook 호출 (Edge Function 경유)
        http_post(
          'https://' || current_setting('app.webhook_url'),
          '{"text": "⚠️ Daily VGEN cost exceeded $100", "channel": "#alerts"}'::jsonb
        )
      ELSE
        NULL
    END;
  $$
);

-- 2. pg_cron 확인
SELECT * FROM cron.job;
```

**또는 Edge Function 방식 (권장):**

```typescript
// supabase/functions/check-daily-vgen-budget/index.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  // 매일 08:00 UTC에 트리거 (GitHub Actions 또는 external cron 사용)
  
  // 1. 어제 VGEN 비용 계산
  const { data, error } = await supabase
    .from('vgen_jobs')
    .select('duration_sec')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .lt('created_at', new Date().toISOString())

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const totalCost = (data || [])
    .reduce((sum, job) => sum + (job.duration_sec || 0), 0) * 0.2419

  const DAILY_BUDGET = 100 // USD
  
  if (totalCost > DAILY_BUDGET) {
    // 2. Slack 알림 전송
    const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL')!
    await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `⚠️ Daily VGEN cost exceeded budget`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Daily VGEN Cost Alert*\nEstimated cost: $${totalCost.toFixed(2)}\nBudget: $${DAILY_BUDGET}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '_Consider disabling VGEN_ENABLED flag or raising budget._',
            },
          },
        ],
      }),
    })

    // 3. 비용 계속 초과 시 VGEN_ENABLED 플래그 자동 비활성화 (선택)
    if (totalCost > DAILY_BUDGET * 1.5) {
      await supabase
        .from('app_config')
        .update({ value: { enabled: false } })
        .eq('key', 'VGEN_ENABLED')
      
      console.log('❌ VGEN_ENABLED disabled due to budget overrun')
    }
  }

  return new Response(JSON.stringify({ status: 'ok', dailyCost: totalCost }))
})
```

**GitHub Actions로 매일 트리거:**

```yaml
# .github/workflows/check-vgen-budget.yml
name: Check Daily VGEN Budget

on:
  schedule:
    - cron: '0 8 * * *'  # 매일 08:00 UTC

jobs:
  check-budget:
    runs-on: ubuntu-latest
    steps:
      - name: Invoke budget check function
        run: |
          curl -X POST https://<project>.supabase.co/functions/v1/check-daily-vgen-budget \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json"
```

**예상 결과:**
- 일 비용이 $100 초과 → Slack #alerts 채널에 알림
- 1.5배($150) 초과 → VGEN_ENABLED 자동 false (재활성화는 수동으로)
