---
tags: [spec]
---

> G-124 산출 문서. MediaPipe FaceLandmarker 모델·WASM·로드 전략·iOS 폴백.

# MediaPipeConfig — FaceLandmarker WASM 모델 및 로드 전략

Updated: 2026-06-30

---

## 1. 모델 선택: Full vs Lite

**snack-web은 Full 모델 채택** — ARKit 52 블렌드쉐이프 정확도 필수.

| 구분 | Lite | Full | **선택** |
|---|---|---|---|
| 블렌드쉐이프 | 제한 (낮은 정확도) | 52개 완전 지원 | ✅ Full |
| 모델 크기 | ~9MB | ~17MB | 트래픽 비용 무시 |
| 웹 성능 (초기화) | <1s | <2s | 양호 |
| CPU 부하 (30fps 비디오) | 저 | 중 | GPU 추론 권장 |
| iPhone 13 테스트 | 불가 (WASM 미지원) | 불가 (WASM 미지원) | 키보드 폴백 필수 |

**MUST NOT:** 비용 절감 목적의 Lite 모델 전환. 성능 저하 시 Full 모델 계속 사용.

---

## 2. WASM 변종 및 브라우저 지원

### 2.1 변종별 특성

| 변종 | 파일명 | 크기 | SIMD | 지원 브라우저 | 성능 |
|---|---|---|---|---|---|
| **SIMD** | `vision_wasm_internal.wasm` | ~17MB | ✅ | Chrome v91+, Firefox v89+, Safari 16.4+, Edge v91+ | **⚡ 30fps** |
| **Non-SIMD** | `vision_wasm_nosimd.wasm` | ~15MB | ❌ | 모든 브라우저 | 15fps (폴백) |

**LiveKit WebRTC와 MediaPipe는 GPU 추론 권장:**
- WebGL (Tensor 우선) → CPU 펴(WASM SIMD) → CPU 느림(WASM Non-SIMD)

### 2.2 자동 선택 (FilesetResolver)

```typescript
// src/lib/mediapipe.ts
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

const faceLandmarker = await FaceLandmarker.createFromOptions(
  await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
    // 자동으로:
    // 1. SIMD 지원 → vision_wasm_internal.wasm 로드
    // 2. SIMD 미지원 → vision_wasm_nosimd.wasm 로드
  ),
  {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    },
    outputFaceBlendshapes: true, // 52ch ARKit 출력
    runningMode: 'VIDEO',       // 스트림 모드
    numFaces: 1,                // 단일 사용자 (다중은 P2)
    minFaceDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
    minPresenceConfidence: 0.5,
  }
);
```

### 2.3 브라우저 확인 로직

```typescript
// src/lib/mediapipe/capabilities.ts
export function checkMediaPipeSupport(): boolean {
  // SIMD 필수 조건: SharedArrayBuffer + crossOriginIsolated
  try {
    // SharedArrayBuffer 기본 가용성 (Node 아님)
    if (typeof SharedArrayBuffer === 'undefined') {
      console.warn('SharedArrayBuffer 미지원 → Non-SIMD로 폴백');
      return false;
    }
    
    // Vite dev 환경 주의: crossOriginIsolated = false
    // 배포(Cloudflare Pages): `Cross-Origin-Opener-Policy: same-origin` 헤더 필수
    if (!crossOriginIsolated) {
      console.warn('crossOriginIsolated=false → Non-SIMD로 폴백');
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// Vite 설정: dev 환경에서 테스트하려면
// vite.config.ts:
export default {
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};
```

---

## 3. 로드 전략: CDN vs 자체 호스팅

### 3.1 권장: Google Storage CDN + jsdelivr 캐시

**비용:** 무료 (Google 제공)
**지연:** <50ms (전지역 캐시)
**업데이트:** 자동 (MediaPipe 버전 업 추적)

```typescript
// src/lib/mediapipe.ts
const VERSION = '0.10.21'; // MediaPipe @latest 핀

const faceLandmarker = await FaceLandmarker.createFromOptions(
  await FilesetResolver.forVisionTasks(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`
  ),
  // ...
);
```

**모델 파일 URL** (2026-07-02 검증: 200/3.75MB float16. 구 경로 `mediapipe-tasks/vision/...` 는 404):
```
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

### 3.2 대안: R2 자체 호스팅 (P2 확장성)

