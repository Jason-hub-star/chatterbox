---
tags: [spec]
---

> G-122 산출 문서. 미디어 코덱·품질 파라미터 명세.

# MediaConfig — 오디오·비디오·실시간 미디어 코덱 및 품질 파라미터

Updated: 2026-06-30

---

## 1. LiveKit 오디오 설정

| 파라미터 | 값 | 용도 | 참고 |
|---|---|---|---|
| **코덱** | Opus | 음성/실시간 SFU | RFC 6716 |
| **샘플레이트** | 48kHz | LiveKit 기본 | WAMR 호환 |
| **채널** | Mono | 음성 통화 | 대역폭 절감 |
| **비트레이트** | 가변(16~64kbps) | VBR 활성화 | 네트워크 적응 |

### 1.1 AudioPresets 권장

| 프리셋 | 채널 | 비트레이트 | 샘플레이트 | 사용처 |
|---|---|---|---|---|
| `speech` | Mono | 24kbps | 48kHz | **묵대 방송** (기본값) |
| `music` | Stereo | 64kbps | 48kHz | BGM / 사운드보드 (P2) |

**설정 코드:**
```typescript
// src/lib/livekit.ts
import { Room, RoomOptions, AudioPresets } from 'livekit-client';

const roomOptions: RoomOptions = {
  audioPreset: AudioPresets.speech, // 음성 최적화
  autoSubscribe: true,
};

const room = new Room(roomOptions);
```

---

## 2. LiveKit 비디오 설정

| 파라미터 | 값 | 해상도 | 비트레이트 | 용도 |
|---|---|---|---|---|
| **VideoPreset** | `h720` | 1280×720 | 1500kbps | 데스크톱 기본 |
| | `h1080` | 1920×1080 | 3000kbps | 4K 저사양 PC |
| | `h360` | 640×360 | 500kbps | 모바일 / 대역폭 제한 |

### 2.1 Simulcast 레이어 (적응형 스트리밍)

```typescript
// LiveKit setPublishingQuality() API
// 자동 협상 시 3단계 레이어 송신
{
  videoCodec: 'vp9', // 또는 h264
  encodings: [
    { maxBitrate: 500_000, maxFramerate: 15 },  // Layer 0: h360
    { maxBitrate: 1500_000, maxFramerate: 24 }, // Layer 1: h720 (기본)
    { maxBitrate: 3000_000, maxFramerate: 30 }, // Layer 2: h1080
  ],
}
```

**수신자 측:**
```typescript
// ConnectionQuality 이벤트로 자동 품질 조정
room.on('connectionQualityChanged', (quality, participant) => {
  if (quality === ConnectionQuality.Poor) {
    // h360 레이어만 구독
    participant.videoTrack?.setSubscribed(true);
    participant.track?.setVisibility(true); // h360 디코딩
  }
});
```

---

## 3. fal.ai Seedance 2.0 출력 포맷

| 구분 | 값 | 설명 |
|---|---|---|
| **컨테이너** | MP4 | H.264 비디오 + AAC 오디오 |
| **코덱 (비디오)** | H.264 | VP9 (WebRTC) 아님 |
| **프레임레이트** | 24fps | 고정 |
| **비트레이트** | 2500~4000 kbps | 가변 (해상도 별) |

### 3.1 해상도별 출력 포맷

| 모드 | 해상도 | 비율 | 예상 파일크기 (30초) | 비용 (2.0) |
|---|---|---|---|---|
| **일반 영상** | 768×512 (1.5:1) | 수평 | ~15MB | $0.05 |
| | 1024×680 | 수평 | ~25MB | $0.10 |
| | 1280×854 | 수평 | ~35MB | $0.15 |
| **쇼츠 (권장)** | **768×1280** | **9:16** | ~18MB | $0.06 |
| | **1024×1707** | **9:16** | ~30MB | $0.12 |
| | **1280×2133** | **9:16** | ~45MB | $0.18 |

### 3.2 fal.ai 청크 크기 제한 및 지연

