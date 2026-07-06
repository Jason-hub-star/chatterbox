---
tags: [audit]
---

<!--
  dogfood-audit(2026-07-06) 마스터 산출물 — 6 페르소나 서브에이전트 도그푸딩 + 메인 검증.
  이 문서 = 발견 SSOT + 최우선 구현 백로그(체크리스트). UX 상세는 design/UX-GAPS-AND-PATTERNS.md.
  스킬: .claude/skills/dogfood-audit. 재현: "플랫폼 감사해줘" / "도그푸딩".
-->

# 도그푸딩 감사 2026-07 — 발견 & 최우선 구현 백로그

> **BLUF:** 아키텍처는 견고(인증·RLS·크레딧 원자성·웹훅 서명·a11y 시맨틱이 실측 반증됨). 진짜 갭은 **레이트리밋 부재 계열 보안 6건**과 **1초-피드백·모바일/뷰어·다국어 UX 공백**. 방법 = 하이쿠 정찰 → Opus 6페르소나 워커 → 메인 직접 검증(인용라인 대조). UX 상세·프리미티브 설계는 [design/UX-GAPS-AND-PATTERNS.md](./design/UX-GAPS-AND-PATTERNS.md).

---

## §0. 최우선 구현 백로그 (하나씩 — 체크로 추적)

> **2트랙 운영(트랙분리):** **A = 로직·보안·seam**(지금, `/goal` 대상) · **B = UIUX 프레젠테이션**(나중, 스펙 대비 1회 패스). `/goal`은 **트랙 A만** 민다. B는 A가 심어둔 seam 위에 스타일만 얹는다 → "나중 연결"이 "나중 재작성"이 되지 않게.

### 트랙 A — 로직·보안·seam (지금 · `/goal` 대상)

**A-P0 (보안 실침해)**
- [x] **SEC-1** 잠금방 비번 **브루트포스 레이트리밋** — `rate_limit_counters` + `check_rate_limit` RPC(마이그 `20260706130000`) + `join-room-with-password` 적용(5회/5분→429, **정답 시 카운터 리셋** = 실패만 누적·정상유저 오탐 제거). **로직 실측**(supabase pg17.6: t×5→f→윈도리셋→키격리→RLS + 리셋-온-성공: 3실패→delete→fresh count1). ⏳ 배포·통합 실측 대기. SEC-4가 이 프리미티브 재사용.
- [x] **SEC-2** 스토리지 **경로 조작 차단** — 공용 `isSafeObjectKey`(supa.ts, `<room>/<subdir>/<안전파일명>` 정확매칭) + `submit-dub-track`·`submit-dub-output`·`create-dub-session`(sources/vgen) 적용. **실측**(deno check clean · 헬퍼 11/11: 정상키 통과·`../`·여분슬래시·타방·선행점·비문자열 전부 차단). ⏳ 배포 대기(앱 레이어에서 이미 거부 → R2 정규화 동작과 무관하게 견고, R2 실테스트는 배포 후 확인).
- [x] **SEC-3** SSRF 차단 — `isOwnR2RefUrl`(r2.ts): image_urls를 우리 R2 `vgen-refs/<room>/` presigned URL로만 제한(오리진+경로 allowlist·`..`거부). **실측**(deno check clean · 11/11: 정상 통과·메타데이터/사설IP/외부/서브도메인트릭/타방/타버킷/traversal/http 전부 차단). 참조자산 테이블 없어 asset_id 대신 오리진 allowlist 채택(프론트 무변경). ⏳ 배포 대기.

**A-P1 (비용·정합 + UX seam)**
- [x] **SEC-4** 무제한 비용 API 캡 — `check_rate_limit`(SEC-1 프리미티브 재사용)를 refine(50)·translate(30)·transcribe(30)·separate(20)/일 캡으로 4함수 적용(호스트 체크 직후·외부호출 직전, 무과금 ko-skip 이후 계수). **실측**(deno check clean ×4; RPC 로직은 SEC-1서 실측). ⏳ 배포 대기.
- [x] **SEC-5** 대본 큐 **서버 릴레이** — 새 Edge `advance-script-cue`(host 검증→broadcast) + receiver 스푸핑방어(participant 있으면 드롭) + sendCue 릴레이 전환 + handleCue self-echo 게이트(호스트 무시). **실측**(type-check·lint·**test 50/50**·deno check clean). ⏳ 배포 대기(함수 deploy **+ 프론트 CF Pages 재배포** 둘 다 있어야 라이브 — 리액션과 동일). 라이브 LiveKit E2E는 배포 후.
- [ ] **A-SEAM-1** 피드백 채널 — 성공/실패를 emit하는 `useToast()` seam(초기 no-op/console). 표현은 B. *(P-1 로직)*
- [ ] **A-SEAM-2** 진행/ETA 데이터 노출 — vgen `estimated_duration_sec` + dub phase progress를 store가 노출. 바는 B. *(P-2 로직)*
- [ ] **A-SEAM-3** Realtime 구독 훅 — `useRealtimeRow`(dub_sessions·dub_tracks·vgen_jobs). 순수 로직 → DUB 수동새로고침 제거. *(P-3)*
- [ ] **A-FUNC-1** 룸 조인 타임아웃/취소 — `callFn` 15s 타임아웃 + 취소(무한대기 제거)
- [ ] **A-FUNC-2** 인증 복구 — 비번 리셋(`resetPasswordForEmail`)·인증 재전송(화면 최소)

