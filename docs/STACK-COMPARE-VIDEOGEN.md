---
tags: [guide]
---

<!--
  2026-06-26 - 협업 AI 영상생성 메인뷰 조사 종합 (Haiku 3종 수집 → Opus 검수·종합).
  분류 라벨: 조사 (검증 일부). 종합되면 ARCHITECTURE-B §영상생성으로 흡수, 카드는 FEATURE-SPEC VGEN-*로 반영.
  짝: FEATURE-SPEC.md(VGEN-*), PLATFORM-ARCHITECTURE.md, PLATFORM-SECURITY-RISKS-B.md(지뢰 추가).
-->

# STACK-COMPARE-VIDEOGEN — 협업 AI 영상생성 메인뷰

## BLUF

방의 **메인뷰를 "고정 VOD"에서 "모두가 함께 프롬프트를 짜 생성하는 AI 클립"으로 확장**한다. 기술적으로 가능하나, **새 백엔드 축(비동기 잡·크레딧·모더레이션)** 없이는 안 된다. 결정 요약:

| 축 | 결정 | 근거 |
|---|---|---|
| **영상 API** | **공급사 어댑터** + 1차 **Seedance 2.0(fal.ai 경유)**, 폴백 Kling·Luma Ray3.14·Veo3.1 | 주인님 지정 Seedance + 공간 변동성 큼(Sora 종료가 증명) → 하드코딩 금지 |
| **오케스트레이션** | **Cloudflare Workflows**(durable, webhook 대기) | Supabase Edge는 CPU 2s·월클럭 400s로 수분 잡 불가 |
| **비용방어** | 프롬프트해시 R2 dedup + 크레딧/쿼터 3층 | 초당 과금·협업 트리거 = 비용폭탄 위험 |
| **모더레이션** | OpenAI Moderation(무료) 프롬프트 사전 + 프레임 사후 | 협업 프롬프트 유해물 책임 |
| **협업 프롬프트** | LiveKit Text Streams + 앱단 LWW(섹션분할) | CRDT 라이브러리 0개 추가 |
| **녹화(더빙)** | 운영 = LiveKit Egress / 보조 = 클라 MediaRecorder | 영상→캔버스 텍스처→captureStream 한 방 |

---

## 1. 흐름 (소스 교체형 메인뷰)

```
협업 프롬프트(섹션별 공동작성) ─▶ [1인 트리거]
  ─▶ Edge Function: 입력검증 + 크레딧 게이트 + OpenAI Moderation(프롬프트)
  ─▶ Cloudflare Workflow: 공급사 API 호출(키 서버보관) → webhook 대기(폴백 폴링)
       └▶ 완료 → 영상 다운로드 → 프레임 샘플 사후 모더레이션 → R2 업로드(key=promptHash)
  ─▶ LiveKit reliable 브로드캐스트: "생성중 40%" → "완료 + 서명URL"
  ─▶ 전원 동시 로드(메인뷰, 타임스탬프 동기)
  ─▶ 영상 위 음성 더빙 녹화(Egress 서버합성)
```

`ROOM-01`(메인뷰)을 **소스 플러그형**으로 재정의: ⓐ 미리만든 CDN VOD ⊕ ⓑ AI 생성 클립. 둘 다 같은 타임스탬프 동기 엔진을 씀.

---

## 2. 영상생성 API 비교 (2026 H1)

> ✅ **2차 재조사로 검증 완료**(출처 URL 동반): Ray 3.14 실재(lumalabs.ai/news/ray3_14), Sora 2 API 9/24/26 종료 확정(OpenAI docs), Seedance 공식 국제 API 3/15/26 중단(TechCrunch) + **fal.ai로 2.0 사용 가능**(fal.ai/seedance-2.0), Seedance 2.5 7월 출시 예정. 가격은 구현 직전 fal.ai 페이지로 최종 확인.

