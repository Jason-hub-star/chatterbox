---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 8. Tracking (MediaPipe FaceLandmarker) State Machine [개발 예정]

## State Diagram

```
┌──────────────┐
│ UNSUPPORTED  │ (iOS Safari or no webcam)
└────┬─────────┘
     │ (stays here; no tracking available)
     │
     ▼
┌───────┐ ◄─────────────────────────────────────┐
│ IDLE  │ (WASM not loaded; webcam not started) │
└───┬───┘                                        │
    │ user enters room (CONNECTED state)         │
    │ + browser supported (not iOS Safari)       │
    ▼                                            │
┌──────────────┐                                 │
│ INITIALIZING │ (WASM download + compile)       │
└────┬─────────┘                                 │
     │ success                                   │
     ▼                                           │
┌────────────┐                                   │
│ CALIBRATING│ (3-step wizard in /models page)   │
└────┬───────┘                                   │
     │ finish calibration                        │
     │ → save offsets to Zustand                 │
     ▼                                           │
┌──────────────┐                                 │
│  TRACKING    │ (52ch @ 30fps via DataChannel)  │
└────┬────────┬┴────────────────────────┐        │
     │ tab bg │ leave room              │        │
     ▼ or     │                         │        │
   PAUSED     │                         ▼        │
   (stays)    │                      IDLE ◄──────┘
              │
              └──────────────────────────────────►

Error path (parallel):
    (INITIALIZING failure, WASM load fail)
    ▼
  ┌───────┐
  │ ERROR │ (show error modal; fallback to viewer mode)
  └───────┘
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| UNSUPPORTED | UNSUPPORTED | Browser is iOS Safari or no webcam | `trackingStore.checkBrowserSupport()` on init | Permanent; user shown "Expression unavailable" badge |
| IDLE | INITIALIZING | User enters CONNECTED room + supported browser | `trackingStore.startTracking()` | WASM download begins (~5MB, takes ~2s) |
| INITIALIZING | CALIBRATING | WASM loaded + webcam stream obtained | `trackingStore.onInitSuccess()` | Navigate to /models calibration wizard |
| INITIALIZING | ERROR | WASM load timeout (>10s) or webcam denied | `trackingStore.onInitError(error)` | Show "Setup failed" modal + fallback to viewer mode |
| CALIBRATING | TRACKING | User completes 3-step wizard | `trackingStore.saveCalibration(offsets)` | Offsets saved to Zustand + localStorage |
| CALIBRATING | IDLE | User cancels calibration | `trackingStore.cancelCalibration()` | Navigate back; tracking disabled until retry |
| TRACKING | PAUSED | Tab goes to background or user minimizes app | `window.visibilitychange` listener | rAF paused; Worker idle but not terminated |
| PAUSED | TRACKING | Tab returns to foreground | `window.visibilitychange` listener | rAF resumed; Worker resumes blendshape extraction |
| TRACKING | IDLE | User leaves room | `roomStore.leaveRoom()` | Worker terminated; resources freed |
| TRACKING | ERROR | Worker crash or FaceLandmarker runtime error | Worker error handler | Auto-restart Worker 1x; if fails, go to ERROR |
| ERROR | IDLE | User clicks "Retry" in error modal | `trackingStore.retryTracking()` | Attempt INITIALIZING again |
| ERROR | IDLE | User dismisses error modal | `trackingStore.dismissError()` | Fall back to viewer mode (voice + chat only) |

## Calibration Wizard (3-Step)

Step 1: **Reference Capture**
- User holds neutral face for 2s (countdown timer)
- Capture baseline 52ch values
- Save as `calibrationOffsets.neutral`

Step 2: **Expression Test**
- Prompt: "Raise eyebrows" → capture, display as `offsets.eyes_up`
- Prompt: "Smile" → capture, display as `offsets.mouth_smile`
- Prompt: "Puff cheeks" → capture, display as `offsets.cheeks_puff`
- Real-time preview: show captured values on UI
- User can retake any step

Step 3: **Save & Confirm**
- Summary: show all 3 captured offsets + preview blendshape response
- User clicks "Save" → stored to `trackingStore.calibrationOffsets + localStorage`
- User clicks "Skip" → use default offsets (⚠️ accuracy reduced)

## MediaPipe Integration

**Blendshape Extraction** (Web Worker):
- Input: video frame from webcam (via OffscreenCanvas)
- MediaPipe.FaceLandmarker: 478 landmarks + 52 blendshape coefficients
- Output: `{ blendshapes: [float32 x 52], timestamp_ms }`
- Frequency: 30 fps (every ~33ms)

**Smoothing** (Web Worker):
- One-Euro Filter: remove jitter (fc=0.5Hz, beta=0.1)
- EMA (α=0.3): dampen rapid changes
- Output: smoothed 52ch to DataChannel

**DataChannel Protocol**:
```javascript
const trackingChannel = room.createDataChannel('blendshape', { ordered: false });
// Send every frame after validation fields are attached.
trackingChannel.send(JSON.stringify({
  blendshapes: Float32Array(52),
  timestamp_ms: Date.now(),
  calibration_version: 1,
  seq,
  byte_length: 208,
  crc16
}));
```

## Edge Cases

1. **iOS Safari / WebView**
   - No Web Worker support OR no webcam API
   - State locked to UNSUPPORTED
   - User shown: "Expression tracking not available on this device. Voice + chat enabled."
   - Fallback: auto-join as viewer (voice + avatar static, no blendshapes)

2. **Webcam Permission Denied**
   - INITIALIZING → ERROR (permission check fails)
   - User shown: "Camera permission required for expressions. Grant permission to enable."
   - Can retry anytime from settings; doesn't block room entry

3. **Web Worker Crash**
   - TRACKING → ERROR (worker.onerror fired)
   - Auto-restart Worker 1x: `new Worker('mediapipe.worker.ts')`
   - If restart succeeds: TRACKING resumes
   - If restart fails: ERROR persists; user fallback to viewer mode

4. **Tab Background for 5+ Minutes**
   - TRACKING → PAUSED (visibilitychange)
   - Worker idle; MediaPipe not processing
   - If tab returns: resume TRACKING
   - If session expires while backgrounded: reauth on return (separate flow)

5. **Calibration Data Not Found**
   - First-time user or localStorage cleared
   - TRACKING entry uses default offsets (hardcoded neutral = [0, 0, ..., 0])
   - Banner: "No calibration data. Run calibration in Settings for better accuracy."
   - User can click → navigate to /models, redo wizard, save new offsets

6. **Multiple Participants Tracking Simultaneously**
   - Each participant runs separate Worker + FaceLandmarker (not shared)
   - Max 6 concurrent: 6 × 52ch × 30fps = 9360 params/s inbound to room
   - Solution: throttle to 15fps if >3 participants OR batch updates (send every 2 frames)

7. **WASM Blob Not Cached**
   - First INITIALIZING may take 10s (network + compile)
   - Subsequent: cached by browser (offline also works if visited before)
   - Monitor via `trackingStore.isLoadingWasm` flag (show spinner)

8. **Host Tracking Health Monitoring**
   - Each participant publishes health every 5s: `{ fps, dropped_frames, cpu_tier, is_tracking_failed, throttle_reason }`.
   - HostConsole shows failed/throttled participants and may request 30fps→15fps downgrade.
   - If `is_tracking_failed=true` for >10s, ParticipantSlot shows tracking-failed badge and voice-only fallback.

9. **Corrupt / Partial Blendshape Frame**
   - Receiver verifies `byte_length`, `crc16`, and monotonic `seq` before One-Euro Filter.
   - Failed validation drops the frame and keeps the last valid pose.
   - Never feed partial arrays into smoothing filters.

## Implementation Hints

- **Zustand store**: `trackingStore` (state, calibrationOffsets, lastBlendshapes, error_msg, isLoadingWasm)
- **Event sources**:
  - `window.visibilitychange`: background/foreground transitions
  - Web Worker: `mediapipe.worker.ts` (onmessage for blendshape frames)
  - Browser Permissions API: `navigator.permissions.query({ name: 'camera' })`
  - Supabase: store calibrationOffsets to user profile (sync across devices)
- **Side effects**:
  - IDLE state: ensure Worker is terminated (cleanup)
  - INITIALIZING: show "Loading MediaPipe (takes 2-5s)..." spinner
  - CALIBRATING: display wizard UI; disable DataChannel blendshape transmission (send zeros)
  - TRACKING: send 52ch on DataChannel `unreliable` every frame
  - PAUSED: keep Worker alive but pause rAF; no DataChannel sends
  - ERROR: log to Sentry; show modal with retry + viewer mode fallback
- **Web Worker** (`src/workers/mediapipe.worker.ts`):
  ```typescript
  import { FaceLandmarker } from '@mediapipe/tasks-vision';
  
  const faceLandmarker = await FaceLandmarker.createFromOptions(wasm_url, options);
  
  self.onmessage = (event) => {
    const { videoFrame } = event.data;
    const result = faceLandmarker.detectForVideo(videoFrame, timestamp);
    const smoothed = oneEuroFilter(result.faceBlendshapes);
    self.postMessage({ blendshapes: smoothed, timestamp_ms });
  };
  ```
- **Calibration Storage**:
  ```javascript
  // Save to Zustand + localStorage
  trackingStore.setState({
    calibrationOffsets: { neutral: [...], eyes_up: [...], ... }
  });
  localStorage.setItem('calibration_offsets', JSON.stringify(offsets));
  
  // On init, restore from localStorage
  const stored = localStorage.getItem('calibration_offsets');
  if (stored) trackingStore.loadCalibration(JSON.parse(stored));
  ```
