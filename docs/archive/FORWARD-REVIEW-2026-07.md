---
tags: [review]
---

<!--
  FORWARD-REVIEW-2026-07 — 착수 전 향후취약점·미리설계 seam 리뷰 (조사/설계)
  방법: Haiku 8병렬 스캔(섹션별 미래리스크 씨앗) → Fable 4클러스터 리뷰 → Opus 충돌검증(원본직접) + Haiku 4 외부조사.
  산출: 향후 취약점 우선순위 · 미리 설계할 seam(NOW/DEFER/CONFLICT) · 외부조사 결론 · Phase1 착수전 잠글 것.
  액션 항목은 GAP-MATRIX 21차 분석(G-268~G-279)로 등록. 이 문서는 그 근거·상세.
  Created: 2026-07-02
-->

# FORWARD-REVIEW 2026-07 — 향후 취약점 · 미리 설계할 seam

> **판정(BLUF):** 설계 문서는 P0 보안 게이트·RLS·상태머신까지 촘촘하다. 남은 위험은 코드가 아니라 **①경제 지속성 ②실측 안 한 성능 가정 ③법무(일본 미성년·GDPR) ④1인 운영 확장** 네 축이며 "설계로는 못 닫는 것"들이다. 미리 설계할 seam은 진짜 지금 해야 할 8개로 좁혀졌고, 과설계 충돌 우려는 검증 결과 **진짜 충돌 0건**(문서 모순 1건 발견).
>
> 액션: **GAP-MATRIX 21차 분석 G-268~G-279**. 우선순위 역전 수정: **G-132 P2→P1**.

## 1. 향후 취약점 (통합·우선순위순)

### P0 — Phase 1 코딩 전 결론 필요

| GAP | 취약점 | 터지는 조건 | 근거 | 대응 |
|---|---|---|---|---|
| G-270 | 경제 지속불가 — $9.99/100cr가 원가 밑 | DAU 100부터 적자 가시화 | `COST-ESTIMATE.md`, `specs/VgenCostAnalysis.md` | 가격 재설계 + provider 어댑터(G-268) |
| G-276 | L1 MediaPipe SAB/COOP 교차격리 — 켜면 서드파티 로드 차단 위험 | Phase1 PoC서 격리OFF fps<30 → SAB 시도 | `PLATFORM-SECURITY-RISKS-B.md §2.2` | PoC fps 실측이 아키텍처 게이트, COEP `credentialless` 병렬 테스트 |
| (G-58 계열) | token_version 3중 방어 미구현 — 강퇴 후 기존 토큰 재입장 | 발급게이트/webhook/셀프체크 중 1개라도 누락 | `specs/SecurityPolicies.md §8.2·8.6` | §8.6 체크리스트 완료 후에만 room 착수 |
| G-271 | idempotency_key 포맷 산재 — 이중 차감/환불 | 두 탭 동시 생성·네트워크 재시도 | `DATA-SCHEMA.md §1.6·1.8` | 단일 공식으로 통일 |
| G-270/G-272 | 환불 남용 여지 — 120초 timeout·10초 버킷 우회 | 조직적 환불 루프 | `specs/RefundPolicy.md`, `state-machines/Vgen.md` C12 | timeout 환불 재확인 대기 + 남용 카운터 |
| G-275 | 일본 미성년 보호자동의 법적 의무 (2026-04 APPI) | 16세 미만 처리, 이메일 인증만으론 위법 | 外조사(신뢰 높음) + `contracts/AgeGate.md` | 스키마 seam 지금 + 일본 법무 자문 게이트 |
| G-152(기존) | GDPR 계정삭제·데이터내보내기 — UI계약 DONE, 백엔드 미구현 | EU/일본 사용자 삭제 요청 | `contracts/SettingsPage.md` Tab7 | Phase1 `soft_delete_user` RPC+30일 pg_cron 구현 (신규갭 아님) |
| G-132 | 시드데이터 부재 + 우선순위 역전 | 런칭 첫날 방0/모델0/대본0 → 이탈 | `GAP-MATRIX.md` G-132 vs 파생 G-184/G-188(P1) | **G-132를 P1로 승격**, 데모룸+모델3+대본5 |
| G-279 | 모더레이션 1인 병목 + 자동필터 30~60% 누락 + 법적 비면책 | DAU 5,000서 수동검토 기능불능 | `MODERATION-OPS.md` + 外조사R3 | 감사로그·이의제기기록(면책요건) + DAU 500~1,000에 외주1명 |

### P1 — MVP 배포 직전 실측/보강