| 공급사 | API 경로 | 입력 | 길이 | 가격(초당) | async | 상업권 | 비고 |
|---|---|---|---|---|---|---|---|
| ★ **Seedance 2.0** | **fal.ai**(BD 정식파트너). 공식 BytePlus 국제 API는 3월 중단 | T2V·I2V·멀티모달(img9+vid3+aud3) | 15s | **$0.15(480p)~$0.30(720p)** | **poll만**(webhook 미확인) | 전 티어·워터마크無(유료) | 주인님 지정. 네이티브 오디오. ⚠️헐리우드 소송 |
| **Seedance 2.5** | (예정) | T2V·I2V | 30s·4K | 미정 | — | — | **7월 초 출시 예정 — 아직 불가** |
| **Kling 3.0/Turbo** | 공개 | T2V·I2V | 3–15s | $0.035~0.075 | webhook+poll | 전 티어 | 네이티브 오디오+립싱크, 中벤더 |
| **Luma Ray 3.14** | 공개 | T2V·I2V·V2V | ~18s | ~$0.08 | webhook+poll | Standard+ | 美벤더, 1080p, 오디오 없음 |
| **Google Veo 3.1** | 공개(Gemini) | T2V·I2V·extend | 4–8s | $0.20~0.40 | poll | Gemini API | 네이티브 오디오, 4K, 지연변동 큼 |
| **Minimax Hailuo** | 공개 | T2V·I2V | 6–10s | 크레딧제 | job+poll | API 티어 | 中벤더 |
| ~~Sora 2~~ | — | — | — | — | — | — | **9/24/26 종료 확정 — 채택 금지** |

### 추천 — 주인님 지정 Seedance 우선
1. ★ **Seedance 2.0 (fal.ai)** — 주인님 선택. 멀티모달·네이티브 오디오·워터마크無·예측가능 가격. **2.5(30s·4K)는 7월 출시 시 fal.ai로 마이그레이션.**
2. **폴백 Kling 3.0** — 최저가·빠름·네이티브 오디오. Seedance 소송리스크 발현 시 즉시 대체.
3. **폴백 Luma Ray 3.14 / Veo 3.1** — 화질·오디오·美/Google 벤더 안정성.

### Opus 판단: 공급사 어댑터 (성역)
- 이 시장은 **분기 단위로 모델이 뜨고 진다**(Sora 종료·Seedance 공식API 중단이 증명). 특정 SDK 하드코딩은 부채.
- **`VideoGenProvider` 인터페이스**(submit/poll/cancel/cost 추정)로 추상화. **MVP는 fal.ai 1개 통합** = Seedance 2.0 즉시 + Kling/Luma/Pika 등 다수 모델 동시 접근 → Seedance가 소송으로 내려가도 코드 한 줄로 폴백. **이게 Seedance를 쓰면서 리스크를 막는 정답.**

---

## 3. 백엔드 — 비동기·비용·모더레이션

### 3.1 오케스트레이션: Cloudflare Workflows
| 실행기 | CPU | 월클럭 | 수분 잡 적합 |
|---|---|---|---|
| Supabase Edge Fn | CPU 2s | 400s(유료)/150s(무료) | ✗ (요청-응답만) |
| CF Worker(맨) | 30s~5min | I/O 무제한 | △ |
| **CF Workflows**(GA) | step당 30s(최대 5분) | **인스턴스 수명 무제한·sleep중 쿼터 미차감**, 동시 50,000(유료) | **✓** |

- ⚠️ **Seedance(fal.ai)는 webhook 없이 polling만** → Workflow가 **step마다 5–10초 간격 poll**(잠들었다 깨기 반복)로 완료 대기. webhook형 공급사(Kling)면 콜백 대기로 더 저렴.
- ⚠️ **스택 추가 결정**: 우리는 현재 CF Pages+R2만 씀. 이건 **CF Workers/Workflows 도입**을 뜻함. 대안은 Supabase `pgmq`+pg_cron 일원화지만, 수분 대기·동시성에서 Workflows가 정직. **→ Workflows 채택, Supabase는 auth/DB/RLS/Realtime 폴백 유지.**
- ✅ 한도 수치 검증완료(CF Workflows limits docs, Supabase functions/limits).

### 3.2 비용 방어
- **dedup**: `promptHash = SHA256({prompt, model, settings})`(user/room 제외) → R2 `videos/{hash}.mp4`. 캐시 히트면 0원 즉시 전달. 같은 프롬프트 50회 = 1회 과금.
- **크레딧/쿼터 3층**: ①유저 월 크레딧(예 1,000/월) ②방당 동시 잡 ≤3 ③유저 분당 토큰버킷(2/min). 게이트는 생성 트리거 전 Edge에서.
- ⚠️ **에러 응답은 캐시 금지**(재시도 허용).
- **R2 서명URL 주의**: 기본 도메인은 인증헤더 때문에 CDN 캐시 안 됨 → **커스텀 도메인 바인딩** 시에만 엣지 캐시. 만료 7일 권장(idempotency TTL과 일치).

### 3.3 모더레이션
- **OpenAI Moderation API 무료**(omni-moderation, 텍스트+이미지) — ✅ 검증완료. 프롬프트 **사전** + 생성 프레임 5장 샘플 **사후**. 플래그 시 격리·미전달·관리자 알림.
- ⚠️ Seedance 자체도 실인물·저작권캐릭터·폭력 필터 내장 → **오리지널 버튜버 캐릭터는 통과**. 단 실제 배우 얼굴을 레퍼런스로 넣으면 얼굴필터 트리거 가능.

