---
tags: [spec]
---

# VGEN 생성 단가 분석 (G-118)

> **SSOT**: 이 문서. 크레딧 정책 변경 시 SecurityPolicies.md §12와 함께 갱신.  
> **조사 기준일**: 2026-06-30 · **개정**: 2026-07-04 (reference-to-video 전환 + 해상도 가중 크레딧, §4.5)

---

## §1 모델 단가표 (fal.ai 기준)

> **갱신 2026-07-04**: 캐릭터 고정을 위해 reference-to-video로 전환하며 해상도·tier·입력별 실단가를 반영. 값은 구현 직전 fal 페이지로 재확인. 출처: [fal.ai/models/bytedance/seedance-2.0/reference-to-video](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video).

| 모델·tier | 해상도 | 초당 단가 | 5초 | 10초 | 15초 |
|---|---|---|---|---|---|
| Seedance 2.0 **Fast** | 720p | $0.2419/초 | $1.21 | $2.42 | $3.63 |
| Seedance 2.0 **Standard** | 720p | $0.3024/초 | $1.51 | $3.02 | $4.54 |
| Seedance 2.0 **Standard** | **1080p** | $0.682/초 | $3.41 | **$6.82** | $10.23 |
| Seedance 2.0 (비디오 입력 참조 시) | 720p | $0.1814/초 (0.6배) | $0.91 | $1.81 | $2.72 |
| 480p · 4K | 토큰식 | $0.014/1K토큰(≤1080p) · $0.008/1K(4K) | — | 4K 10초 ≈ $15.5 | — |

- **최고 화질 = 1080p(standard)**. Fast는 720p 상한 → 1080p 이상은 non-fast standard tier. 4K는 enum엔 있으나 reference 엔드포인트 지원이 미확정이라 배포 시 실 API로 확정한다.
- 비디오 입력 참조 시 0.6배 할인(이미지 참조엔 미적용). 오디오 생성은 무료.
- Seedance 2.5(30초·4K)는 2026-07 출시 예정, `VGEN_MODEL_ID` 교체로 전환(§5).

---

## §2 크레딧 단위 설계 — 해상도 가중 (2026-07-04 개정)

**1 크레딧 ≈ 720p 1초.** 해상도가 오르면 실단가가 급등(1080p는 720p의 2.8배)하므로 크레딧을 해상도 가중한다. 기존 "1초=1크레딧, 길이·해상도 독립"은 fast 720p 전제였고 reference-to-video 1080p 도입으로 폐기.

| 해상도·tier | 크레딧/초 | 초당 실단가 |
|---|---|---|
| 720p (fast) | 1 credit/s | $0.2419 |
| 720p (standard) | 1.25 credit/s | $0.3024 |
| 1080p (standard) | 3 credit/s | $0.682 |

예) 1080p 10초 = **30 credits**(실비 $6.82) · 720p 5초 = **5 credits**(실비 $1.21).

**MUST NOT**: 해상도를 무시하고 초=크레딧 고정 과금 — 1080p 10초를 10크레딧에 팔면 $6.82 적자.

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

// 환경 변수 기반 모델 선택 (기본값: reference-to-video = 캐릭터 고정, slice1b)
const VGEN_MODEL_ID = Deno.env.get("VGEN_MODEL_ID") ?? 
  "bytedance/seedance-2.0/reference-to-video"

