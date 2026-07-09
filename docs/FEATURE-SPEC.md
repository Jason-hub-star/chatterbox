---
tags: [hub]
---

<!--
  2026-06-27 - 플랫폼 구현 기능 SSOT. 주인님 12개 카테고리 + Opus 제안 보강(★). 신규 기능 추가: DUB 섹션, ROOM-19, VGEN-11/12.
  회의 보드(docs/meeting/index.html)의 카드 데이터 원천. 회의에서 배치·확정한 결과는 JSON export로 역반영.
  룸 레이아웃 시각 워이어프레임: docs/meeting/room-layout-picker.html (E 확정). 코딩 입력 SSOT는 DESIGN-DIRECTION.md §6.
-->

# FEATURE-SPEC — 버튜버 연극 플랫폼 구현 기능 명세

> **우선순위:** P0 = MVP 필수(없으면 막힘) · P1 = 정식화 · P2 = 이후.
> **★ = Opus 제안 보강**(원 목록에 없던 사용자 편의/안전 기능). **소속 페이지**는 회의에서 조정 가능.
> Updated: 2026-07-01 · 짝: `meeting/index.html`, `PLATFORM-ARCHITECTURE.md`

## 페이지 맵

`LANDING(/)` · `AUTH(/login·/register)` · `PROFILE(/profile)` · `MODELS(/models)` · `LOBBY(/lobby)` · `ROOM(/rooms/:id)` · `HOST(방장 콘솔=ROOM 내)` · `SETTINGS(/settings)` · `COMMON(교차 관심사)`

---

## AUTH — 인증·계정

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| AUTH-01 | 이메일/비밀번호 회원가입·로그인 | P0 | Supabase |
| AUTH-02 | 소셜 로그인(Kakao·Google OAuth) — **코드 배선 완료(소셜 우선 `OAuthButtons`·`loginWithOAuth`), 프로바이더 대시보드 설정 대기**(트리거: 외부 초대 2~3주 전 — 카카오 비즈앱 검수 리드타임) | P0 | Supabase |
| AUTH-03 | 세션 인증 가드(로그인/가입/리셋 외 보호 — `/`=HomeRedirect 세션 리다이렉트, 인앱 랜딩 폐지 2026-07-08) | P0 | Supabase |
| ★ AUTH-04 | **이메일/비밀번호 변경 UI**(로그인 후 — Settings Security 탭) | P0 | Supabase `updateUser` |
| ★ AUTH-05 | **앱 내 계정 삭제 흐름**(삭제 결과 미리보기·30일 유예·되돌리기 불가 경고) | P0 | Supabase `deleteUser` |
| ★ AUTH-06 | **앱 내 데이터 내보내기 요청 UI**(개인정보보호법·GDPR 이행 진입점) | P0 | Supabase / 이메일 |
| ★ AUTH-02b | **Discord OAuth**(버튜버 커뮤니티 친화 소셜 로그인) | P1 | Supabase |
| ★ AUTH-02c | **Twitter/X OAuth** | P1 | Supabase |
| ★ AUTH-07 | **계정 2FA (TOTP 기반)** | P1 | Supabase + authenticator app |

## ONBOARDING — 온보딩·첫 경험

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| ★ ONBOARDING-01 | **시네마틱 인트로** — 15~20초 플랫폼 컨셉 영상, 스킵 가능, 첫 방문 1회만 | P0 | — |
| ★ ONBOARDING-02 | **장르 취향 선택** — 판타지/로맨스/SF/코미디/공포/일상 최대 3개 선택 → 로비 추천 반영 | P0 | Supabase |
| ★ ONBOARDING-03 | **테스트/개발용 온보딩 스킵 플래그** — localStorage `SKIP_ONBOARDING=true` 또는 환경변수 기반 자동 통과 | P1 | — |

## PROFILE — 프로필·계정 관리 ★신규

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| ★ PROFILE-01 | **프로필 편집**(닉네임·자기소개·프로필 사진 변경) | P0 | Supabase users |
| ★ PROFILE-02 | **프로필 공개 범위**(전체공개/연결된 사용자만/비공개) | P1 | Supabase |
| ★ PROFILE-03 | **알림 설정 센터**(예약·초대·방 가득 참·크레딧 소진 각 ON/OFF) | P1 | Supabase |
| ★ PROFILE-04 | **친구/팔로우 토글** — 친구 추가, 팔로우, 차단 | P1 | Supabase friendships |
| ★ PROFILE-05 | **팔로우 알림**(팔로우 사용자 방 시작 시 알림) | P1 | Supabase notifications |

