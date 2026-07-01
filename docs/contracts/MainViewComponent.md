---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 8. MainViewComponent

무대 중앙 메인뷰. 배경영상(CDN/R2) 또는 AI생성영상 재생. 모든 참가자가 동일 타임스탬프로 동기화. VGen(AI 생성) 모드 및 DUB(더빙 비디오) 오버레이 지원.

## Props Interface

```typescript
interface MainViewComponentProps {
  /**
   * 현재 room의 ID
   */
  roomId: string;

  /**
   * 초기 배경 URL (CDN/R2)
   * (선택) 없으면 기본 배경 사용
   */
  initialBackgroundUrl?: string;

  /**
   * 전환 애니메이션 타입
   * (선택) 기본값 'fade'
   */
  transitionType?: 'fade' | 'dissolve' | 'slide';

  /**
   * 로드 완료 콜백
   */
  onReady?: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `stageStore` | `backgroundUrl` | ✓ | | 현재 배경 URL (구독) |
| `stageStore` | `isTransitioning` | ✓ | ✓ | 전환 중 여부 |
| `stageStore` | `mode` | ✓ | | 현재 재생 모드 ('normal' \| 'vgen' \| 'dub') |
| `stageStore` | `vgenPrompt` | ✓ | | VGen 프롬프트 텍스트 (VGen 모드 활성 시) |
| `stageStore` | `dubVideoUrl` | ✓ | | DUB 비디오 URL (DUB 모드 활성 시) |
| `stageStore` | `mediaObjectKey` | ✓ | ✓ | signed URL 재발급용 R2 object key |
| `stageStore` | `setMode` | | ✓ | 모드 변경 함수 |
| `roomStore` | `connectionState` | ✓ | | 연결 상태 (bg 로드 시) |

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `room-authority` (reliable) | `{type: 'bg_change', payload: {background_url}}` | 배경 변경 신호 (타임스탬프 동기) |
| `room-authority` (reliable) | `{type: 'vgen_mode_open', payload: {prompt: string}}` | VGen 패널 활성화 + 프롬프트 전달 |
| `room-authority` (reliable) | `{type: 'vgen_mode_close'}` | VGen 패널 닫기, mode → 'normal' |
| `room-authority` (reliable) | `{type: 'vgen_result', payload: {url: string, timestamp: number}}` | VGen 생성 완료, 배경 URL 갱신 |
| `room-authority` (reliable) | `{type: 'dub_mode_open', payload: {url: string}}` | DUB 모드 활성화 + 더빙 비디오 URL |
| `room-authority` (reliable) | `{type: 'dub_mode_close'}` | DUB 모드 닫기, mode → 'normal' |

**발행:** 없음 (수신만).

## Signed URL 재발급 (401/403 복구)

배경 영상 재생 중 인증 오류 발생 시 자동으로 서명 URL을 재발급한다.

### 에러 감지 및 재발급 플로우

```typescript
async function handleVideoError(event: Event) {
  const video = event.target as HTMLVideoElement;
  
  // 401/403 감지 (NetworkError 또는 로드 실패)
  if (video.error?.code === 4) {  // MEDIA_ERR_SRC_NOT_SUPPORTED or network error
    console.warn('Signed URL expired (401/403). Requesting refresh...');
    
    // Step 1: 로딩 스피너 표시
    setIsRefreshingUrl(true);
    
    try {
      // Step 2: Edge Function으로 새 서명 URL 발급
      // mediaObjectKey는 stageStore에서 관리 (R2 object path)
      const { data, error } = await supabase.functions.invoke('refresh-signed-url', {
        body: {
          object_key: stageStore.mediaObjectKey,
          bucket: 'backgrounds', // 또는 'generations' for VGEN results
        },
      });
      
      if (error || !data?.signed_url) {
        throw new Error('URL 재발급 실패');
      }
      
      // Step 3: 비디오 현재 위치 저장
      const previousTime = video.currentTime;
      const previousRate = video.playbackRate;
      
      // Step 4: 새 URL로 비디오 소스 업데이트
      video.src = data.signed_url;
      
      // Step 5: 재생 상태 복구
      video.currentTime = previousTime;
      video.playbackRate = previousRate;
      video.play();
      
      // Step 6: 로딩 스피너 숨김
      setIsRefreshingUrl(false);
    } catch (error) {
      console.error('Failed to refresh signed URL:', error);
      
      // 실패 시 사용자 피드백
      showToast('배경 로드 실패. 다시 시도해주세요.', { type: 'error' });
      
      // "재시도" 버튼 제공
      setRetryError(true);
      setIsRefreshingUrl(false);
    }
  }
}