```typescript
// src/lib/fal.ts
const result = await fal.subscribe('fal-ai/seedance/2.0', {
  input: {
    prompt: '...',
    prompt_weight: 1.0,
    negative_prompt: '피해야 할 이미지',
    num_frames: 720, // 24fps × 30초 = 720프레임
    video_format: 'mp4',
    size: '768x1280', // 쇼츠: 9:16 권장
    enable_safety_checker: true, // 자동 모더레이션
  },
  pollInterval: 500, // 500ms 폴링
  timeout: 300_000,  // 5분 타임아웃
});

// 용량 확인 (R2 업로드 전)
const fileSizeBytes = await fetch(result.url).then(r => r.blob().then(b => b.size));
if (fileSizeBytes > 50 * 1024 * 1024) {
  throw new Error('생성된 영상이 50MB를 초과합니다');
}
```

---

## 4. OpenAI Whisper API 설정

| 파라미터 | 값 | 설명 |
|---|---|---|
| **모델** | `whisper-1` | MVP. 화자분리 필요 시 `gpt-4o-transcribe-diarize`(동일 키·최소전환), 대용량/async 는 AssemblyAI (G-269·[[dub-stt-provider-decision]]) |
| **입력 파일 크기** | ≤ 25MB | 제한 |
| **입력 포맷** | mp4, mp3, m4a, wav, webm, ogg | 다양함 |
| **출력 포맷** | json, text, srt, vtt, verbose_json | **verbose_json 사용** (구조화 segments: start/end/text) |

### 4.1 DUB 파이프라인에서 Whisper 호출

```typescript
// src/lib/dub.ts
// Edge Function: /functions/dub/transcribe

export async function transcribeDubVideo(
  videoUrl: string, // R2 서명 URL
  language?: string,
): Promise<{
  text: string;
  segments: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
}> {
  const audioBlob = await downloadFromStorage(videoUrl); // whisper-1 은 mp4 직접 허용(≤25MB) — Edge 런타임엔 ffmpeg 없어 별도 오디오 변환 불필요
  
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json'); // 구조화 segments. srt 는 타임코드 파싱 필요 + timestamp_granularities 무시됨
  formData.append('language', language || 'ko');
  // segment 단위면 충분(사람 재녹음 — word-level 불필요)
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    },
    body: formData,
  });
  
  const result = await response.json(); // { text, segments: [{id, start, end, text, ...}], language, duration }
  return result; // segments[].start/end(초) → start_ms/end_ms 변환은 Edge Function 에서
}

// SRT 형식 예:
// 1
// 00:00:00,000 --> 00:00:03,500
// 안녕하세요, 오늘의 주제는...
//
// 2
// 00:00:03,500 --> 00:00:08,200
// 버튜버 플랫폼 구축입니다.
```

---

## 5. MediaRecorder (브라우저 더빙 녹음) 설정

### 5.1 브라우저 호환성 및 코덱 감지

```typescript
// src/lib/mediapipe.ts / src/hooks/useWebcam.ts
export function getMediaRecorderMimeType(): string {
  const types = [
    // Chrome/Edge
    'audio/webm;codecs=opus',
    // Safari (iOS 14.5+)
    'audio/mp4',
    // Firefox
    'audio/webm',
    // 폴백
    'audio/wav',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  
  // 절대 실패 안 함 (기본 코덱)
  return 'audio/webm';
}

export function createAudioRecorder(): MediaRecorder {
  const mimeType = getMediaRecorderMimeType();
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const mediaRecorder = new MediaRecorder(destination.stream, {
    mimeType,
    audioBitsPerSecond: 64000, // 64kbps 권장 (음성)
  });
  
  return mediaRecorder;
}
```

### 5.2 권장 비트레이트 및 인코딩

| 브라우저 | 코덱 | 권장 비트레이트 | 컨테이너 | 용도 |
|---|---|---|---|---|
| Chrome/Edge | Opus | 48~64 kbps | WebM | **기본** |
| Safari | AAC | 64~128 kbps | MP4 | iOS |
| Firefox | Opus | 48~64 kbps | WebM | 데스크톱 |