## MODELS — 모델 선택·캘리브레이션

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| MOD-01 | 보유 버튜버 모델 목록 조회 | P0 | Supabase |
| MOD-02 | 모델 선택 + 웹캠 캘리브레이션 | P0 | MediaPipe |
| MOD-03 | 페이셜 테스트 8동작(깜빡·윙크·입벌림·모음·볼·미소·슬픔·화남) | P0 | MediaPipe |
| MOD-04 | 필살기 핫키(하트눈·분노·눈물·홍조·멍) 과장표정 즉발 | P1 | Pixi |
| ★ MOD-05 | **대기실(Green Room)** — 입장 전 내 아바타·소리·배경 미리보기 | P0 | MediaPipe/LiveKit |
| ★ MOD-06 | **권한·디바이스 트러블슈팅** — 웹캠/마이크 거부 안내, 중간 핫스왑 | P0 | — |
| ★ MOD-07 | **트래킹 품질 게이지 + 표정 리플레이** — 조명/얼굴 인식/표정 매핑 신뢰도와 1초 지연 재생 확인 | P1 | MediaPipe/Pixi |
| ★ MOD-08 | **아바타 커미션(Avatar Forge)** — 의상실에서 PNG 1장 주문→자동 리깅(25~40분, 4단계 주문서)→내 아바타 수령·입어보기. 구현: `reference/patterns/avatar-forge-pipeline.md` (2026-07-09 UI·배포 완료, 남용 게이트 P1 잔여) | P1 | Modal/Supabase |

## LOBBY — 방 탐색·로비

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| LOB-01 | 방 목록(주제 태그·인원·자물쇠 표시) | P0 | Supabase |
| LOB-02 | 방 검색 | P1 | Supabase |
| LOB-03 | 방 생성(공개/비밀번호 + **메인뷰 모드: VOD상영 / AI영상생성형**) | P0 | Supabase |
| LOB-04 | 입장 전 페이셜 테스트 통과 게이트 | P0 | MediaPipe |
| ★ LOB-05 | **초대 링크/코드 공유 + 배우/관전 역할 선택** — 친구 부르기. invite role은 `actor|viewer`로 고정하며 모바일은 viewer로 자동 다운그레이드 | P0 | Supabase |
| ★ LOB-06 | **예약 공연 + 알림**(이메일/푸시) — "오늘 밤 9시 같이 하자" 약속 잡기 | P1 | Supabase |
| ★ LOB-07 | **공개 Watch-only 데모 룸** — 가입 전 30초 관전 체험. MVP 익명/게스트는 read-only viewer이며 채팅·반응·투표 없음 | P0 | Supabase anonymous |
| ★ LOB-08 | **최근 함께한 사람·최근 방·다시 초대** — 친구 재초대/재방문 루프 | P1 | Supabase |
| ★ LOB-09 | **항상 켜진 데모 룸** — 사전 녹화 아바타 루프+배경으로 비로그인 30초 read-only 체험. 채팅은 로그인 viewer만 | P0 | Supabase anonymous/R2 |
| ★ LOB-10 | **혼자 시작 방지 연습 방** — AI/스태프/녹화 루프 파트너와 즉시 리허설, 공개 연습 방 최소 1개 유지 | P1 | Supabase/TTS/R2 |