DAU 10,000+ 기준 검토. 비용 R2 egress $0.01/GB (월 $200+).

```bash
# 초기 업로드 (1회)
aws s3 cp face_landmarker.task s3://chatterbox-assets/mediapipe/ --endpoint https://r2.example.com

# public 읽기 허가 (CloudFlare Workers)
```

### 3.3 사전 캐시 (`<link rel="preload">`)

```html
<!-- index.html -->
<head>
  <!-- WASM 모듈 (브라우저별 자동 선택) -->
  <link rel="preload" as="fetch" href="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm/vision_wasm_internal.wasm" crossorigin>
  
  <!-- 모델 파일 (20MB, 크거나 지연 로드 가능) -->
  <!-- <link rel="preload" as="fetch" href="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" crossorigin> -->
</head>
```

**주의:** 모델 파일은 `/models` 라우트 진입 시만 로드 (랜딩 속도 영향).

---

## 4. FaceLandmarker 초기화 및 추론

### 4.1 초기화 (한 번만, 루트 전역 상태)

```typescript
// src/stores/trackingStore.ts (Zustand)
import { create } from 'zustand';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

interface TrackingStore {
  faceLandmarker: FaceLandmarker | null;
  isInitialized: boolean;
  initFaceLandmarker: () => Promise<void>;
  extractBlendshapes: (videoFrame: HTMLVideoElement) => number[] | null;
}

export const useTrackingStore = create<TrackingStore>((set, get) => ({
  faceLandmarker: null,
  isInitialized: false,
  
  initFaceLandmarker: async () => {
    try {
      const faceLandmarker = await FaceLandmarker.createFromOptions(
        await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
        ),
        {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        }
      );
      
      set({ faceLandmarker, isInitialized: true });
    } catch (error) {
      console.error('FaceLandmarker 초기화 실패:', error);
      set({ isInitialized: false }); // iOS Safari 폴백 트리거
    }
  },
  
  extractBlendshapes: (videoFrame) => {
    const { faceLandmarker } = get();
    if (!faceLandmarker) return null;
    
    const result = faceLandmarker.detectForVideo(videoFrame, Date.now());
    if (result.faceBlendshapes?.[0]?.categories) {
      return result.faceBlendshapes[0].categories.map(c => c.score);
    }
    return null;
  },
}));
```

### 4.2 추론 루프 (Web Worker 권장)

```typescript
// src/workers/face-tracking.worker.ts
import { useTrackingStore } from '../stores/trackingStore';

let lastTimestampMs = 0;

self.onmessage = (event: MessageEvent<HTMLVideoElement>) => {
  const video = event.data;
  const now = performance.now();
  
  if (now - lastTimestampMs < 1000 / 30) return; // 30fps 스로틀
  
  lastTimestampMs = now;
  
  const blendshapes = useTrackingStore.getState().extractBlendshapes(video);
  if (blendshapes) {
    self.postMessage({
      type: 'blendshapes',
      data: blendshapes,
      timestamp: now,
    });
  }
};

// src/hooks/useWebcam.ts
const worker = new Worker(new URL('../workers/face-tracking.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (event) => {
  if (event.data.type === 'blendshapes') {
    // Data Track으로 송신
    roomStore.publishBlendshapes(event.data.data);
  }
};

// 매 비디오 프레임마다 worker로 전달
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
const video = document.createElement('video');
video.srcObject = stream;
video.play();

const loop = () => {
  worker.postMessage(video);
  requestAnimationFrame(loop);
};
loop();
```

---

## 5. iOS Safari 폴백 전략

**제한:** iOS Safari는 WASM 동작하나 WebGL 불안정 → 얼굴 추론 불가능.
**해결:** 키보드 표정 트리거 + 음성 전송 (아바타 애니메이션 제외).

### 5.1 iOS 감지

```typescript
// src/lib/mediapipe/fallback.ts
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|Firefox/.test(ua);
  return isIOS && isSafari;
}

export async function initializeTracking(): Promise<'full' | 'lite' | 'keyboard'> {
  if (isIOSSafari()) {
    console.warn('iOS Safari 감지 → 키보드 표정 폴백');
    useTrackingStore.setState({ fallbackMode: 'keyboard' });
    return 'keyboard';
  }
  
  try {
    await useTrackingStore.getState().initFaceLandmarker();
    return 'full';
  } catch {
    console.warn('WASM 초기화 실패 → 키보드 폴백');
    return 'keyboard';
  }
}
```