### 5.3 더빙 완성본 합성 (ffmpeg.wasm)

```typescript
// src/lib/dub-compose.ts
import FFmpeg from '@ffmpeg/ffmpeg';

export async function composeDubVideo(
  originalMp4Url: string,        // 원본 영상
  dubAudioUrls: string[],        // 각 배우의 녹음 오디오
  timingOffsets: number[],       // 각 트랙의 ms 오프셋
): Promise<Blob> {
  const ffmpeg = new FFmpeg();
  
  // WASM 모듈 로드 (한 번만)
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load({
      coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js',
      wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/ffmpeg-core.wasm',
    });
  }
  
  // 원본 영상 로드
  const videoData = await fetch(originalMp4Url).then(r => r.arrayBuffer());
  ffmpeg.FS('writeFile', 'input.mp4', new Uint8Array(videoData));
  
  // 더빙 오디오 로드 및 mixdown
  const filterComplex = dubAudioUrls
    .map((_, idx) => `adelay=${timingOffsets[idx]}|${timingOffsets[idx]}[a${idx}]`)
    .join(';') +
    `;[${dubAudioUrls.map((_, idx) => `a${idx}`).join('][')}]amix=inputs=${dubAudioUrls.length}:duration=first[aout]`;
  
  // ffmpeg 명령 실행 (muxing만, 재인코딩 아님)
  await ffmpeg.run(
    '-i', 'input.mp4',
    ...dubAudioUrls.flatMap((_, idx) => ['-i', `dub_${idx}.wav`]),
    '-filter_complex', filterComplex,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy',    // 비디오 재인코딩 안 함
    '-c:a', 'aac',     // 오디오만 재인코딩 (MP4 호환)
    '-y', 'output.mp4',
  );
  
  const data = ffmpeg.FS('readFile', 'output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
```

---

## 6. Vite 설정 시 주의사항

### 6.1 MediaRecorder 오디오 MIME 타입 감지

```typescript
// vite.config.ts
// MediaRecorder MIME 타입 감지는 런타임 문제 아님
// 컴파일 타임 최적화 불필요
```

### 6.2 fal.ai HTTP 호출 및 CORS

```typescript
// vite.config.ts
export default {
  server: {
    // 로컬 dev: fal.ai 직접 호출 (CORS 공개)
    // 배포: Edge Function 거쳐서 호출 (비공개 API 키)
  },
};
```

### 6.3 Whisper API 호출 규칙

```typescript
// Whisper는 반드시 Edge Function에서만 호출
// 브라우저에서 OPENAI_API_KEY 노출 금지
// /functions/dub/transcribe 엣지 펑션 사용
```

---

## 7. 파이프라인 체크리스트

- [ ] LiveKit Room 초기화 시 `AudioPresets.speech` 설정
- [ ] WebRTC 음성 테스트 (마이크 허가 + 오디오 레벨 시각화)
- [ ] fal.ai Seedance 2.0 크레딧 한도 확인 (예상: 월 $150~300/4GB 출력)
- [ ] Whisper API 월별 요청 수 모니터링 (예상: 월 100건 = $2)
- [ ] MediaRecorder MIME 타입 브라우저 테스트
  - [ ] Chrome: `audio/webm;codecs=opus`
  - [ ] Safari: `audio/mp4`
  - [ ] Firefox: `audio/webm`
- [ ] ffmpeg.wasm 로드 최적화 (CDN 캐시 확인)
- [ ] DUB 합성 타임아웃 설정 (30초 영상 기준 2분 예상)

---

## 8. 참고: 현재 코드베이스 마이그레이션 (build.mp4 기존 자산)

```
public/videos/
  ├── build.mp4        # (기존) 데모 영상 720p, 10MB
  ├── ruby-demo.mp4    # (기존) 루비 캐릭터 사이드 카메라
  └── chatterbox-intro.mp4  # (신규) 온보딩 소개 30초
```

각 영상은 Whisper(verbose_json)로 자동 자막 추출(DUB-02). 애니 등 원 대사 제거가 필요하면 음원분리 단계 별도(G-280).
