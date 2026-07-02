---
tags: [hub]
---

> G-129 산출 문서. P0 스펙 완료 후 플랫폼 구현 착수 순서.

# snack-web 구현 순서 및 의존성 트리

P0 블로커 완료 후, 101개 Feature ID 구현 순서 및 병렬 가능 작업 가이드.

> **축 구분(중요):** 이 문서의 `Phase`는 **빌드 의존성 블록(무엇부터 만드나)** 축 — 착수 순서의 SSOT다. 완료 판정·AC·데모 마일스톤은 [[MILESTONES]](별개 축). 두 문서의 Phase 번호는 **같은 번호라도 다른 것을 가리킨다** (예: 여기 Phase 1 = 인증+통신, MILESTONES Phase 1 = 2인 음성 데모). 아래 crosswalk로 매핑한다.

### Crosswalk — 빌드 블록 ↔ 데모 마일스톤

| 빌드 블록 (이 문서) | 주로 여는 데모 마일스톤 ([[MILESTONES]]) |
|---|---|
| Phase 0 스캐폴드 | Phase 0 스캐폴드 & 기반 연결 |
| Phase 1A 인증 | Phase 0 이메일 로그인 · Phase 2 인증 완성 |
| Phase 1B LiveKit 통신 | **Phase 1 2인 음성 PoC** |
| Phase 2 DB + 방 로직 | Phase 2 방 운영 |
| Phase 3A 아바타 렌더 | Phase 1 표정 · Phase 3 묵대 |
| Phase 3B 더빙 | Phase 3~4 DUB |
| Phase 4 AI(VGEN) + 완성 | Phase 4 정식화 & 배포 |

> 다대다 매핑인 이유: 데모 마일스톤은 "보여줄 수 있는 것" 기준(예: 표정 데모는 LiveKit+아바타 두 블록이 필요), 빌드 블록은 "의존성 순서" 기준이라 축이 다르다.

---

## 선행 조건

다음 3개 항목이 DONE 상태여야 착수 가능:

| ID | 항목 | 문서 | 상태 | 확인 |
|---|---|---|---|---|
| G-01 | LiveKit 토큰 발급 Edge Function | [[livekit-edge-fn]] | ✓ DONE | [확인](specs/livekit-edge-fn.md) |
| G-02 | models 테이블 + Supabase 스키마 | [[supabase-auth]] §6 | ✓ DONE | [확인](specs/supabase-auth.md) |
| G-03 | rig JSON 포맷 스펙 | [[rig-format]] | ✓ DONE | [확인](specs/rig-format.md) |

**확인 방법:** `npm run docs:health` → "GAP-MATRIX G-01/02/03" 행의 상태가 모두 DONE 표시

---

## Phase 0: 프로젝트 스캐폴드 (1주)

**목표:** Vite SPA 프레임워크 구축 + 기본 라우터 + 글로벌 스토어 + 디자인 토큰

| Feature ID | 기능 | 마일스톤 | 예상 기간 | 의존성 |
|-----------|------|---------|---------|--------|
| **INFRA-01** | Vite + React 19 + TypeScript 설정 | React SPA 부트스트랩 | 2일 | — |
| **INFRA-02** | React Router DOM v6 라우팅 | `/auth` / `/lobby` / `/room/:id` | 1일 | INFRA-01 |
| **INFRA-03** | Zustand 전역 상태 관리 (기본 stores/) | `userStore` / `roomStore` / `stageStore` | 2일 | INFRA-01 |
| **INFRA-04** | Supabase JS Client 초기화 | supabaseClient 싱글턴 + RLS 게이트 | 1일 | INFRA-01 |
| **INFRA-05** | i18next 다국어 (ko/ja/en) | i18n.ts + translations/ 구조 | 2일 | INFRA-01 |
| **DESIGN-01** | design/DESIGN-TOKENS.md 정의 | 색상·타이포·간격·섀도우 CSS 변수 | 1일 | — |
| **DESIGN-02** | 전역 스타일시트 (Tailwind or styled-components) | CSS 초기화 + 테마 변수 | 2일 | DESIGN-01 |

**Phase 0 병렬:** 모든 7개 작업 동시 착수 가능 (의존성 없음)  
**Phase 0 완료 조건:** 
- 로컬 dev 서버 정상 실행
- 라우트 3개 정상 작동 (/ 리다이렉트 → /auth)
- Supabase 연동 테스트 (dummy query)
- lint/type-check 통과

---

## Phase 1: 인증 + 실시간 통신 (2주)

**목표:** 사용자 가입·로그인 + WebRTC 방 연결 + 기본 2인 PoC

### Phase 1A: 인증 (1주 / 필수 선행)