## ROOM — 방(무대) 핵심

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| ROOM-01 | 메인뷰: **소스 교체형**(CDN VOD ⊕ AI생성클립) + 타임스탬프 동기 | P0 | R2/CDN |
| ROOM-02 | 무대 레이아웃 엔진 2·4·6인 자동 배치 | P0 | Pixi |
| ROOM-03 | 실시간 아바타(웹캠→MediaPipe 52ch→Pixi v8) | P0 | MediaPipe/Pixi |
| ROOM-04 | 음성 대화(WebRTC SFU) | P0 | LiveKit |
| ROOM-05 | 텍스트 채팅 | P0 | LiveKit |
| ROOM-06 | 대본 텔레프롬프터(역할·하이라이트·"내 차례"·ko/ja/en) | P1 | — |
| ROOM-07 | 참가자 HUD(active-speaker·뮤트·방장 왕관) | P0 | LiveKit |
| ROOM-08 | 음량 믹서(참가자별 볼륨/뮤트) | P1 | LiveKit |
| ROOM-09 | 배경 선택기 | P1 | Supabase |
| ★ ROOM-10 | **재연결 UX + 연결품질(핑) 표시** | P0 | LiveKit |
| ★ ROOM-11 | **트래킹 실패 폴백**(얼굴 미인식 시 idle + 안내) | P0 | MediaPipe |
| ★ ROOM-12 | **가벼운 리액션/이모트**(박수 등 객석 반응) | P1 | LiveKit |
| ★ ROOM-13 | **인앱 녹화·다시보기·클립 + 작품함** — 우측 패널 녹화 상태, 하단 ⏺녹음 버튼, 방/내 작품 갤러리 | P1 | R2/Supabase |
| ★ ROOM-23 | **로컬 백업 녹화** — 참가자별 MediaRecorder chunk를 로컬 임시 보관 후 R2 업로드·복구 | P1 | MediaRecorder/R2 |
| ★ ROOM-14 | **역할 배정 UI + 리허설/본공연 모드** — 좌측 패널 중단: 캐릭터→배우 매핑 + 모드 토글 버튼 | P1 | — |
| ★ ROOM-15 | **무대/객석 분리**(출연자=트래킹 vs 관전자=뷰어·채팅) — ⋮ 드롭다운 "뷰어 모드 전환" | P1 | LiveKit |
| ★ ROOM-17 | **실시간 디렉터 노트** — 우측 패널: 참가자 메모 스트림 + 입력창(방장/참가자 공용) | P1 | LiveKit |
| ★ ROOM-18 | **메인뷰 배속 조절** — 비디오 컨트롤 바 배속 버튼(0.5x~2x) | P1 | — |
| ★ ROOM-19 | **참가자 이벤트 리액션** — ✓·?·이모지를 내 캐릭터 위에 즉발, 전체 동기 표시 | P1 | LiveKit DataTrack |
| ★ ROOM-20 | **손들기/발언 큐**(관객 요청 → 호스트 승인 큐 → 임시 발언 권한 부여) | P1 | LiveKit |
| ★ ROOM-21 | **관객 무대 초대**(호스트가 특정 뷰어 → actor 권한 승격) | P1 | LiveKit |
| ★ ROOM-22 | **관객 투표/폴** — 모바일 viewer도 스토리 선택·장면 분기·MVP 피드백에 참여 | P1 | Supabase/Edge |
| ★ ROOM-24 | **리허설 피드백 루프** — 10초 다시듣기, 대사 겹침/내 차례 타이밍, 리액션 하이라이트 | P1 | MediaRecorder/Supabase |
| ★ ROOM-25 | **네트워크 상태 표시 UX** — 우상단 인디케이터, 3단계(좋음/보통/나쁨), 실시간 핑/패킷손실 | P1 | LiveKit/WebRTC |
| ★ ROOM-26 | **씬 대화형 레이어** — 배경 아래 레이어 PNG 파츠 클릭/호버 가능, 파티클·사운드 트리거(`sound_trigger` 이벤트) | P1 | Pixi/SoundManager |
| ★ ROOM-27 | **앰비언트 사운드 온/오프** — 숲/비/도시 소음 배경음, 호스트 통제, 기본값 OFF 또는 낮은 볼륨 | P1 | AudioMixer |
| ★ ROOM-16 | **자막/대사 실시간 번역** | P2 | — |

## VGEN — 협업 AI 영상생성 (메인뷰) ★신규