저사양 6인 렌더 미측정(G-276) · TURN blendshape 재정렬 버퍼 미상세(G-277) · host transfer seq race · iOS 오디오 자동재생 폴백 · Whisper diarization 정확도(G-269) · C2PA/IP필터 미성숙(G-273 연계) · RLS 다단계 JOIN 성능 · appeal 자동화 부재.

## 2. 미리 설계할 seam

### NOW-seam — 지금 넣으면 싸고 나중이면 비쌈 (현 SSOT 충돌 없음 확인)

| GAP | seam | 지금 할 최소 변경 | 나중이면 왜 비싼가 |
|---|---|---|---|
| G-268 | VGEN provider 어댑터 ⭐ | `VideoGenProvider` 인터페이스 + `app_config.VGEN_MODELS`(단가·길이 외부화) | Seedance 소송/2.5 단가급변 시 파이프라인 재구현 |
| G-269 | STT provider 추상화 | 어댑터 + AssemblyAI/Deepgram 우선 | Whisper 락인 + diarization 품질부채 |
| G-271 | idempotency_key 공식 통일 | `SHA256(entity+user+action+floor(ts/10000))` 전 API | 기존 키 재계산 마이그레이션 |
| G-272 | 남용 카운터 | refund/generation count 컬럼 + 임계값 | 사후 추적 불가(손실 미파악) |
| G-273 | 모더레이션 카테고리 공유 enum | 카테고리 SSOT 1개(`CommunityGuidelines.md`) 참조로 통일 | 3곳(VGEN flag·유저신고·가이드) 드리프트 → 필터/통계 붕괴 |
| G-274 | GDPR 공동저작물 삭제 | `deleted_at` 전 테이블 + FK cascade에서 **공동저작물은 user_id만 제거, 영상 보존** | 10만 콘텐츠 후 추가 = 마이그레이션 지옥 |
| G-275 | 미성년 보호자동의 스키마 | `users.parental_consent_status` + `parental_consent_tokens` | 일본 런칭 블로커 |
| G-278 | 확장 버전 필드 seam | blendshape `format_version` · rig.json `minClientVersion` · authority_epoch 토큰가드 | 프로토콜 재협상/재연결 강제 |

부수(기존 갭 우선순위 재검토 권고 — 주인님 판단): i18n 구조(G-17 LATER) · rate-limit 저장소 결정(SecurityPolicies §13.2) · API 버저닝(G-136 LATER)은 외부조사상 "지금이 저렴" 신호가 있으나 **단일 1st-party 클라이언트 단계에선 defer 방어 가능**.

### DEFER-with-seam — 지금 만들지 말 것(YAGNI), 이름만 예약

AI TTS 연습파트너(대신 시스템 소유 공개 연습방 값싼 변형만 P1 — G-184) · YouTube 소스(SSRF게이트) · 아바타 마켓플레이스(G-90) · 콘텐츠 라이브러리 검색(G-162) · 다중디바이스 세션 · 일본 결제/KYC(JAPAN-01/02) · WebGL 컨텍스트 풀링 · 협업프롬프트 CRDT.

## 3. 과설계·충돌 검증 (Opus 원본 직접 대조)

**진짜 충돌 0건.** 페이블 CONFLICT-RISK 5건 판정:

| 지목 | 판정 | 근거(원본 라인) |
|---|---|---|
| rig-format §7 ↔ VGEN 출력 "별도 소스" | ❌ 오탐 | `STACK-COMPARE-VIDEOGEN.md:108` "생성영상을 PixiJS 캔버스에 텍스처로 그려 넣고 captureStream 한 방 → 단일 WebGL 캔버스 구조와 정합" |
| 모더레이션 카테고리 SSOT 분산 | ⚠️ 실재(경미) | `DATA-SCHEMA.md:499` `flagged_categories TEXT[]`(제약없음) vs `MODERATION-OPS.md:72` CommunityGuidelines SSOT vs `moderation_reports.category` → G-273 |
| LOB-10 "LATER니 Phase 2로" | ⚠️ 리뷰어 오독 | `FEATURE-SPEC.md:80` `LOB-10 ... P1`, `:196` `CNT-09 P1` — LOB-10은 P1. 진짜 이슈=**우선순위 역전**(딸린 G-132는 LATER) → G-132 P1 승격 |
| cue_operator ↔ authority_epoch | ✅ 리뷰어 자체해결 | host_id만 판정, 현행 SSOT 유지 |
| 일본 결제/KYC ↔ Stripe/KRW | ✅ defer 타당 | JAPAN-01/02 P1~P2 미착수 |

## 4. 외부조사 결론 (Haiku 4병렬, 출처 포함)