| Feature ID | 기능 | 예상 기간 | 의존성 |
|-----------|------|---------|--------|
| **AUTH-01** | 회원가입 (이메일·비밀번호) | 3일 | INFRA-02, INFRA-04 |
| **AUTH-02** | 로그인·로그아웃 | 2일 | AUTH-01 |
| **AUTH-03** | 비밀번호 재설정 (forgot pwd) | 2일 | AUTH-01 |
| **AUTH-04** | 이메일 인증 (confirm email) | 2일 | AUTH-02 |
| **AUTH-05** | 세션 유지 (refreshToken 자동 갱신) | 1일 | AUTH-02 |

**Phase 1A 완료:** 회원가입·로그인·로그아웃 정상 작동

### Phase 1B: LiveKit 통신 (1주 / AUTH-05 후 병렬)

| Feature ID | 기능 | 예상 기간 | 의존성 |
|-----------|------|---------|--------|
| **ROOM-04** | LiveKit 토큰 발급 (Edge Function 호출) | 2일 | G-01, AUTH-05 |
| **ROOM-04A** | WebRTC 연결 (PeerConnection) | 3일 | ROOM-04 |
| **ROOM-04B** | 오디오·비디오 트랙 발행 | 2일 | ROOM-04A |
| **ROOM-05** | 실시간 채팅 (Edge Function + `chat` relay) | 2일 | ROOM-04A |

**Phase 1 완료 조건:**
- 2인 WebRTC 연결 테스트 (localhost + 브라우저 2개 탭)
- 오디오·비디오 전송 정상
- 채팅 메시지 송수신 정상

---

## Phase 2: DB 스키마 + 방 로직 (2주)

**목표:** 방 생성·입장·초대 + 참가자 관리

| Feature ID | 기능 | 예상 기간 | 의존성 |
|-----------|------|---------|--------|
| **INFRA-06** | DATA-SCHEMA.md 전체 테이블 마이그레이션 | 3일 | G-02 |
| **MOD-01** | 모델 선택 (models 테이블 쿼리) | 2일 | INFRA-06, INFRA-04 |
| **LOB-01** | 로비 페이지 (방 목록·생성 폼) | 3일 | MOD-01, AUTH-05 |
| **LOB-03** | 방 생성 (POST /room) | 2일 | LOB-01, INFRA-06 |
| **LOB-04** | 방 입장 (room_participants INSERT) | 2일 | LOB-03, ROOM-04 |
| **LOB-05** | 초대링크 생성·검증 (room_invites) | 2일 | LOB-04, G-01 |
| **ROOM-01** | 방 상태 머신 (created→live→ended) | 2일 | INFRA-06 |
| **ROOM-08** | 참가자 목록 (room_participants sync) | 1일 | ROOM-01, ROOM-04A |

**Phase 2 병렬:** 
- 2A (INFRA-06·MOD-01): 순차 필수
- 2B (LOB-01·LOB-03·LOB-04·LOB-05): INFRA-06 후 병렬 (LOB-04는 LOB-03 후)
- 2C (ROOM-01·ROOM-08): INFRA-06 후 병렬

**Phase 2 완료:** 방 생성 → 입장 → 초대링크 공유 → 다른 사용자 입장 정상

---

## Phase 3: 아바타 + 더빙 기반 (2주)

**목표:** 얼굴 트래킹 + 아바타 렌더링 + 기본 더빙 녹음

### Phase 3A: 아바타 렌더링 (1주 / ROOM 연결 후)

| Feature ID | 기능 | 예상 기간 | 의존성 |
|-----------|------|---------|--------|
| **MOD-02** | 아바타 업로드 (R2 + rig.json 검증) | 2일 | G-03, INFRA-06 |
| **MOD-03** | MediaPipe 얼굴 트래킹 (blendshapes) | 3일 | MOD-02 |
| **MOD-04** | PixiJS 아바타 렌더링 (2D 파츠 합성) | 3일 | MOD-03 |
| **ROOM-03** | WebGL Canvas 렌더 + WebRTC 비디오 동기 | 2일 | MOD-04, ROOM-04B |
| **GreenRoom** | Green Room (캘리브레이션 + 준비 대기) | 2일 | MOD-03, ROOM-03 |

### Phase 3B: 기본 더빙 (1주 / 아바타 완료 후)

| Feature ID | 기능 | 예상 기간 | 의존성 |
|-----------|------|---------|--------|
| **DUB-01** | 더빙 세션 생성 (dub_sessions INSERT) | 1일 | ROOM-01, INFRA-06 |
| **DUB-02** | 녹음 (MediaRecorder) | 2일 | ROOM-03, ROOM-04B |
| **DUB-04** | 원본 영상 동기 (playback position) | 2일 | ROOM-13 (후행, 임시 단순화) |
| **Audio Mixer** | 음량 조절 (본인·타인·배경음) | 1일 | ROOM-04B |