> 짝 문서: `STACK-COMPARE-VIDEOGEN.md`. 모두가 함께 프롬프트를 짜 메인뷰 영상을 생성·시청하고 그 위에 더빙 녹음.

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| ★ VGEN-01 | **협업 프롬프트 공동작성**(섹션분할 LWW) | P1 | LiveKit Text Streams |
| ★ VGEN-02 | **생성 트리거 + 크레딧 차감 게이트** | P1 | Edge/크레딧 |
| ★ VGEN-03 | **비동기 잡 상태 공유**(생성중/완료 reliable 브로드캐스트) | P1 | LiveKit/Workflows |
| ★ VGEN-04 | **결과 동시 재생**(메인뷰 소스교체, R2 서명URL) | P1 | R2 |
| ★ VGEN-05 | **프롬프트해시 dedup 캐시**(재생성 0원) | P1 | R2 |
| ★ VGEN-06 | **모더레이션**(프롬프트 사전 + 프레임 사후) | P0 | OpenAI Moderation |
| ★ VGEN-07 | **생성영상 위 음성 더빙 녹화**(영상→캔버스 텍스처→캡처 / Egress) | P1 | Pixi/LiveKit Egress |
| ★ VGEN-08 | **투표/합의 모드**(프롬프트안 제안·집계) | P2 | LiveKit |
| ★ VGEN-09 | **공급사 어댑터**(fal.ai 경유 Seedance 2.0, 교체가능) | P1 | 영상생성 API |
| ★ VGEN-10 | **레퍼런스 첨부**(아바타/장면 이미지를 생성 입력으로 — Seedance 멀티모달) | P2 | 영상생성 API |
| ★ VGEN-11 | **세로형 쇼츠 출력 포맷**(9:16, 최대 15초/클립 — 60초 쇼츠는 4클립 순차 합성) | P1 | 영상생성 API |
| ★ VGEN-12 | **완성 쇼츠 다운로드 + SNS 공유 링크 발급** | P1 | R2 |
| ★ VGEN-13 | **작품 라이브러리 검색·태그** — 녹화/VGEN/DUB 결과물을 검색·필터·공개범위 설정 | P2 | R2/Supabase |

## DUB — 기존 영상 기반 더빙 ★신규

> 기존 영상(MP4 업로드/YouTube URL)을 AI STT로 대본 자동 추출 후, 참가자들이 역할을 나눠 더빙 녹음하는 플로우. VGEN-07과 다름 — 이건 생성영상 기반이 아닌 **기존 콘텐츠** 기반.

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| DUB-01 | 기존 영상 업로드 — MP4 직접 업로드 | P1 | R2 |
| DUB-01b | YouTube URL 지원 | P2 | yt-dlp ⚠️법무검토필요 |
| DUB-02 | AI 대본 자동 추출(STT + 화자 분리 diarization) | P1 | OpenAI transcription/diarization server adapter (브라우저 STT 금지) |
| DUB-03 | 역할별 대사 자동 분배 + 수동 조정 | P1 | — |
| DUB-04 | 더빙 녹음 세션(영상 재생 ↔ 내 파트 녹음 동기화) | P1 | LiveKit |
| DUB-05 | 완성본 합성 — 원본 영상 재더빙(코어) + 다운로드; 버튜버 아바타 오버레이는 옵션(확장) | P2 | ffmpeg.wasm(재더빙)·LiveKit Egress(아바타 옵션) |
| ★ DUB-06 | **대본 자동 번역** — STT 대본을 JP/EN→KR 번역(gpt-4o-mini·호스트 [자동 번역] 트리거·원문/번역 토글). 사람이 번역 대본 보고 재녹음. "애니 자동 더빙" 완결 | P1 | OpenAI gpt-4o-mini |

## HOST — 방장·운영 (ROOM 내 콘솔)

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| HOST-01 | 강퇴 | P0 | LiveKit |
| HOST-02 | 참가자 비활성화(화면/음성 차단) | P1 | LiveKit |
| HOST-03 | 방 비밀번호 설정/잠금 | P0 | Supabase |
| HOST-04 | 슬롯 콘텐츠 교체 + **메인뷰 소스 전환(VOD↔AI생성)** | P1 | — |
| HOST-05 | 배경 선택(방장 권한) | P1 | — |
| HOST-06 | 방장 권위 상태 동기화 | P0 | LiveKit/Supabase |
| ★ HOST-07 | **영상생성 거버넌스**(트리거 권한·방 예산 상한·생성물 사전승인) | P1 | VGEN/크레딧 |
| ★ HOST-08 | **참가자 임시 음소거**(target user_id + duration, LiveKit `mutePublishedTrack`) | P1 | LiveKit |
| ★ HOST-09 | **슬로우 모드**(채팅 전송 간격 제한 — 초 단위 설정) | P1 | Supabase |
| ★ HOST-10 | **금칙어 필터**(방별 금지 단어 목록, 서버측 sanitize 연계) | P1 | Supabase |
| ★ HOST-11 | **채팅 클리어**(모든 메시지 일괄 삭제, 호스트 전용) | P1 | Supabase |
| ★ HOST-12 | **Stage Manager Overlay** — 참가자 상태·메인뷰·큐·채팅·VGEN·녹화 컨트롤을 한 화면에서 통제 | P1 | LiveKit/Supabase |
| ★ HOST-13 | **호스트 이탈/재접속 승계 UX** — 30초 임시 호스트, 복귀 시 권한 복원, 관전자 유지 모드 | P1 | LiveKit/Supabase |

