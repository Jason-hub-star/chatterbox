import { useCallback, useEffect, useRef, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { useStageStore } from '@/stores/stageStore'
import { supabase } from '@/lib/supabase'
import { startStageRecorder, type StageRecorder } from '@/features/stage/stageRecorder'
import {
  startRoomRecording,
  recordRecordingConsent,
  createRecordingUpload,
  completeRoomRecording,
} from '@/lib/rooms'
import { toast } from '@/hooks/useToast'
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

  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])
  const isHostRef = useRef(isHost)
  useEffect(() => { isHostRef.current = isHost }, [isHost])

  const recordingIdRef = useRef<string | null>(null)
  const recorderRef = useRef<StageRecorder | null>(null)
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
      const stageEl = document.querySelector<HTMLElement>('[data-stage-area]')
      if (!stageEl) throw new Error('stage_not_visible')
      recorderRef.current = startStageRecorder({
        stageEl,
        backgroundUrl: useStageStore.getState().backgroundUrl,
        audioTracks: getAudioTracks(),
      })
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
    try {
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'video/webm' }, body: blob })
      if (!res.ok) throw new Error(`upload ${res.status}`)
      await completeRoomRecording(tk, id, { duration_ms: durationMs, file_size_bytes: blob.size })
      failedRef.current = null
      recordingIdRef.current = null
      setPhase('idle')
      setRecordingsNonce((n) => n + 1)
      toast.success(i18n.t('room.recSaved'))
    } catch {
      failedRef.current = { blob, durationMs } // 블롭 보존 — presign 1h 내 재시도 가능
      setPhase('uploadFailed')
      toast.error(i18n.t('room.recUploadFailed'))
    }
  }, [])

  // ⏺ 단일 버튼(호스트): idle=동의 수집 시작 / consentPending=취소 / recording=정지→업로드 / uploadFailed=재시도.
  const toggleRecording = useCallback(async () => {
    const tk = token()
    if (!tk || !isHostRef.current) return
    const cur = phaseRef.current
    if (cur === 'idle') {
      try {
        const r = await startRoomRecording(tk, roomId)
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
  const onAuthorityMessage = useCallback((msg: { type: string; recording_id?: string; all_consented?: boolean }) => {
    if (msg.type === 'recording_consent') {
      // 동의 요청: 비호스트 전원 모달(호스트는 시작 시 자동 동의됨).
      if (!isHostRef.current && typeof msg.recording_id === 'string') {
        recordingIdRef.current = msg.recording_id
        setConsentRequest({ recordingId: msg.recording_id })
      }
    } else if (msg.type === 'recording_consent_update') {
      // 전원 동의 완료 → 호스트 자동 시작(계약 "all_consented 시 시작").
      if (
        isHostRef.current && msg.all_consented === true &&
        phaseRef.current === 'consentPending' && recordingIdRef.current === msg.recording_id
      ) {
        void startCapture(msg.recording_id as string)
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
        .select('id, status, consent_json')
        .eq('room_id', roomId)
        .in('status', ['consent_pending', 'recording'])
        .maybeSingle()
      if (cancelled || !data) return
      recordingIdRef.current = data.id
      if (data.status === 'recording') {
        setRemoteActive(true)
        // 호스트인데 로컬 레코더가 없음 = 새로고침 잔재 — phase 만 복원, 정지 클릭이 취소로 정리.
        if (isHostRef.current && !recorderRef.current) setPhase('recording')
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

  // 녹화 중 오디오 증감 합류(useLiveKitRoom onAudioTrack 배선용).
  const onAudioTrack = useCallback((track: MediaStreamTrack) => {
    recorderRef.current?.addAudioTrack(track)
  }, [])

  return {
    phase,
    recActive: remoteActive || phase === 'recording' || phase === 'uploading',
    consentRequest,
    respondConsent,
    toggleRecording,
    onAuthorityMessage,
    onAudioTrack,
    recordingsNonce,
  }
}
