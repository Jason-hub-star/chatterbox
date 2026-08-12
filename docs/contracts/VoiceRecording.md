---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# VoiceRecording — 음성 전용 방 녹음 (ROOM-28)

> **BLUF:** 무대 합성 녹화(V-3 / ROOM-13)의 **산출물만 바꾼 변형**이다. 동의 게이트·상태기계·업로드·보존·다시보기는 **전부 기존 경로를 그대로 쓴다**. 새로 만드는 것은 캔버스 합성을 뺀 오디오 레코더 하나(`voiceRecorder.ts`)와 그것을 고르는 분기뿐이다.

## 왜 (설계 근거)

무대 합성 녹화는 호스트 클라가 매 프레임 캔버스를 다시 그린다(`stageRecorder.ts`). 그 결과 세 가지 비용이 붙는다 — **호스트 기기 부담**(rAF + WebGL drawImage), **`stage_not_visible` 실패 경로**(무대가 안 보이면 녹화 자체가 시작 안 됨), **시간당 약 1.8GB**(4Mbps).

음성만 남기면 셋 다 동시에 사라진다. 64kbps opus 기준 **시간당 약 29MB로 약 62배 가볍고**, rAF 합성이 없으니 저사양 기기·모바일·백그라운드 탭에서도 성립하며, R2 는 내려받기 전송료가 0원이라 **다운로드를 무제한 열어도 비용이 붙지 않는다**.

**방 모드가 아니라 녹화 모드다.** 방·아바타·무대·LiveKit 연결은 전혀 건드리지 않는다. 신규 라우트 0 · 신규 store 0 · 신규 상태기계 0 — 이 경계를 지키는 것이 이 계약의 핵심이다.

## 범위

| | P1 (이 계약의 구현 대상) | P2 (천장 — 별도 골) |
|---|---|---|
| 산출물 | 호스트가 만드는 **믹스 1개**(WebAudio 합산 → webm/opus) | 참가자별 **개별 트랙 N개**(double-ender) |
| 음원 | LiveKit 수신 오디오 | 각자 **로컬 마이크 원본**(무압축 경로) |
| 리테이크 | 불가 — 한 명이 틀리면 전체 재녹음 | 그 사람 트랙만 재녹음 |
| 스키마 | `recordings.kind` 1컬럼 | `recording_tracks` 신규 테이블 |

P1 을 먼저 내는 이유: 믹스는 `stageRecorder` 에서 캔버스만 빼면 되는 최소 변경이고, **리테이크 수요가 실제로 있는지 P1 사용 로그로 확인한 뒤** P2 를 판단하는 편이 싸다. P2 를 예상해 스키마를 미리 열지 않는다(YAGNI).

## Props Interface

```typescript
// features/room/voiceRecorder.ts — stageRecorder 와 같은 shape, 비디오 트랙만 없다.
export interface VoiceRecorderOptions {
  audioTracks?: MediaStreamTrack[]; // 시작 시점 오디오(내 마이크 + 원격). 이후 추가는 addAudioTrack
  bitsPerSecond?: number;           // 기본 64_000 — 음성 기준 충분. ceiling: 음악·효과음은 열화
}

export interface VoiceRecorder {
  readonly mimeType: string;
  addAudioTrack(track: MediaStreamTrack): void; // 녹음 중 참가자 증감(TrackSubscribed)
  stop(): Promise<Blob>;                        // 최종 webm(audio-only). 원본 트랙은 건드리지 않는다(LiveKit 소유)
  cancel(): void;
}

// useRoomRecording 옵션 확장 — 기존 시그니처에 kind 만 추가.
interface UseRoomRecordingOptions {
  roomId: string;
  isHost: boolean;
  joined: boolean;
  getAudioTracks: () => MediaStreamTrack[];
  kind?: 'stage' | 'voice'; // 미지정 = 'stage'(기존 동작 보존)
}
```

`RecordingPhase`(`idle | consentPending | recording | uploading | uploadFailed`)는 **그대로 재사용한다** — 음성 모드가 새 상태를 만들지 않는다.

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `session.access_token` | ✓ | | Edge 호출 인증 (기존 경로) |
| `audioStore` | `micDeviceId` | ✓ | | 입력 기기 선택은 `AudioMixer.md` 소유 — 여기선 읽기만 |
| `stageStore` | `backgroundUrl` | | | **음성 모드에선 읽지 않는다** (무대 합성 부재) |

**신규 store 를 만들지 않는다.** 녹음 상태는 `useRoomRecording` 훅 로컬 state 가 계속 소유한다(as-built — `recordingStore` 는 계약상 명칭이고 실제 구현체는 훅이다).

## DataChannel 의존성

**구독:** `room-authority` 토픽의 `recording_started` · `recording_consent_update` · `recording_done` — **기존 그대로**. 페이로드에 `kind` 필드가 추가되어 비호스트 UI 가 REC 배지 문구를 고를 수 있다(영상/음성).

**발행:** 없음. 동의·시작 게이트의 진실은 서버이고(§11.1.1) 브로드캐스트는 **서버발만** 인정한다.