function renderRefreshingOverlay() {
  if (!isRefreshingUrl) return null;
  
  return (
    <div className="url-refresh-overlay" style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    }}>
      <div className="loading-spinner">
        <p>배경 로드 중...</p>
        <Spinner />
      </div>
    </div>
  );
}

function renderRetryButton() {
  if (!retryError) return null;
  
  return (
    <div className="retry-banner" style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.8)',
      padding: '12px 20px',
      borderRadius: '8px',
      color: '#fff',
      zIndex: 11,
    }}>
      <span>배경을 불러올 수 없습니다</span>
      <button onClick={() => {
        handleVideoError({ target: videoRef.current } as any);
        setRetryError(false);
      }}>
        재시도
      </button>
    </div>
  );
}
```

**MUST NOT:**
- ❌ 사용자 개입 없이 무한 재시도 (최대 1회만)
- ❌ 재발급 중 영상 일시정지 후 복귀 중에 UI 끊김
- ❌ 오래된 currentTime 값으로 복구 (drift 방지, timestamp 기반 동기화 필수)

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onDataChannelMessage(channel='room-authority')` | MainViewComponent | 메시지 타입별 처리: bg_change (배경 교체), vgen_mode_* (모드 전환), dub_mode_* (모드 전환), vgen_result (배경 갱신) |

## Supabase 접근

| 테이블 | 작업 | 시점 |
|---|---|---|
| `rooms` | background_url 조회 (캐시) | room 진입 시 |

**Realtime:** 불필요 (DataChannel room-authority로 동기).

## 레이어 구조 (Z-Index Stack)

```
z-0  배경 씬
     ├─ 조건: 항상 표시
     ├─ 내용: CSS background-image 또는 <video> (normal 모드)
     └─ 설명: 가장 하단 레이어, 배경영상 또는 정적 배경

z-1  PixiJS 캔버스 + AvatarCanvas
     ├─ 조건: mode가 'normal' 또는 'vgen'일 때만 pointer-events: auto
     ├─ 내용: 파티클 효과, 아바타 캔버스 (렌더링)
     └─ CSS: pointer-events: none (dub 모드 시)

z-2  DUB 비디오 오버레이
     ├─ 조건: mode === 'dub'일 때만 display: block
     ├─ 내용: <video>, 더빙 콘텐츠
     └─ CSS: position: absolute, width: 100%, height: 100%

z-3  VGen 프롬프트 패널
     ├─ 조건: mode === 'vgen'일 때만 display: block
     ├─ 내용: 협업 textarea, 프롬프트 입력, 생성 버튼
     ├─ y-범위: 하단 25% 영역
     └─ CSS: background: rgba(...), backdrop-filter

z-4  채팅 오버레이
     ├─ 조건: 항상 표시
     ├─ 내용: 메시지 버블 (불씨처럼 위로 떠오르는 애니메이션)
     ├─ y-범위: 0~73% (VGen 패널과 겹치지 않음)
     └─ CSS: pointer-events: none

z-5  UI 크롬 (컨트롤 + 토글)
     ├─ 조건: 항상 표시
     ├─ 내용: 소스 토글 버튼 (우상단), 컨트롤 바 (하단 20%)
     │        VOD/AI 생성 토글, ▶/⏭/스크러버/시간/배속/⚙/⛶
     └─ CSS: pointer-events: auto
```

## 모드별 렌더 규칙