### 3.4 상태 브로드캐스트
- LiveKit **reliable**(SCTP, 순서보장) 데이터 메시지로 잡 진행/완료 전파. lossy 아님(순서 중요).
- ⚠️ 입장 전환 중 참가자는 reliable 패킷 놓칠 수 있음 → **5초 버퍼 후 replay**. 메시지 <16KB 가정(미검증).

---

## 4. 협업 프롬프트 (0 의존성)

- **CRDT 라이브러리 추가 안 함**(Yjs 18KB/Automerge 320KB). 이미 가진 **LiveKit Text Streams**(보장전달·청킹·ACK) + 앱단 **Last-Write-Wins**.
- 프롬프트를 **섹션 분할**(장면/행동/캐릭터/톤)해 섹션별 `{content, ts, userId}` LWW → 충돌 최소.
- 선택: **투표/합의 모드**(섹션안 제안 → 👍/👎 5초 집계 → 우세안 라이브).

---

## 5. 녹화·더빙 (설계 키스톤)

- **핵심 제약**: 생성영상을 **별도 `<video>` MediaStream으로 합치면 캔버스와 desync**. 반드시 **클립을 PixiJS 캔버스에 텍스처로 그려 넣고 `canvas.captureStream(30)` 한 방으로 캡처**. → 우리 "단일 WebGL 캔버스" 구조와 정합.
- ⚠️ 클립이 R2/외부 CDN이면 **CORS origin-clean** 필요(아니면 captureStream `SecurityError`) — 기존 COOP/COEP 계열 이슈.
- 오디오: 마이크 + 영상 오디오를 Web Audio `MediaStreamDestination`으로 믹스 → 캔버스 비디오트랙과 합쳐 MediaRecorder.
- 코덱: Chrome/FF = `webm;vp9,opus`, **Safari = mp4/h264만** → `isTypeSupported` 분기.
- **운영 권장 = LiveKit Egress RoomComposite**(서버 헤드리스 합성, 자동 싱크, 클라부하 0, R2 출력). **보조 = 클라 MediaRecorder**(즉시 저장). **ffmpeg.wasm(32MB)은 탑재 안 함.**
- ✅ **Egress 가격 검증완료**: 영상 **$0.02/분**, 오디오 $0.005/분(Build 60분 무료, Scale는 $0.015/분). 출처 livekit.com/pricing.
- ROOM-13(인앱 녹화)과 통합 — VGEN-07이 그 특화 케이스.

---

## 6. 새 지뢰 (SECURITY-RISKS-B에 추가)

| ID | 지뢰 | 완화 |
|---|---|---|
| **L6-비용** | 협업 무한 트리거 × 초당 과금 | 크레딧 3층 + dedup + spend cap |
| **L7-지연** | 30s~수분, 무대 못 막음 | Workflows 비동기 + "생성중" 공유상태 |
| **L8-모더레이션** | 협업 프롬프트 유해물 책임 | 사전+사후 모더레이션, 격리 |
| **L9-라이선스** | 공급사별 상업·재배포권 상이 | 유료 티어 + 약관 확인, 녹화물 C2PA 고지 |
| **L10-CORS녹화** | 외부 클립 captureStream 차단 | origin-clean(CORS 헤더) + 캔버스 텍스처 합성 |
| **L11-공급사 종료** | Sora 종료·**Seedance 헐리우드 소송**처럼 모델 증발 | **provider 어댑터(fal.ai)** → 코드 한 줄로 Kling/Luma 폴백 |
| **L12-Seedance 저작권** | 디즈니·소니 등 소송 진행 → 오프라인 가능, 학습데이터 IP 논란 | **오리지널 캐릭터만 생성**(라이선스 IP 금지) + C2PA 메타데이터 보존 |

---

## 7. 미해결·검증 대기

- **Seedance 2.0 PoC**: fal.ai 키 발급 → 15s 클립 실생성 비용·지연 실측. **2.5는 7월 출시 모니터링** 후 마이그레이션.
- CF Workflows 도입 = 인프라 1축 추가(운영·비용) — ARCHITECTURE-B 반영 필요.
- fal.ai webhook 지원 여부(현재 polling만 확인), C2PA 워터마크 영속성, fal.ai SLA/데이터 잔류정책 — 계약 전 확인.
- ✅ 검증완료: Sora 종료(9/24/26)·Ray 3.14 실재·Egress 가격·Moderation 무료·CF/Supabase 한도·Seedance fal.ai 경로.