## SETTINGS — 설정

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| SET-01 | 오디오 입출력 장치 선택 | P0 | — |
| SET-02 | 웹캠 선택 | P0 | — |
| SET-03 | 단축키(필살기 핫키) | P1 | — |
| SET-04 | 언어 ko/ja/en UI i18n | P1 | i18next |
| ★ SET-05 | **품질 자동/수동 조절**(저사양→렌더↓·인원 제한) | P1 | Pixi |
| ★ SET-06 | **노이즈 억제 ON/OFF**(krisp — 이미 의존성) | P1 | LiveKit |
| ★ SET-07 | **본인 통제**(개인 차단/뮤트·카메라 끄기·푸시투토크) | P1 | LiveKit |
| ★ SET-08 | **크레딧 잔액·사용량 표시 + 생성 품질/예산 선택**(해상도↔비용) | P1 | 크레딧 |
| ★ SET-14 | **알림 설정 센터**(PROFILE-03과 연계 — 예약·초대·방 가득 참·크레딧 소진 ON/OFF UI) | P1 | Supabase |

## COMMON — 실시간·콘텐츠·보안·모바일·인프라 (교차)

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| RT-01 | 음성 트랙(WebRTC audio) | P0 | LiveKit |
| RT-02 | 표정 데이터트랙 52ch lossy 30fps | P0 | LiveKit |
| RT-03 | 방 권위/상태 reliable 메시지 | P0 | LiveKit |
| RT-04 | One-Euro Filter + EMA 스무딩 | P0 | — |
| RT-05 | 메인뷰 타임스탬프 재동기(drift 보정) | P1 | — |
| CNT-01 | 슬롯 테마 콘텐츠(토크쇼·낭독극·게임) 카드 | P1 | — |
| CNT-02 | 대본 업로드/관리 | P1 | Supabase |
| CNT-03 | 배경 이미지 관리 | P1 | Supabase |
| CNT-04 | rig JSON + PNG 파츠 정적 호스팅 | P0 | CDN |
| CNT-05 | 모델 에셋 Storage | P0 | Supabase/R2 |
| ★ CNT-06 | **대본 라이브러리/장면 마켓** | P2 | Supabase |
| ★ CNT-07 | **방별 생성영상 히스토리/갤러리**(dedup 재사용·재생) — VGEN-12 이후 "내가 만든 거 어디 있지?" 해결 | P1 | R2/Supabase |
| ★ CNT-08 | **첫 방 템플릿** — 방 목적·첫 대본·첫 장면 추천으로 빈 방 이탈 방지 | P1 | Supabase |
| ★ CNT-09 | **시드 대본 팩** — 1인 연습·2인 짧은 씬·4~6인 단편극 5~10개와 난이도/시간/인원 태그 | P1 | Supabase seed |
| OBS-01 | 방송 송출용 옵션: 토큰 기반 투명 배경 출력 | P2 | `obs_viewer_tokens` |
| OBS-02 | 방송 송출용 옵션: 토큰 기반 크로마키 모드 | P2 | `obs_viewer_tokens` |
| OBS-03 | 방송 송출용 옵션: 토큰 기반 단일 아바타 풀스크린 | P2 | `obs_viewer_tokens` |
| OBS-04 | 방송용 클린 모드 + 브라우저 캡처 가이드(전체화면 무대, UI 크롬 숨김, 권장 해상도) | P1 | Docs/UI |
| SEC-01 | Supabase RLS | P0 | Supabase |
| SEC-02 | LiveKit 토큰 Edge Function 발급 | P0 | LiveKit/Supabase |
| SEC-03 | 웹캠·음성 실시간 공유 동의 | P0 | — |
| SEC-04 | 신고·차단·운영 moderation + audit sink | P0 | Supabase |
| SEC-05 | 연령 확인/청소년 보호 플로우 — 방 입장·게스트 데모·녹화·DUB·OBS·VGEN 서버 게이트에서 재검증 | P0 | Supabase users |
| SEC-06 | 오리지널 IP 정책(레퍼런스 캐릭터 격리) | P1 | — |
| ★ SEC-07 | **접근성**(자막·키보드 네비·색약) | P2 | — |
| MOB-01 | 데스크톱 우선(트래킹·송출 PC만). **P0 MVP에서 모바일 접속 = 뷰어 전용 리다이렉트**(MOB-02 진입) — 차단 에러 페이지 아님 | P0 | — |
| MOB-02 | 모바일 뷰어/관전/채팅 전용(트래킹 없음, 아바타 렌더만) | P1 | — |
| INF-01 | Vite + React SPA 정적 배포 | P0 | — |
| INF-02 | LiveKit Cloud → self-host 전환 경로 | P2 | LiveKit |
| INF-03 | Cloudflare Pages 호스팅 | P0 | Cloudflare |
| INF-04 | Supabase Auth/DB/Storage | P0 | Supabase |
| ★ INF-05 | **Cloudflare Workflows**(durable 비동기 잡 오케스트레이션) | P1 | Cloudflare |
| ★ INF-06 | **크레딧/쿼터 시스템**(유저 월·방당 동시·분당 토큰버킷) | P1 | Supabase/KV |
| ★ INF-07 | **에러추적·관측 + audit_logs 저장소**(Sentry류) | P0 | Supabase/Log sink |
| ★ INF-08 | **결제·크레딧 구매**(Stripe류, 무료 크레딧 소진 후) **+ 자동 환불**(VGEN/DUB 실패 시 100% 크레딧 복구) | P1 | Stripe/자동 환불 정책 |
| ★ SEC-08 | **생성물 모더레이션 파이프라인**(프롬프트 사전 + 프레임 사후) | P0 | OpenAI Moderation |