// 모델별 최대 길이 매핑 (API 호출 전 검증)
const MAX_DURATION: Record<string, number> = {
  "bytedance/seedance-2.0/reference-to-video": 15,  // 캐릭터 고정(slice1b 기본)
  "bytedance/seedance-2.0/fast/reference-to-video": 15,  // 720p 상한·저가 반복용
  "bytedance/seedance-2.0/fast/text-to-video": 15,  // slice1 관통(캐릭터 랜덤)
  "bytedance/seedance-2.5/reference-to-video": 30,  // 2026-07 예정
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

// fal.ai 호출 (reference-to-video)
const result = await fal.subscribe(VGEN_MODEL_ID, {
  input: {
    prompt: promptText,
    image_urls: referenceUrls,   // 캐릭터 참조 이미지, 최대 9장 (R2 presign URL)
    aspect_ratio: format,        // "9:16"(쇼츠) | "16:9" | "1:1" ... — 생성 시 네이티브
    resolution,                  // "720p" | "1080p" (§2 해상도 가중 크레딧)
    duration: Math.min(duration, modelMaxDuration),
    generate_audio: true,
  }
})
```

**Supabase Secrets 설정**:
```bash
supabase secrets set VGEN_MODEL_ID="bytedance/seedance-2.0/reference-to-video"
```

**Seedance 2.5 전환 시** (2026-07 예정):
```bash
supabase secrets set VGEN_MODEL_ID="bytedance/seedance-2.5/reference-to-video"
# 클라이언트 재배포 불필요 — 서버만 갱신
```

---

## §4.5 slice1b — reference-to-video 확장 (2026-07-04 결정)

slice1(text-to-video 관통)에서의 확장. **사용자가 자기 캐릭터로 세로 쇼츠를 만들게 한다.**

- **모델**: `text-to-video` → `reference-to-video`. 참조 이미지(캐릭터 시트)로 얼굴·의상·화풍 고정. text-to-video는 매 생성 얼굴이 달라 캐릭터 고정 불가.
- **참조 이미지**: `image_urls` 최대 9장. R2 업로드 → presign → fal 전달. 다각도(정면·측면·전신)일수록 일관성↑. 텍스트가 섞이거나 지나치게 저해상한 조각은 금지(디테일 손실 → 컷마다 얼굴 흔들림). 참조는 픽셀 복제가 아니라 "캐릭터 유지 + 프롬프트대로 새 장면".
- **화면비 네이티브**: 쇼츠(9:16)는 생성 시 `aspect_ratio:"9:16"`로 **바로 세로 출력**. 사후 FORMAT_CONVERTING(별도 crop/resize 잡)은 이미 만든 16:9 자산을 세로로 돌리는 **폴백**으로만 유지한다(state-machines/Vgen.md · contracts/VgenExport.md). 신규 쇼츠는 사후 변환 불필요.
- **해상도**: 720p(fast) ~ 1080p(standard). 최고=1080p. §1·§2 해상도 가중 크레딧 적용.
- **UI (사용자 친화, SSOT: contracts/VgenPanel.md §AI 프롬프트 정제)**: 프리셋 칩 폐기 → **사용자가 개떡같이 자유 입력하면 LLM이 Seedance 카메라시트 프롬프트로 확장**([✨ AI로 다듬기]). 정제 결과는 편집 가능. 참조 이미지 업로드 + 해상도/화면비 선택 포함.
- **프롬프트 정제 LLM**: 얇은 Edge `refine-vgen-prompt`(키 서버 보관·성역). 개발=NVIDIA NIM 무료(build.nvidia.com·OpenAI 호환·40 RPM·**production은 유료 라이선스**), 실서비스=`gpt-4o-mini`(이미 보유·요청당 ≈$0.0002·거의 무비용·production 제약 없음). 둘 다 OpenAI 호환이라 `base_url`·키만 교체 → 개발은 무료로, 런칭 시 갈아끼움.
- **비용 절약**: 프롬프트가 매번 달라 dedup 캐시는 부수적. 대신 ①무료 티어(Jimeng/Dreamina)로 프롬프트·참조 확정 ②반복 튜닝은 저해상·짧게(480p 5초 ≈$0.7 / 720p 5초 $1.21) ③확정본만 1080p 10초($6.82). 프로바이더 교체(BytePlus 직접 등)는 어댑터 재작성 비용이 있어 관통 검증 후로 defer.
- **PoC 실증 (2026-07-04)**: fal 직접 호출로 **참조 1장 → reference-to-video 480p·9:16·5초** 생성 성공(496×864·h264·**오디오 포함**·토끼귀 캐릭터·의상 일치, 실비 ≈$0.70). **확인된 것**: ① reference-to-video는 여러 컷이 담긴 **그리드 콜라주 1장에서도 공통 캐릭터를 추출**(격자·텍스트 아티팩트 없음) → 참조 형태에 관대(단 얼굴 선명·1~3장 클린 컷이 이론상 최적은 유지). ② `aspect_ratio:"9:16"` 네이티브 세로·`generate_audio` 정상. ③ `image_urls`는 fal storage 업로드 URL 또는 공개 URL 필요. 최소 관통(모델·세로·오디오·캐릭터)이 480p 5초 $0.7로 검증됨.
- **남은 것**: `refine-vgen-prompt` Edge(LLM 정제) · R2 참조 업로드 배선 · AI 다듬기 UI · 해상도 가중 크레딧 RPC · 프로덕션 배포 · 1080p 최종 품질 확인.

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

slice1b부터 기본 모델은 캐릭터 고정 `reference-to-video`(참조 `image_urls` ≤9장·`aspect_ratio` 네이티브 세로)이고, 크레딧은 해상도 가중(720p 1·1080p 3 credit/s)이며, 모델·해상도 상향은 `VGEN_MODEL_ID` 교체로 클라이언트 재배포 없이 전환한다.