**A-P2 (정합·권한 seam)**
- [ ] **SEC-6** 일일한도 TOCTOU 원자화(RPC)
- [ ] **A-SEAM-4** 뷰어/모바일 **권한 로직** — role·ViewerGate 게이트(데이터 권한). 레이아웃은 B.
- [ ] **A-SEAM-5** i18n **키 구조** — en/ja 채울 자리 정비. 번역 콘텐츠는 B.
- [ ] **A-FUNC-3** 호스트 이양 배선(leave-room `new_host_id` 소비) · mute 상태 마운트 로드(desync 제거)

### 트랙 B — UIUX 프레젠테이션 (나중 · 1회 패스 · 스펙: `design/UX-GAPS-AND-PATTERNS.md` + `uiux-distilled.md`)
- [ ] **Toast/피드백 UI** (A-SEAM-1 채널에 스타일)
- [ ] **Progress/ETA 바** (A-SEAM-2 데이터에 바)
- [ ] **반응형 레이아웃 + 터치 롱프레스 리액션 + 무대 동적 크기**(P-5)
- [ ] **모바일 뷰어 레이아웃** (A-SEAM-4 위에)
- [ ] **다국어 번역 채우기** (A-SEAM-5 위에)
- [ ] **모달 일원화**(P-4 focus-trap) · **다크 elevation 그림자** · **라이트모드**
- ~~대비 교정(UX-P6)~~ — 거짓양성으로 취소(WCAG 7.2:1).

---

## §1. 보안 — 확정 (심각도순, 메인이 인용라인 직접 대조)

| ID | 취약점 | 심각도 | Confidence | file:line | 익스플로잇 | 정수정 |
|---|---|---|---|---|---|---|
| SEC-1 | 잠금방 비번 무제한 시도 | High | Confirmed | `join-room-with-password`(레이트리밋 전무·앱 전체 레이트리밋은 trigger-vgen 하나) | 4자리 비번=1만회 무차단 → 사설방 침입 | (user,room) 시도 제한 429 + 최소길이 상향 |
| SEC-2 | 스토리지 경로 traversal ×3 | High(R2 정규화 시)/Med | Likely | `submit-dub-track:39`·`submit-dub-output:48`·`create-dub-session:26` | 클라 경로 `startsWith`만 → `../`로 타방 파일키 저장 → 룸원 presign 접근 | 키 서버생성(클라 경로 미신뢰) + `..` 거부. R2 실테스트로 확정 |
| SEC-3 | SSRF (image_urls) | Med | Confirmed | `trigger-vgen:78-79`(`startsWith("http")`만) | 사설IP/메타데이터 URL 주입 → fal 페처 fetch (호스트전용·플래그 off 완화) | raw URL 폐기 → asset_id 서버서명 |
| SEC-4 | 무제한 비용 API | Med | Confirmed | refine-vgen·translate-dub·start-dub-transcription·separate-dub-audio(레이트리밋 0) | 호스트 루프 → OpenAI/Whisper/FAL 청구 부담 | 사용자별 일일 캡 |
| SEC-5 | 대본 큐 스푸핑(desync) | Med | Confirmed | `useLiveKitRoom.ts:156-160`(sender 미검증)·`RoomPage.tsx:209-211`(주석 인지) | 참가자가 `script-cue` 직접 publish → 전원 텔레프롬프터 desync(초대방 griefing) | send-reaction과 동일 서버 릴레이 |
| SEC-6 | 일일한도 TOCTOU | Low | Confirmed | `trigger-vgen:103→133`(count→insert 비원자) | 동시 요청 소프트쿼터 우회(크레딧은 자기돈 원자차감) | count+insert RPC 원자화 |