**Phase 3 완료:** 방 입장 → 캘리브레이션 → 녹음 → 영상 저장 기본 플로우

---

## Phase 4: AI 기능 + 플랫폼 완성 (2주)

**목표:** VGEN 영상 생성 + 배포 준비

| Feature ID | 기능 | 예상 기간 | 의존성 |
|-----------|------|---------|--------|
| **VGEN-01** | VGEN 프롬프트 입력 (VgenPanel) | 2일 | Phase 3 완료 |
| **VGEN-02** | VGEN 생성 요청 (fal.ai 호출) | 2일 | VGEN-01, INFRA-06 |
| **VGEN-06** | 사전 모더레이션 (프롬프트 검사) | 2일 | VGEN-02 |
| **VGEN-11** | 작품 다운로드 (R2 signed URL) | 2일 | VGEN-02 |
| **VGEN-12** | SNS 공유 (OG 태그·링크) | 2일 | VGEN-11 |
| **ROOM-13** | 방 녹화 저장 (recordings 테이블) | 2일 | ROOM-03, ROOM-01 |
| **Deployment** | Cloudflare Pages 배포 (CI/CD) | 2일 | 모든 기능 |

**Phase 4 완료:** 방 생성 → 공연 → 녹화·VGEN → 다운로드·공유 전체 플로우

---

## 의존성 트리 (ASCII)

```
┌─────────────────────────────────────────────┐
│ Phase 0: Vite + Router + Stores + Design    │
│ (INFRA-01~05, DESIGN-01~02)                 │
│ 기간: 1주, 병렬: 모두                         │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ Phase 1A: 인증 (AUTH-01~05)                  │
│ 기간: 1주, 병렬: 모두                         │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────────────┐
│ Phase 1B:    │  │ Phase 2: DB + 방      │
│ LiveKit      │  │ (INFRA-06 선행)      │
│ (ROOM-04~05) │  │ 기간: 2주             │
└──────┬───────┘  └────────┬─────────────┘
       │                  │
       │  ┌───────────────┘
       │  │
       └──┼──────────────────────────┐
          │                          │
          ▼                          ▼
     ┌─────────────┐        ┌──────────────────────┐
     │ Phase 3A:   │        │ Phase 3B: 더빙       │
     │ 아바타      │        │ (DUB-01~04)         │
     │ 렌더링      │        │ 기간: 1주             │
     │ (MOD/ROOM)  │        └──────────────────────┘
     └──────┬──────┘
            │
            ▼
     ┌─────────────────────────────┐
     │ Phase 4: AI + 배포           │
     │ (VGEN-01~12, ROOM-13)       │
     │ 기간: 2주                    │
     │ 병렬: VGEN/ROOM-13 독립      │
     └─────────────────────────────┘
```

---

## 병렬 가능 작업 요약

| Phase | 병렬 그룹 | 작업 | 효과 |
|-------|---------|------|------|
| **0** | 전체 | INFRA-01~05, DESIGN-01~02 (7개) | 1주 → 2일 단축 |
| **1A** | 전체 | AUTH-01~05 (5개) | 1주 → 3일 단축 |
| **1B** | 선행순 | ROOM-04 → ROOM-04A·04B·05 병렬 | 1주 유지 |
| **2** | 3그룹 | 2A(순차)·2B(병렬 3개)·2C(병렬 2개) | 2주 → 1.5주 단축 |
| **3** | 2그룹 | 3A(병렬 5개) → 3B(병렬 4개) | 2주 → 1.5주 단축 |
| **4** | 2그룹 | VGEN(병렬 6개) ∥ ROOM-13 | 2주 → 1주 단축 |

**총 예상 기간:** 
- 순차 (Phase 0→1→2→3→4): 9주
- 최적 병렬화: 5.5주

---

## 주간 스프린트 배치 예시 (5.5주 일정)

```
┌──────────┬───────────────────────────────────────┐
│ Sprint 1 │ Phase 0 (병렬 7개)                     │
│ (1주)    │ - React SPA 부트스트랩                 │
│          │ - Router + Zustand 기본 구조           │
│          │ - Supabase 초기화 + i18n              │
└──────────┼───────────────────────────────────────┘

┌──────────┬───────────────────────────────────────┐
│ Sprint 2 │ Phase 1A (AUTH 5개) + 시작             │
│ (1주)    │ - 회원가입·로그인·인증                │
│          │ - 세션 유지                           │
└──────────┼───────────────────────────────────────┘

┌──────────┬───────────────────────────────────────┐
│ Sprint 3 │ Phase 1B (ROOM 4개) + Phase 2 시작    │
│ (1주)    │ - LiveKit 연결·오디오·채팅             │
│          │ - DB 마이그레이션 시작                 │
└──────────┼───────────────────────────────────────┘

┌──────────┬───────────────────────────────────────┐
│ Sprint 4 │ Phase 2 (방 로직 8개)                 │
│ (1주)    │ - 로비·방 생성·입장·초대               │
│          │ - 참가자 관리                         │
└──────────┼───────────────────────────────────────┘

┌──────────┬───────────────────────────────────────┐
│ Sprint 5 │ Phase 3A (아바타) + 3B 시작           │
│ (1주)    │ - MediaPipe 트래킹                    │
│          │ - PixiJS 렌더링                       │
│          │ - Green Room 캘리브레이션             │
└──────────┼───────────────────────────────────────┘

┌──────────┬───────────────────────────────────────┐
│ Sprint 6 │ Phase 3B (더빙) + Phase 4 시작        │
│ (0.5주)  │ - MediaRecorder 녹음                  │
│          │ - VGEN 프롬프트·생성 시작             │
│          │ - 배포 준비                          │
└──────────┴───────────────────────────────────────┘
```