## 서버 계약 (Edge Function 델타)

| 함수 | 변경 | 사유 |
|---|---|---|
| `start-room-recording` | `kind` 파라미터 수용 → `recordings.kind` 로 insert. 미지정 시 `'stage'` | 산출물 종류는 **행 생성 시점에 확정**돼야 한다 — 나중에 파일 확장자로 추정하면 안 된다 |
| `create-room-recording-upload` | **변경 없음** | 키가 `recordings/<roomId>/<recordingId>.webm` 이고 audio-only 도 같은 `.webm` 컨테이너다 |
| `complete-room-recording` | **변경 없음** | ready 전이·보존 90일·작품 등록·알림(NOTI-REC) 모두 종류 무관 |
| `get-recording-url` | **변경 없음** | visibility 게이트 미러 + presign GET — 재생과 다운로드가 같은 URL |

동의 게이트(`record-recording-consent` · 412 응답)는 **음성 모드에서도 그대로 필요하다.** 음성 녹음은 영상 녹음과 법적 지위가 같다.

## 데이터 델타

```sql
alter table public.recordings
  add column kind text not null default 'stage'
    check (kind in ('stage','voice'));
```

기존 행은 전부 `'stage'` 로 백필된다(default). `docs/schema/02-content-and-economy.md §1.11` 갱신 + legacy 스냅샷 재동결 + `manifest.json` sha256 3종은 **마이그레이션 SQL 과 같은 커밋에서 한 번에** 처리한다 — 두 번 동결하면 낭비다.

용량·보존은 기존 계약을 그대로 상속한다: `user_storage_quota.used_bytes` 합산(기본 10 GiB = 음성 약 350시간), `retention_expires_at = ended_at + 90일`, pg_cron 만료 삭제.

## UX 계약

기존 표면 3곳을 그대로 쓴다 — **신규 패널·모달·드롭다운 0**. (as-built: 시작 진입 = `HostConsole`, 진행 표시 = `RoomBottomBar`, 다시보기 = `HostConsole` 하단 섹션.)

### U1. 진입 — 토글이 아니라 버튼 2개

`HostConsole` 의 녹화 시작 자리에 `⏺ 영상 녹화` · `🎙 음성 녹음` 두 버튼을 나란히 둔다. 토글을 쓰지 않는 이유: 토글은 **상태 하나가 늘고**("지금 어느 모드지?") 클릭이 2회가 된다. 버튼 2개는 클릭 1회에 결과가 자명하고 새 state 가 0이다.

녹음이 시작되면(`phase !== 'idle'`) 두 버튼은 **진행 중인 종류 하나로 접힌다** — 시작 진입은 콘솔, 진행 상태는 하단바라는 기존 분담을 그대로 지킨다.

### U2. 한국어에서 **녹화 ≠ 녹음**

영상은 **녹화**, 음성은 **녹음**이다. 이 구분이 무너지면 참가자가 "내 화면도 찍히나?"를 오해하고, 그 오해가 **동의 고지에서 일어나면 동의가 무효**다. 종류별 문구는 법적 고지의 일부로 취급한다.

| 신규 키 | ko | en | ja |
|---|---|---|---|
| `room.ctrlRecordVoice` | 음성 녹음 | Record audio | 音声を録音 |
| `room.ctrlRecordVoiceStop` | 녹음 중지 | Stop recording | 録音を停止 |
| `room.recConsentVoice` | 호스트가 이 방의 **대화(음성)**를 녹음하려 해요. **화면은 저장되지 않아요.** (기존 녹화 문구 어조 승계) | The host wants to record this room's **conversation (audio only)**. **No video is saved.** | ホストがこの部屋の**会話（音声）**を録音しようとしています。**映像は保存されません。** |
| `room.recBadgeVoice` | 녹음 중 | Recording audio | 録音中 |

**신규 키는 이 4개로 제한한다.** 진행 상태(동의 대기 `n/N` · 업로드 `%` · 재시도)는 종류와 무관하므로 기존 키를 공용한다 — phase 별로 2벌을 만들면 10키 × 3언어 = 30줄이 되고, 그중 6줄만 실제로 다르다.

### U3. REC 배지는 음성에서 **더** 중요하다

영상 녹화는 무대를 보고 있어야 성립하지만 음성 녹음은 **화면을 안 보고 있어도 성립한다.** 즉 "녹음 중인 걸 모르는" 상태가 실제로 생긴다. 따라서 배지는 항상 보이는 자리(하단바)에 `🎙 녹음 중` + `animate-pulse` 로 유지한다.

**비호스트가 `kind` 를 얻는 경로는 2단이다** — 브로드캐스트가 아니라 **DB 가 durable 진실**이다:

1. **빠른 길** — `recording_consent` broadcast(`start-room-recording` 발신) 페이로드에 `kind`. 동의 모달 문구(U2)가 이 값으로 갈린다.
2. **복구 길** — 늦입장·새로고침 동기 effect 가 `recordings` 행을 조회할 때 `kind` 를 함께 select.