### 4.1 영상생성·STT 벤더·비용

| 항목 | 결론 | 신뢰 |
|---|---|---|
| 영상생성 대안 | Seedance ~$0.10/초 vs Google Veo 3.1 Lite $0.05 / Kling·MiniMax Hailuo $0.07 / Luma ~$0.075/클립. **현실 절감 30~50%**(단일 스왑으로 손익분기 못 맞춤 → 어댑터+가격재설계 둘 다). Seedance 2.5 단가 미발표 | 중 |
| STT | Whisper는 diarization 미지원(별도툴 +10~15% WER). **AssemblyAI Universal-3 Pro $0.006/분(한·일 신규)** 또는 Deepgram Nova-3 $0.0043/분 → 비용↓ 품질↑ | 높 |
| C2PA/IP필터 | 완벽한 상용 IP(디즈니 등) 탐지 솔루션 **없음**. c2pa-rs(무료)+인증서 $289/년. 현실=프롬프트필터+사후검증 2단계. EU AI Act 8월 시행 | 중~높 |

출처: evolink.ai 영상API 비교, futureagi STT 벤치, assemblyai.com/benchmarks, spec.c2pa.org, github/contentauth/c2pa-rs.

### 4.2 법무 (전부 전문 법률 자문 필요)

| 항목 | 결론 | 신뢰 |
|---|---|---|
| 일본 미성년 | **2026-04 APPI 개정: 16세 미만 부모 동의 법적 의무.** 이메일 인증만으론 불충분(본인+보호자 인증 필요) | 높 |
| 2차창작 | 동인은 "사실상 용인"일 뿐 법적 보호 없음. "70% 변형" 자체정책은 **법적 방어 아님**. 세이프하버 없음 → 원작사 신고 시 개별 대응 | 중~높 |
| GDPR 공동영상 | Art.17은 절대적 아님. **"1인 요청=전체 삭제" 아님** — 표현의자유·타 실연자 권리 예외, 익명화/협상 병행 | 높 |

출처: Mori Hamada APPI 2026, 한국저작권위 일본가이드, ICO/Irish DPC Art.17, gdpr-info.eu.

### 4.3 모더레이션 규모화·책임

- 자동필터도 유해콘텐츠 **30~60% 놓침**. 한국 정보통신망법상 **"AI 썼다"는 면책 아님** — 감시로그+이의제기 기록이 "합리적 주의" 입증 요건.
- 외주 모더레이터 필리핀 **월 $400~600/인**, BPO 최소 3~5인($2,500~4,000/월). **DAU 500~1,000 사이 확보 계획 필요**, 1인 수동검토는 DAU 5,000서 기능불능.
- AI 배상책임보험 커버율 낮음(충분보상 10%) — 법무·보험 사전 문의 권고.

출처: Blaze.ai/CACM UGC 모더레이션, Jobstreet/SixEleven BPO 임금, 국가법령정보센터 정보통신망법, IAPP/DSA.

### 4.4 기술 seam 모범사례 (NOW-seam 근거)

- **i18n**: 지금 1~2일 vs 3년 후 3개월. 네임스페이스+지연로드(`src/locales/{ko,ja,en}/*`).
- **RLS 성능 90%는 조인 방향+인덱싱**: `team_id IN (SELECT ... WHERE user_id=(SELECT auth.uid()))` 역순 + 필터컬럼 인덱스 → 10~100배.
- **Postgres 무중단의 진짜 위협은 DDL이 아니라 잠금 대기열**: `tags TEXT[] DEFAULT '{}'`·nullable `deleted_at`은 안전, `lock_timeout` + 장시간 쿼리 제거.

출처: SimpleLocalize i18n, Supabase RLS 공식 troubleshooting, GoCardless zero-downtime migration.

## 5. Phase 1 코딩 전 "잠글 것" 순서

1. **PoC 게이트**(G-276): MediaPipe fps 실측(SAB 필요여부) + 저사양 6인 렌더 실측 → 아키텍처 확정
2. **경제 결정**(G-270): 가격 재설계 + provider/STT 어댑터 스펙(G-268/G-269) 확정
3. **스키마 seam 확정**: idempotency 공식(G-271)·GDPR cascade(G-274)·시드데이터(G-132)·미성년(G-275)·카테고리 enum(G-273)
4. **컨벤션 lock**: RLS 조인역순+인덱싱, Postgres 무중단 패턴 → `CODING-CONVENTIONS.md`/`specs/SecurityPolicies.md`에 반영
5. **법무 자문 착수**(G-275, 일본 2차창작, GDPR): 코딩과 무관하게 병렬로 지금 시작