### mode === 'normal'
- z-0: background_url 비디오 또는 정적 배경 표시
- z-1: AvatarCanvas 표시 (pointer-events: auto)
- z-2: DUB 비디오 → display: none
- z-3: VGen 패널 → display: none
- z-4: 채팅 오버레이 표시 (전체 높이)
- z-5: UI 크롬 표시

### mode === 'vgen'
- z-0: background_url 비디오 계속 재생
- z-1: AvatarCanvas 표시 (pointer-events: auto)
- z-2: DUB 비디오 → display: none
- z-3: VGen 프롬프트 패널 표시 (하단 25%)
- z-4: 채팅 오버레이 표시 (y-범위 0~73%, z-3과 겹치지 않음)
- z-5: UI 크롬 표시
- **동작:** textarea에서 프롬프트 입력 가능, 생성 버튼 클릭 → room-authority로 "vgen_result" 수신 대기 → background_url 갱신

### mode === 'dub'
- z-0: background_url 숨김 (z-2가 전체 덮음)
- z-1: AvatarCanvas 표시하지 않음 (pointer-events: none)
- z-2: DUB 비디오 오버레이 표시 (전체 화면)
- z-3: VGen 패널 → display: none
- z-4: 채팅 오버레이 표시 (하단 비디오와 겹침, pointer-events: none)
- z-5: UI 크롬 표시 (토글, 컨트롤 바)

## 금지 사항 (MUST NOT)

- ❌ 독립적으로 배경 URL 변경 (DataChannel room-authority 수신 필수)
- ❌ 직접 타임스탬프 계산 없이 소스 교체 (drift 방지, DataChannel timestamp 사용)
- ❌ 비디오 재생 진행 중 source 교체 (currentTime 동기화 필수)
- ❌ signed URL 401/403 발생 시 사용자를 끊긴 상태로 방치 (object_key로 재발급 필수)
- ❌ stageStore.backgroundUrl를 직접 쓰기 (읽기 전용, HostConsole이 발행)
- ❌ 로드 실패 시 자동 fallback 없이 에러만 발생 (user feedback 필수)
- ❌ VGen 모드와 DUB 모드 동시 활성화 (mode는 항상 단일 상태: 'normal' | 'vgen' | 'dub')
- ❌ ChatOverlay에 pointer-events: auto 설정 (항상 pointer-events: none)
- ❌ z-index 임의 변경 (이 문서의 스택 정의 필수 준수)
- ❌ VGen 패널이 활성일 때 배경 비디오 source 교체 (프롬프트 입력 중 끊김 방지)
- ❌ DUB 모드에서 AvatarCanvas 렌더링 (z-2가 전체를 덮음, 불필요한 성능 소모)

## 컴포넌트 관계