`recording_started`(`create-room-recording-upload` 발신)에는 **넣지 않는다.** 그 함수는 계약상 무변경 대상이고, 무엇보다 신규 참가자는 datachannel 개설 지연으로 **입장 직후 discrete 메시지를 잃을 수 있다** — 브로드캐스트를 유일 경로로 삼으면 그때 배지 종류가 비어버린다. 2단 경로의 durable 쪽이 DB 인 이유가 이것이다.

### U4. 다시보기 — `<audio>` + 다운로드

`kind='voice'` 면 `<video>` 가 아니라 `<audio controls>` 로 렌더한다. audio-only webm 을 `<video>` 에 물리면 재생은 되지만 **검은 박스**가 남는다.

목록 행에는 종류 아이콘(`🎬`/`🎙`) · 길이 · 용량을 표기한다 — 음성은 파일이 작아 여러 건이 빠르게 쌓이므로 구분자가 없으면 목록이 못 쓰게 된다. 다운로드는 `<a href={presignUrl} download>` 한 줄이고 **횟수 제한을 두지 않는다**(R2 내려받기 전송료 0원).

### U5. 반응형·접근성

- 신규 버튼 2개는 `.touch-target`(coarse 44px) 필수.
- `HostConsole` 은 **룸 라우트라 `npm run check:responsive` 의 감시 범위 밖이다**(공개 라우트만 본다) → **360px 실렌더 스크린샷이 완료 조건**이다. 게이트가 안 막아주는 자리라 수동 판정을 계약에 박는다.
- 버튼은 `aria-label` 로 종류를 말한다(아이콘만으로 구분 금지). 재생 컨트롤은 네이티브 `<audio controls>` 를 쓴다 — 커스텀 플레이어 금지.

## 금지 사항 (MUST NOT)

- ❌ **음성 모드라고 동의 게이트를 생략** — `all_consented` 없이 캡처 시작 금지(§11.1.1). 늦입장자 재요청(SEC-3)도 동일 적용
- ❌ **서버 믹싱 / LiveKit Egress 사용** — 클라 합성만(V-3 §0 결정 승계, 과금 발생)
- ❌ **음성 모드에서 무대 캔버스 rAF 루프 가동** — 안 쓰는 프레임을 그리면 이 기능의 존재 이유가 사라진다
- ❌ **`stageEl` 부재를 음성 모드의 실패로 처리** — 무대가 안 보여도 음성 녹음은 성립해야 한다
- ❌ **R2 공개 URL·영구 URL 발급** — 단기 signed URL 만(`get-recording-url` 경유)
- ❌ **신규 store·신규 라우트·신규 상태기계 추가** — 녹화 모드지 방 모드가 아니다
- ❌ **파일 확장자로 산출물 종류 추정** — `recordings.kind` 가 유일한 진실
- ❌ **LiveKit 수신 오디오를 "원본"으로 표기** — P1 믹스는 압축을 한 번 거친 소리다. 무압축 주장은 P2 double-ender 에서만
- ❌ **신규 패널·모달·드롭다운·커스텀 플레이어 추가** — 기존 표면 3곳(콘솔·하단바·다시보기 섹션)만 쓴다(U1)
- ❌ **음성 녹음을 "녹화"로 표기** — 특히 동의 고지에서. 화면이 저장되지 않는다는 사실이 문구에 있어야 한다(U2)
- ❌ **`kind` 를 broadcast 로만 전달** — 첫 메시지 유실 시 배지 종류가 빈다. DB 조회 경로가 반드시 함께 있어야 한다(U3)
- ❌ **`recording_started` 페이로드 변경** — 발신처가 무변경 대상 함수다(U3)
- ❌ **audio-only 산출물을 `<video>` 로 재생** — 검은 박스가 남는다(U4)
- ❌ **다운로드 횟수·용량 제한 도입** — R2 egress 0원이라 근거가 없다(U4)

## 컴포넌트 관계

```
[useRoomRecording(kind)]
  ├─ 동의 수집 → all_consented          ← record-recording-consent (기존)
  ├─ startCapture
  │   ├─ kind='stage' → startStageRecorder(stageEl, backgroundUrl, audioTracks)
  │   └─ kind='voice' → startVoiceRecorder(audioTracks)        ← 신규, 캔버스 없음
  ├─ stop → Blob → XHR PUT(presign)     ← create-room-recording-upload (기존)
  └─ complete                           ← complete-room-recording (기존)

[HostConsole 다시보기]
  ├─ kind='stage' → <video>
  └─ kind='voice' → <audio> + [다운로드]  ← get-recording-url (기존 · R2 egress 0원)
```

## 관련

- `docs/contracts/AudioMixer.md` — 입력 기기·볼륨 소유(여기선 읽기만)
- `docs/contracts/HostConsole.md` — 다시보기 목록의 소유 계약
- `docs/contracts/DubRecorder.md` — P2 double-ender 가 재사용할 로컬 MediaRecorder → Storage 업로드 패턴
- `docs/specs/SecurityPolicies.md §11.1.1` — 녹화 동의 게이트
- `docs/schema/02-content-and-economy.md §1.11` — `recordings` / §1.11.1 `user_storage_quota`