## JAPAN — 일본 특화 기능

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| ★ JAPAN-01 | **JPY 통화 표시 + 자동 환율** — 한국(KRW)/일본(JPY) 자동 감지, 크레딧 표시 시 환율 적용 | P1 | Supabase/환율 API |
| ★ JAPAN-02 | **일본 결제 수단** — 편의점 결제(Rakuten Pay, au PAY), 휴대폰 결제 옵션 추가 | P1 | Stripe/결제 provider |
| ★ JAPAN-03 | **강화된 연령확인**(일본 법규) — 15세 이상 별도 동의, 보호자 메일 인증 경로 추가 | P1 | Supabase/이메일 |

## ECON / COMMUNITY / ANALYTICS / EXT — 성장·수익화·외부 연동

| ID | 기능 | 우선 | 의존 |
|---|---|---|---|
| ★ ECON-01 | **관객 선물/후원** — 공연 중 배우·방·극단에 gift/tip 전송, 무대 위 짧은 시각 효과와 감사 메시지 표시 | P2 | INF-08, SEC-04 |
| ★ ECON-02 | **크리에이터 정산·payout ledger** — 후원/구독/마켓 수익을 creator balance로 집계하고 KYC/세금 검토 후 지급 | P2 | 결제 provider, 법무 |
| ★ ECON-03 | **크리에이터 멤버십/구독 패스** — 극단 또는 배우별 supporter tier, 멤버 전용 방/대본/리플레이 접근 | P2 | ECON-02, room visibility |
| ★ COM-01 | **극단/크루/Creator Club** — 자주 함께하는 팀, 프로필, 멤버 역할, 공유 대본·씬·템플릿 묶음 | P2 | PROFILE, CNT-08 |
| ★ COM-02 | **공식 이벤트/컨테스트** — 운영자가 주제·기간·심사 기준을 열고 공연/클립 제출을 받는 성장 루프 | P2 | ROOM-13, CNT-07 |
| ★ ANA-01 | **창작자용 공연 분석 대시보드** — 관객 수, 리액션 피크, 이탈 지점, 클립/리플레이 성과를 방장·극단에 표시 | P1 | MonitoringDashboard G-178 |
| ★ EXT-01 | **외부 방송 트리거** — Twitch/YouTube chat·subscribe·redeem·raid 이벤트를 안전한 allowlist 액션으로 변환 | P2 | OAuth/webhook, HOST-12 |

---

## 회의 운용

- 배치·우선순위·상태 토론은 `meeting/index.html`(자유 캔버스)에서. 더블클릭 편집·메모·영역 박스 자유 생성.
- 회의 종료 시 보드에서 **JSON Export** → 합의 결과를 이 문서에 역반영(배치영역·확정 상태).
- 이 문서가 SSOT, HTML은 회의 스냅샷.