```
[MainViewComponent]
  ├─ subscribe: stageStore.backgroundUrl
  ├─ subscribe: stageStore.mode
  ├─ subscribe: stageStore.vgenPrompt (mode === 'vgen'일 때만)
  ├─ subscribe: stageStore.dubVideoUrl (mode === 'dub'일 때만)
  ├─ subscribe: room-authority DataChannel (모든 메시지 타입)
  │
  ├─ [z-0] HTMLVideoElement (배경)
  │  ├─ src: background_url (from CDN/R2)
  │  ├─ autoplay: true
  │  ├─ muted: true (audio from AudioMixer)
  │  ├─ loop: true (if suitable)
  │  └─ visibility: hidden (mode === 'dub')
  │
  ├─ [z-1] PixiJS AvatarCanvas
  │  ├─ display: block (mode !== 'dub')
  │  ├─ pointer-events: auto (mode === 'normal' or 'vgen')
  │  └─ pointer-events: none (mode === 'dub')
  │
  ├─ [z-2] DUB Video Overlay
  │  ├─ display: block (mode === 'dub')
  │  ├─ src: stageStore.dubVideoUrl
  │  ├─ position: absolute, width: 100%, height: 100%
  │  └─ autoplay, muted
  │
  ├─ [z-3] VGen Prompt Panel
  │  ├─ display: block (mode === 'vgen')
  │  ├─ textarea: stageStore.vgenPrompt (ref)
  │  ├─ position: absolute, bottom: 0, height: 25%
  │  └─ z-index: 3, background: rgba with backdrop-filter
  │
  ├─ [z-4] ChatOverlay
  │  ├─ display: block (항상)
  │  ├─ pointer-events: none (필수)
  │  ├─ max-y: 73% (VGen 패널 회피)
  │  └─ animation: messages drift upwards (flame-like)
  │
  ├─ [z-5] UI Chrome
  │  ├─ Source Toggle (top-right)
  │  │  ├─ VOD / 🤖 AI생성 토글
  │  │  └─ onclick: setMode('normal') 또는 setMode('vgen')
  │  │
  │  └─ Control Bar (bottom 20%)
  │     ├─ ▶ / ⏭ (play, skip)
  │     ├─ Scrubber (currentTime 동기)
  │     ├─ Time display (HH:MM:SS)
  │     ├─ Playback speed (1.25x, 1.5x, 2x)
  │     ├─ Settings (⚙)
  │     └─ Fullscreen (⛶)
  │
  ├─ on background_url change (room-authority bg_change):
  │  ├─ if isTransitioning: wait for completion
  │  ├─ preload: HTMLVideoElement with new URL
  │  ├─ set: stageStore.isTransitioning = true
  │  ├─ animate: CSS fade/dissolve transition (z-0)
  │  ├─ on animation end: swap video source, set isTransitioning = false
  │  └─ maintain currentTime sync (from DataChannel timestamp)
  │
  ├─ on vgen_mode_open (room-authority vgen_mode_open):
  │  ├─ set: stageStore.mode = 'vgen'
  │  ├─ set: stageStore.vgenPrompt = payload.prompt
  │  ├─ [z-3] VGen Panel display: block
  │  └─ focus: textarea, ready for co-editing
  │
  ├─ on vgen_mode_close (room-authority vgen_mode_close):
  │  ├─ set: stageStore.mode = 'normal'
  │  ├─ [z-3] VGen Panel display: none
  │  └─ clear: stageStore.vgenPrompt
  │
  ├─ on vgen_result (room-authority vgen_result):
  │  ├─ set: stageStore.backgroundUrl = payload.url
  │  ├─ preload + transition (위의 bg_change 플로우 동일)
  │  └─ mode는 유지 (VGen 계속)
  │
  ├─ on dub_mode_open (room-authority dub_mode_open):
  │  ├─ set: stageStore.mode = 'dub'
  │  ├─ set: stageStore.dubVideoUrl = payload.url
  │  ├─ [z-2] DUB Video display: block, src = dubVideoUrl
  │  └─ [z-1] AvatarCanvas pointer-events: none
  │
  ├─ on dub_mode_close (room-authority dub_mode_close):
  │  ├─ set: stageStore.mode = 'normal'
  │  ├─ [z-2] DUB Video display: none
  │  └─ [z-1] AvatarCanvas pointer-events: auto
  │
  └─ error handling:
     ├─ bg preload fails: show toast, keep previous video, emit onError
     ├─ media 401/403: request fresh signed URL by object_key, restore currentTime/playbackRate, retry once
     ├─ dub video fails: show toast, switch back to 'normal' mode
     └─ DataChannel disconnect: pause playback, show connection warning
```

## 관련 문서

- `contracts/_INDEX.md` — DataChannel 레지스트리, 공유 타입 정의
- `contracts/HostConsole.md` — bg_change, vgen_mode_*, dub_mode_* 발행 주체
- `contracts/stageStore.md` — mode, background_url, vgenPrompt, dubVideoUrl 상태 관리
- `contracts/ChatOverlay.md` — z-4 채팅 메시지 렌더링
- `design/DESIGN-DIRECTION.md` §6.5, §6.7, §6.8, §6.9 — UI 레이아웃, z-index 스택, VGen/DUB 패널 스펙