---

## 막힐 수 있는 지점 (위험 항목)

| 위험 | 대응 | 기한 |
|-----|------|------|
| **LiveKit 토큰 발급 Edge Function 실패** → ROOM-04 블로커 | G-01 문서 재검토, 토큰 검증 테스트 먼저 | Phase 1B 시작 전 |
| **MediaPipe WASM 로딩 느림** → 초기 로딩 5초+ | CDN 캐시·번들 코드스플리팅 (G-110) | Phase 3A 진입 전 |
| **Supabase RLS 정책 오류** → 방 입장 권한 거부 | SecurityPolicies.md §2 검증, RLS 테스트 SQL 별도 작성 | Phase 2 INFRA-06 후 |
| **더빙 합성 (ffmpeg.wasm) 브라우저 메모리 부족** → 16GB 미만 환경 | Canvas2D 단순화·Web Worker 처리 (G-127) | Phase 3B 후반 |
| **VGEN 모델 비용 초과** → 월 예산 100 크레딧 초과 시 중단 | VgenCostAnalysis.md (G-118) 단가 확인·budgetCheck 구현 | Phase 4 VGEN-02 전 |

---

## 점검 항목 (각 Phase 완료 시)

### Phase 0 완료 체크

- [ ] `npm run dev` 정상 실행
- [ ] 3개 라우트 정상 작동
- [ ] Supabase dummy query 성공
- [ ] 타입 체크 통과 (`npm run lint`)
- [ ] 문서 일관성 검사 통과 (`npm run docs:check`)

### Phase 1 완료 체크

- [ ] 회원가입·로그인·로그아웃 정상
- [ ] 2인 WebRTC 연결 테스트 성공
- [ ] 오디오·비디오 송수신 정상
- [ ] 채팅 메시지 송수신 정상
- [ ] 세션 유지 (새로고침 후 로그인 상태 유지)

### Phase 2 완료 체크

- [ ] 방 생성 → 입장 → 퇴장 정상
- [ ] 초대링크 공유 → 다른 사용자 입장 정상
- [ ] 참가자 목록 실시간 동기
- [ ] 방 상태 전이 (created → live → ended)

### Phase 3 완료 체크

- [ ] 캘리브레이션 (얼굴 트래킹 + blendshape 송신)
- [ ] 아바타 렌더링 실시간 정상
- [ ] 더빙 녹음 → MP4 저장 정상
- [ ] 원본 영상 동기 (playback position 실시간 추적)

### Phase 4 완료 체크

- [ ] VGEN 프롬프트 입력 → 생성 요청 정상
- [ ] VGEN 결과 다운로드 정상
- [ ] 작품 SNS 공유 정상
- [ ] Cloudflare Pages 배포 정상
- [ ] 프로덕션 환경에서 전체 플로우 테스트

---

## 관련 문서

- [[DEVELOPMENT-GUIDE]] — 환경 설정 (이미 완료)
- [[supabase-auth]] — Supabase 스키마 (G-02)
- [[livekit-edge-fn]] — LiveKit 토큰 (G-01)
- [[rig-format]] — 아바타 포맷 (G-03)
- [[DATA-SCHEMA]] — 전체 테이블 구조
- [[PLATFORM-ARCHITECTURE]] — 기술 스택 개요
- `docs/state-machines/` — 각 기능별 FSM
- `docs/contracts/` — 컴포넌트 상세 명세

---

## 한줄정리

snack-web 구현은 Phase 0(Vite 스캐폴드, 1주) → Phase 1(인증+LiveKit, 1.5주) → Phase 2(DB+방, 1.5주) → Phase 3(아바타+더빙, 1.5주) → Phase 4(VGEN+배포, 1주) 순서로 총 5.5주(병렬 최적화)에 완료되며, 각 Phase마다 병렬 가능한 작업을 3~7개씩 분산 처리하여 시간을 단축할 수 있다.
