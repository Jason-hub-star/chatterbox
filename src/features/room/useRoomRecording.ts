import { useCallback, useEffect, useRef, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { useStageStore } from '@/stores/stageStore'
import { supabase } from '@/lib/supabase'
import { startStageRecorder, type StageRecorder } from '@/features/stage/stageRecorder'
import { startVoiceRecorder } from './voiceRecorder'
import {
  startRoomRecording,
  recordRecordingConsent,
  createRecordingUpload,
  completeRoomRecording,
  type RecordingKind,
} from '@/lib/rooms'
import { toast } from '@/hooks/useToast'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import i18n from '@/i18n'

// V-3 인앱 녹화 오케스트레이션(GOAL-g3 §1): 동의 수집 → all_consented → 무대 합성 캡처(stageRecorder)
// → R2 presign PUT → complete(ready+작품 등록). 서버 broadcast(recording_*)는 room-authority 수신을
// RoomPage 가 onAuthorityMessage 로 위임한다. 동의·시작 게이트의 진실은 서버(§11.1.1) — 여긴 배선만.
// ponytail: 호스트 새로고침/이탈 시 로컬 캡처는 소실(클라 합성 P1 ceiling) — 재입장 후 정지 클릭이 취소로 정리.

export type RecordingPhase = 'idle' | 'consentPending' | 'recording' | 'uploading' | 'uploadFailed'

export function useRoomRecording(opts: {
  roomId: string
  isHost: boolean
  joined: boolean // joinPhase === 'ready' — 늦입장 동기(활성 녹화 조회) 트리거
  getAudioTracks: () => MediaStreamTrack[]
}) {
  const { roomId, isHost, joined, getAudioTracks } = opts
  const [phase, setPhase] = useState<RecordingPhase>('idle')
  const [remoteActive, setRemoteActive] = useState(false) // 비호스트 REC 배지(recording_started/done)
  const [consentRequest, setConsentRequest] = useState<{ recordingId: string } | null>(null)
  const [recordingsNonce, setRecordingsNonce] = useState(0) // 녹화 완료 → HostConsole 목록 갱신 트리거
  const [uploadPct, setUploadPct] = useState<number | null>(null) // UX-UPLOAD-PROGRESS: 업로드 진행률(0~100)
  // REC-CONSENT-N: 동의 집계(서버 계산 — 분모 규칙 SEC-KICK-3 이 서버에만 있다). 호스트 라벨 "n/N".
  const [consentTally, setConsentTally] = useState<{ consented: number; required: number } | null>(null)
  // ROOM-28 U3: 진행 중인 녹화의 산출물 종류. 비호스트는 broadcast(빠른 길) 또는 DB 동기(복구 길)로 받는다
  //   — 브로드캐스트 단독이면 입장 직후 첫 메시지 유실 시 배지·동의 문구 종류가 빈다.
  const [activeKind, setActiveKind] = useState<RecordingKind>('stage')

  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])
  const isHostRef = useRef(isHost)
  useEffect(() => { isHostRef.current = isHost }, [isHost])

  const recordingIdRef = useRef<string | null>(null)
  // StageRecorder·VoiceRecorder 는 같은 shape(mimeType·addAudioTrack·stop·cancel) — 정지/업로드 경로 공용.
  const recorderRef = useRef<StageRecorder | null>(null)
  // 캡처 시작 시점에 읽히므로 ref — activeKind state 는 렌더(문구·배지)용이고 이쪽이 실행용이다.
  const kindRef = useRef<RecordingKind>('stage')
  const uploadUrlRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const failedRef = useRef<{ blob: Blob; durationMs: number } | null>(null) // 업로드 실패분(재시도용)

  const token = () => useUserStore.getState().session?.access_token

  // 전원 동의 후: recording 전이 + presign 발급 + 무대 캡처 시작.
  const startCapture = useCallback(async (recordingId: string) => {
    const tk = token()
    if (!tk) return
    let up: { upload_url: string }
    try {
      up = await createRecordingUpload(tk, recordingId)
    } catch (e) {
      // 412(동의 소실 경합) → 대기 유지, 그 외는 보고 후 대기 유지(재시도 = 정지→재시작)
      if (!(e instanceof Error && e.message.includes('동의'))) toast.error(i18n.t('room.recStartFailed'))
      return
    }
    try {
      if (kindRef.current === 'voice') {
        // 음성 모드는 무대를 그리지 않는다 — stageEl 부재가 실패 사유가 아니다(계약 MUST NOT).
        recorderRef.current = startVoiceRecorder({ audioTracks: getAudioTracks() })
      } else {
        const stageEl = document.querySelector<HTMLElement>('[data-stage-area]')
        if (!stageEl) throw new Error('stage_not_visible')
        recorderRef.current = startStageRecorder({
          stageEl,
          backgroundUrl: useStageStore.getState().backgroundUrl,
          audioTracks: getAudioTracks(),
        })
      }
      uploadUrlRef.current = up.upload_url
      startedAtRef.current = Date.now()
      setPhase('recording')
    } catch {
      // 캡처 기동 실패 — DB 는 이미 recording 전이됨 → 취소로 정리(고아 행 방지)
      void completeRoomRecording(tk, recordingId, { cancel: true }).catch(() => {})
      recordingIdRef.current = null
      setPhase('idle')
      toast.error(i18n.t('room.recStartFailed'))
    }
  }, [getAudioTracks])

  const uploadAndComplete = useCallback(async (blob: Blob, durationMs: number) => {
    const tk = token()
    const id = recordingIdRef.current
    const url = uploadUrlRef.current
    if (!tk || !id || !url) return
    setPhase('uploading')
    setUploadPct(0)
    try {
      // UX-UPLOAD-PROGRESS: XHR 로 PUT — 대용량 무대 캡처 업로드가 침묵하지 않게 onprogress 로 % 갱신.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('Content-Type', 'video/webm')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('upload network error'))
        xhr.send(blob)
      })
      await completeRoomRecording(tk, id, { duration_ms: durationMs, file_size_bytes: blob.size })
      failedRef.current = null
      recordingIdRef.current = null
      setUploadPct(null)
      setPhase('idle')
      setRecordingsNonce((n) => n + 1)
      toast.success(i18n.t('room.recSaved'))
    } catch {
      failedRef.current = { blob, durationMs } // 블롭 보존 — presign 1h 내 재시도 가능
      setUploadPct(null)
      setPhase('uploadFailed')
      // 실패 알림은 여기가 아니라 아래 phase 이펙트가 띄운다(재시도 액션을 함께 실으려고).
    }
  }, [])

  // FB-TOAST: 업로드 실패 토스트에 [재시도]를 싣는다. 하단바 ⏺ 도 [재시도]로 바뀌지만 그건 눈을
  //   그리로 돌려야 보이고, 실패 문구는 이제 자동 소멸하지 않으니 토스트가 제일 가까운 다음 한 수다.
  //   catch 안이 아니라 phase 전이에서 띄우는 이유: catch 에서 재시도를 걸려면 자기 자신을 가리키는
  //   ref 브리지가 필요한데 컴파일러 lint 가 그 변형을 막는다. 전이로 옮기면 `uploadAndComplete` 가
  //   이미 정의된 자리라 브리지가 통째로 사라진다 — 규칙을 우회하는 대신 구조를 고쳤다.
  const retryUpload = useCallback(() => {
    const f = failedRef.current
    if (f) void uploadAndComplete(f.blob, f.durationMs)
  }, [uploadAndComplete])
  useEffect(() => {
    if (phase !== 'uploadFailed') return
    toast.error(i18n.t('room.recUploadFailed'), { label: i18n.t('room.ctrlRecordRetry'), onClick: retryUpload })
  }, [phase, retryUpload])

  // ⏺ 단일 버튼(호스트): idle=동의 수집 시작 / consentPending=취소 / recording=정지→업로드 / uploadFailed=재시도.
  // ROOM-28: idle 진입만 종류를 고른다(U1 버튼 2개) — 진행 중 전환은 없다(산출물이 섞인다).
  const toggleRecording = useCallback(async (kind: RecordingKind = 'stage') => {
    const tk = token()
    if (!tk || !isHostRef.current) return
    const cur = phaseRef.current
    if (cur === 'idle') {
      setConsentTally(null) // REC-CONSENT-N: 새 수집 라운드 — 지난 라운드 집계가 새어나오면 안 된다.
      try {
        const r = await startRoomRecording(tk, roomId, kind)
        kindRef.current = r.kind
        setActiveKind(r.kind)
        recordingIdRef.current = r.recording_id
        if (r.all_consented) await startCapture(r.recording_id)
        else setPhase('consentPending')
      } catch {
        toast.error(i18n.t('room.recStartFailed'))
      }
    } else if (cur === 'consentPending') {
      const id = recordingIdRef.current
      if (id) await completeRoomRecording(tk, id, { cancel: true }).catch(() => {})
      recordingIdRef.current = null
      setPhase('idle')
    } else if (cur === 'recording') {
      const rec = recorderRef.current
      if (!rec) {
        // 새로고침으로 캡처 소실(P1 ceiling) — 남은 recording 행을 취소로 정리해 데드락 해소.
        const id = recordingIdRef.current
        if (id) await completeRoomRecording(tk, id, { cancel: true }).catch(() => {})
        recordingIdRef.current = null
        setRemoteActive(false)
        setPhase('idle')
        return
      }
      recorderRef.current = null
      const durationMs = Date.now() - (startedAtRef.current ?? Date.now())
      const blob = await rec.stop()
      await uploadAndComplete(blob, durationMs)
    } else if (cur === 'uploadFailed') {
      const f = failedRef.current
      if (f) await uploadAndComplete(f.blob, f.durationMs)
    }
  }, [roomId, startCapture, uploadAndComplete])

  // room-authority recording_* 수신(RoomPage 위임). 서버발만 도달(SEC-RA-1 — 수신측이 이미 필터).
  const onAuthorityMessage = useCallback((msg: { type: string; recording_id?: string; all_consented?: boolean; consented_count?: number; required_count?: number; declined?: boolean; declined_name?: string | null; kind?: string }) => {
    if (msg.type === 'recording_consent') {
      // 동의 요청: 비호스트 전원 모달(호스트는 시작 시 자동 동의됨).
      if (!isHostRef.current && typeof msg.recording_id === 'string') {
        recordingIdRef.current = msg.recording_id
        // U3 빠른 길 — 동의 문구가 "녹화/녹음"으로 갈린다. 유실 시 아래 DB 동기가 복구한다.
        const k: RecordingKind = msg.kind === 'voice' ? 'voice' : 'stage'
        kindRef.current = k
        setActiveKind(k)
        setConsentRequest({ recordingId: msg.recording_id })
      }
    } else if (msg.type === 'recording_consent_update') {
      // REC-CONSENT-N: 집계 먼저 반영 — 자동 시작 분기와 무관하게 라벨은 항상 최신이어야 한다.
      if (typeof msg.consented_count === 'number' && typeof msg.required_count === 'number') {
        setConsentTally({ consented: msg.consented_count, required: msg.required_count })
      }
      // 전원 동의 완료 → 호스트 자동 시작(계약 "all_consented 시 시작").
      if (
        isHostRef.current && msg.all_consented === true &&
        phaseRef.current === 'consentPending' && recordingIdRef.current === msg.recording_id
      ) {
        void startCapture(msg.recording_id as string)
      } else if (isHostRef.current && msg.declined === true && recordingIdRef.current === msg.recording_id) {
        // UX-CONSENT-DECLINE: 거절 통지 — 호스트가 '동의 대기'에서 멈추지 않게 누가 거절했는지 알린다
        // (녹화 중 늦은 입장자 거절=SEC-3 경로 포함). 재요청/취소 판단은 호스트 몫.
        toast.error(i18n.t('room.recConsentDeclined', { name: msg.declined_name || i18n.t('room.someone') }))
      }
    } else if (msg.type === 'recording_started') {
      setRemoteActive(true)
    } else if (msg.type === 'recording_done') {
      setRemoteActive(false)
      setRecordingsNonce((n) => n + 1)
    }
  }, [startCapture])

  // 참가자 동의 응답. 취소된 녹화(409) 등 실패는 조용히 닫음 — 서버 진실이 이미 다른 상태.
  const respondConsent = useCallback(async (consented: boolean) => {
    const req = consentRequest
    setConsentRequest(null)
    const tk = token()
    if (!tk || !req) return
    try {
      await recordRecordingConsent(tk, req.recordingId, consented)
    } catch { /* 409(취소·완료 후) — 무시 */ }
  }, [consentRequest])

  // 늦입장/새로고침 동기: 활성 녹화 행을 서버 진실로 복원(REC 배지 고지·미동의자 모달·호스트 잔재 정리 경로).
  useEffect(() => {
    if (!joined) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('recordings')
        .select('id, status, consent_json, kind')
        .eq('room_id', roomId)
        .in('status', ['consent_pending', 'recording'])
        .maybeSingle()
      if (cancelled || !data) return
      recordingIdRef.current = data.id
      // U3 복구 길 — DB 가 durable 진실. 입장 직후 datachannel 첫 메시지를 잃어도 종류가 복원된다.
      const k: RecordingKind = data.kind === 'voice' ? 'voice' : 'stage'
      kindRef.current = k
      setActiveKind(k)
      if (data.status === 'recording') {
        setRemoteActive(true)
        // 호스트인데 로컬 레코더가 없음 = 새로고침 잔재 — phase 만 복원, 정지 클릭이 취소로 정리.
        if (isHostRef.current && !recorderRef.current) setPhase('recording')
        else if (!isHostRef.current) {
          // SEC-3: 녹화 시작 후 입장한 비호스트가 아직 동의 기록에 없으면 동의 재요청 — 거절 시 호스트가
          // declined 통지를 받는다(자동 캡처 제외 렌더는 defer, 통지+호스트 판단까지가 이 범위).
          const myId = useUserStore.getState().appUserId
          const cj = data.consent_json as { participants?: Record<string, unknown> } | null
          if (!myId || !cj?.participants?.[myId]) setConsentRequest({ recordingId: data.id })
        }
      } else {
        const myId = useUserStore.getState().appUserId
        const cj = data.consent_json as { participants?: Record<string, unknown> } | null
        if (isHostRef.current) setPhase('consentPending')
        else if (!myId || !cj?.participants?.[myId]) setConsentRequest({ recordingId: data.id })
      }
    })()
    return () => { cancelled = true }
  }, [joined, roomId])

  // 방 이탈/언마운트 — 진행 중 캡처 폐기(업로드 없이). DB 잔재는 재입장 정지 경로가 정리.
  useEffect(() => () => { recorderRef.current?.cancel(); recorderRef.current = null }, [])

  // LEAVE-GUARD: 녹화본은 MediaRecorder 로 이 탭 메모리에 쌓인다(Egress 미사용) — 닫으면 회수 불가.
  //   업로드 중 이탈도 같다: 아티팩트가 절반만 올라가고 방엔 아무것도 남지 않는다.
  useLeaveGuard(phase === 'recording' || phase === 'uploading')

  // 녹화 중 오디오 증감 합류(useLiveKitRoom onAudioTrack 배선용).
  const onAudioTrack = useCallback((track: MediaStreamTrack) => {
    recorderRef.current?.addAudioTrack(track)
  }, [])

  return {
    phase,
    recActive: remoteActive || phase === 'recording' || phase === 'uploading',
    // REC-CONSENT-N: phase 로 게이트해 파생 — 별도 리셋 시점을 관리하면 상태 2개가 어긋난다.
    consentTally: phase === 'consentPending' ? consentTally : null,
    consentRequest,
    respondConsent,
    toggleRecording,
    activeKind, // ROOM-28 U2·U3 — 동의 문구·REC 배지가 이 값으로 갈린다

    onAuthorityMessage,
    onAudioTrack,
    recordingsNonce,
    uploadPct,
  }
}
