---
tags: [spec]
---

# VGEN 생성 단가 분석 (G-118)

> **SSOT**: 이 문서. 크레딧 정책 변경 시 SecurityPolicies.md §12와 함께 갱신.  
> **조사 기준일**: 2026-06-30

---

## §1 모델 단가표 (fal.ai 기준, 720p)

| 모델 | 초당 단가 | 최대 길이 | 5초 | 10초 | 15초 | 30초 | fal.ai 가용 |
|------|---------|---------|-----|------|------|------|----------|
| Seedance 2.0 Fast | $0.2419/초 | 15초 | $1.21 | $2.42 | $3.63 | - | ✅ |
| Seedance 2.0 Standard | $0.3034/초 | 15초 | $1.52 | $3.03 | $4.55 | - | ✅ |
| Seedance 2.5 (예상) | 미공개 (2.0+30~40% 예측) | **30초** | ~$1.70 | ~$3.40 | ~$5.10 | ~$10.20 | ❌ 2026-07 예정 |

1080p는 720p 대비 약 2.25배 추가 비용.

---

## §2 크레딧 단위 설계

**1 크레딧 = 1초 생성** (길이 독립적 과금)

| 생성 | 소요 크레딧 | Seedance 2.0 Fast 원가 |
|------|---------|-----|
| 5초 쇼츠 | 5 credits | $1.21 |
| 10초 클립 | 10 credits | $2.42 |
| 15초 씬 | 15 credits | $3.63 |
| 30초 풀씬 (2.5) | 30 credits | ~$10.20 (예상) |

---

## §3 티어별 월간 비용

| 티어 | 월 기본 크레딧 | 최대 생성 가능 | 플랫폼 원가 | 목표 판매가 |
|------|---------|---------|---------|---------|
| 무료 | 20 credits | 5초×4개 or 10초×2개 | ~$4.84 | $0 (유입용) |
| 기본 | 100 credits | 5초×20개 or 15초×6개 | ~$24.19 | $9.99/월 |
| 프로 | 500 credits | 15초×33개 or 30초×16개 | ~$120.95 | $39.99/월 |

**손익분기 분석**:
- 기본 티어: 원가 $24.19 → $9.99 판매 = **적자** (사용자 획득 투자)
- 프로 티어: $120.95 원가 → $39.99 판매 = **적자** (크레딧 미소진율 30% 가정 시 $84.67 실제 원가, 수익 전환 가능)

→ **장기 모델**: 크레딧 미소진율 + 광고/B2B 라이선스로 수익화.

---

## §4 model_id 파라미터 설계

Edge Function에서 모델을 환경 변수로 선택하되, 하드코딩 금지:

```typescript
// supabase/functions/vgen-generate/index.ts (향후 구현 시)

// 환경 변수 기반 모델 선택 (기본값: Fast)
const VGEN_MODEL_ID = Deno.env.get("VGEN_MODEL_ID") ?? 
  "bytedance/seedance-2.0/fast/text-to-video"

// 모델별 최대 길이 매핑 (API 호출 전 검증)
const MAX_DURATION: Record<string, number> = {
  "bytedance/seedance-2.0/fast/text-to-video": 15,
  "bytedance/seedance-2.0/text-to-video": 15,
  "bytedance/seedance-2.5/text-to-video": 30,  // 2026-07 예정
}

// 사용자 요청 duration 검증
const modelMaxDuration = MAX_DURATION[VGEN_MODEL_ID]
if (!modelMaxDuration || duration > modelMaxDuration) {
  return new Response(
    JSON.stringify({ 
      error: `Duration exceeds model limit (max: ${modelMaxDuration}s)` 
    }),
    { status: 400 }
  )
}

// fal.ai 호출
const result = await fal.subscribe(VGEN_MODEL_ID, {
  input: {
    prompt: promptText,
    duration: Math.min(duration, modelMaxDuration),
  }
})
```

**Supabase Secrets 설정**:
```bash
supabase secrets set VGEN_MODEL_ID="bytedance/seedance-2.0/fast/text-to-video"
```

**Seedance 2.5 전환 시** (2026-07 예정):
```bash
supabase secrets set VGEN_MODEL_ID="bytedance/seedance-2.5/text-to-video"
# 클라이언트 재배포 불필요 — 서버만 갱신
```

---

## §5 Seedance 2.5 전환 체크리스트

- [ ] fal.ai API 모델명 확인 (예: `bytedance/seedance-2.5/...`)
- [ ] 단가 갱신 (이 문서 §1)
- [ ] SecurityPolicies.md §12.3 크레딧 환산율 갱신
- [ ] VgenPanel.md §영상 길이 설정 슬라이더 범위 확장 (max 30초)
- [ ] `VGEN_MODEL_ID` 환경 변수 교체 (배포 전 staging 테스트)
- [ ] 기존 Seedance 2.0 생성물과 호환성 확인 (저장 포맷 동일 여부)
- [ ] 프로 티어 크레딧 재산정 (30초 풀씬 추가로 인한 가치 상승)

---

## §6 관련 문서

- `specs/SecurityPolicies.md §12` — 크레딧 할당·할당량 정책
- `contracts/VgenPanel.md §영상 길이 설정` — UI 파라미터
- `DATA-SCHEMA.md §credit_transactions` — 과금 추적 테이블
- `FEATURE-SPEC.md VGEN-01~12` — 기능 명세
- `state-machines/Vgen.md` — 생성 상태머신

---

## 한줄정리

Seedance 2.0 Fast를 기본값으로 월 100 크레딧 = $24.19 원가 → $9.99 판매 적자 모델이며, Seedance 2.5 출시 시 환경 변수 `VGEN_MODEL_ID` 교체만으로 클라이언트 재배포 없이 전환 가능.