### 5.2 키보드 표정 트리거 UI

```typescript
// src/components/KeyboardExpressionTrigger.tsx
export function KeyboardExpressionTrigger() {
  const trackingStore = useTrackingStore();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const expressionMap: Record<string, number> = {
        '1': 0,    // 기쁨 (joy)
        '2': 1,    // 놀람 (surprise)
        '3': 2,    // 슬픔 (sadness)
        '4': 3,    // 화남 (anger)
        '5': 4,    // 기본 (neutral)
      };
      
      if (e.key in expressionMap) {
        const blendshapes = new Array(52).fill(0); // ARKit 52개
        blendshapes[expressionMap[e.key]] = 1.0;  // 해당 표정 활성화
        
        // Store에 직접 주입 (FaceLandmarker 없이)
        useTrackingStore.setState({ 
          currentBlendshapes: blendshapes,
          source: 'keyboard',
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  return (
    <div className="fixed bottom-4 right-4 text-sm text-gray-400">
      <p>얼굴 트래킹을 지원하지 않는 기기입니다</p>
      <div className="mt-2 space-y-1 text-xs">
        <p>[1] 기쁨 😊 | [2] 놀람 😮</p>
        <p>[3] 슬픔 😢 | [4] 화남 😠</p>
        <p>[5] 기본 😐</p>
      </div>
    </div>
  );
}
```

### 5.3 Data Track 송신 (키보드 표정도 동일)

```typescript
// src/hooks/useRoom.ts
const { blendshapes } = useTrackingStore();
if (blendshapes) {
  dataChannel.send(JSON.stringify({
    type: 'blendshape',
    data: blendshapes,
    source: trackingStore.fallbackMode === 'keyboard' ? 'keyboard' : 'mediapipe',
  }));
}
```

---

## 6. Vite 설정 주의사항

### 6.1 WASM 번들 제외 (CDN 로드만)

```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@mediapipe/tasks-vision', // WASM은 번들링 제외
    ],
  },
  build: {
    rollupOptions: {
      external: ['@mediapipe/tasks-vision'],
    },
  },
  server: {
    // dev 환경: crossOriginIsolated 헤더 필수
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

### 6.2 모델 파일 미리로드 (조건부)

```typescript
// src/app/App.tsx
useEffect(() => {
  if (location.pathname === '/models') {
    // 모델 선택 페이지 진입 시만 미리로드
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'fetch';
    link.href = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}, [location.pathname]);
```

---

## 7. MUST NOT 체크리스트

- **❌** iOS 폴백 없이 배포 금지 (사용자 경험 악화)
  - 테스트: iPhone 실기 또는 Safari DevTools 원격 디버깅
  
- **❌** Lite 모델로 비용 절감 시도
  - 52개 블렌드쉐이프 정확도가 핵심 UX
  
- **❌** 로컬 WASM 파일 번들에 포함 금지
  - 초기 번들 크기 17MB 증가 → 번들 5KB 크기 감소 무의미
  
- **❌** FaceLandmarker를 메인 스레드에서 30fps 추론
  - Web Worker로 분리 (지연 감소)
  
- **❌** 배포 후 모델 파일 URL 변경 금지
  - 버전 핀: `@0.10.21` 고정 (MediaPipe 공식 권장)

---

## 8. 구현 체크리스트

- [ ] trackingStore.ts에서 FaceLandmarker 초기화 로직 구현
- [ ] useWebcam.ts에 Web Worker 통합
- [ ] MediaPipeConfig.md 문서 참고하여 iOS 폴백 구현
  - [ ] isIOSSafari() 감지 함수
  - [ ] KeyboardExpressionTrigger 컴포넌트 + 1~5 키 바인딩
  - [ ] 폴백 UI 토스트 메시지 추가
- [ ] vite.config.ts에 CORS 헤더 추가 (dev 환경)
- [ ] 로컬 테스트: Chrome DevTools에서 WASM 성능 측정
  - [ ] FaceLandmarker 초기화: <2s 목표
  - [ ] 추론 시간: <33ms (30fps)
- [ ] Safari iOS 15+ 실기 테스트 (원격 디버깅)
- [ ] 배포: Cloudflare Pages CORS 헤더 확인 (`Cross-Origin-Opener-Policy`)