## §2. 보안 — 반증 (안전 확인·거짓양성 억제)

- **vgen-webhook**: ED25519 서명 + ±5분 타임스탬프 → 위조·재생 불가 (정찰 1순위 의심이 실제론 견고)
- **deduct/refund**: `FOR UPDATE` 원자 + `credit_deducted_at`∧`credit_refunded_at` 멱등 → 이중지불/환불 불가
- **호스트 인가**(kick/mute/set-password: server-derived userId) · **멤버십 게이트**(reaction/list-members/consent) · **`.single()`**(!appUser로 null 캐치)
- **RLS**(dub_*/credits/room_secrets deny-all + `is_room_member` + `current_user_id`) · **presign IDOR**(멤버 확인 후 SigV4) · **room_secrets 비번해시 미노출**

## §3. UX 마찰 (상세: design/UX-GAPS-AND-PATTERNS.md)

- **Blocker**: 뷰어/모바일 경로 구현 0(계약서만) · 리액션 우클릭 전용→터치 불가 · 룸 조인 타임아웃/취소 없음 · 비번찾기/인증재전송 없음
- **High**: 무대 비반응형(고정120px·`sm:`0회) · DUB 수동 새로고침 · VGEN 진행도/ETA 없음  *(※ text-muted 대비는 WCAG 실측 7.2:1로 AA 통과 — 정찰 오탐 정정)*
- **Med**: 강퇴 2단토글(모달아님·사유없음) · 연결품질 이모지만 · mute desync · 호스트 이양 미배선 · 다국어 15%

## §4. 있으면 좋을 기능 · 잘되는 점

- **기능**: 게스트/미리보기 모드 · 비번리셋·인증재전송 · 세션 녹화 · 밴(≠강퇴) · 대기실 · 룸설정 편집 · 키보드 리액션 핫키 · 색맹안전 상태 라벨
- **잘됨(회귀금지)**: a11y 시맨틱 · auth 세션 복원+원목적지 복귀 · VGEN 코스트 프리뷰 · 2계층 mute · 비번락 정합 · DubCompositor 진행도 · 서버 릴레이 리액션(스푸핑 차단)

---

## 진행 로그

- **2026-07-06** dogfood-audit 최초 실행(6 페르소나). 발견 12 actionable + 반증 7. 백로그 §0 등록.
- **2026-07-06** SEC-1 구현: rate-limit 프리미티브(마이그+RPC) + 잠금방 적용. 격리 postgres 17.6 실측 PASS(5허용→6차단→400s후 리셋→키격리→RLS). 배포 미실행(승인 대기).
- **2026-07-06** SEC-2 구현: 공용 `isSafeObjectKey` + 3함수 적용. deno check clean + 헬퍼 로직 11/11 PASS(정상 통과·traversal 전부 차단). 배포 대기.
- **2026-07-06** UX-P6 **거짓양성 정정**: WCAG 실측으로 muted 대비 7.21:1(AA 통과) — 정찰의 3.2:1 오산. 토큰 무변경, 그림자 폴리시는 P2로.
- **2026-07-06** **트랙분리**: §0을 트랙 A(로직·보안·seam=지금·`/goal` 대상)/트랙 B(UIUX 표현=나중 1회 패스)로 재편. UX 항목은 seam(A)/표현(B)으로 분해. `/goal` 명령어가 기본 트랙 A만 밀도록 갱신.
- **2026-07-06** `/goal A` 실행: **SEC-3**(SSRF, `isOwnR2RefUrl` R2 오리진 allowlist, 11/11) + **SEC-4**(비용 API 캡, check_rate_limit 4함수 재사용, deno clean ×4) 구현·검증. 배포 대기.
- **2026-07-06** **자기리뷰**: SEC-2 업로드 키 프리픽스 3종(sources/recordings/outputs) 실코드 대조 — 정상 흐름 무손상 확인. SEC-1 오탐(성공시도 계수) 발견 → **정답 시 카운터 리셋** 추가·DB 실측. join-room deno check는 기존 password.ts 타입에러로 막힘(내 코드 무관, DB로 대체 검증).
- **2026-07-06** **SEC-5**(대본 큐 서버 릴레이): 새 Edge `advance-script-cue` + 클라 4배선(rooms 래퍼·receiver 스푸핑방어·sendCue 릴레이·handleCue self-echo 게이트). type-check·lint·test 50/50·deno clean. 배포 대기. **보안 SEC-1~5 전부 구현·검증 완료**(SEC-6 TOCTOU만 A-P2 잔여). 다음=A-SEAM-1(UX 로직 seam).
