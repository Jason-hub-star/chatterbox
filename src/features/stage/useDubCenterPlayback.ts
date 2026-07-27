import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useDubStore } from '@/stores/dubStore'
import { attachDubLayer, playDubPreview, type DubPreviewHandle } from '@/lib/dubPreview'
import { toast } from '@/hooks/useToast'
import { dubEffectiveEndMs } from '@/lib/dub'
import {
  publishVodSync,
  setVodSyncApplier,
  setVodSyncReader,
  vodNeedsSeek,
  vodTargetMs,
  type VodSyncState,
} from '@/features/stage/vodSync'

// AA3: MainView(561줄·effect 10)의 "센터 재생 소유권"을 verbatim 추출 — 동작 무변경(RoomPage 3훅 분해 전례).
// 소유: vodSync 리더/발행/applier(+Y4 통제권 힌트) · 더빙 localMode 진입/복귀 · seekRequest 텔레포트 ·
//       베드 슬레이브 · 상시 더빙 레이어 · 시사회 · W1 stall 워치독 · onTimeUpdate/onEnded 구간 경계.
// MainView 는 렌더·HUD 만 담당. SSOT: docs/contracts/MainViewComponent.md
export function useDubCenterPlayback({ videoRef, centerUrl, dubUrl, isHost }: {
  videoRef: RefObject<HTMLVideoElement | null>
  centerUrl: string | null
  dubUrl: string | null
  isHost: boolean
}) {
  const { t } = useTranslation()
  const dubSegments = useDubStore((s) => s.segments)
  const setDubSegment = useDubStore((s) => s.setCurrentSegment)
  // G9-P2 녹음 로컬모드: 녹음/미리보기 동안 내 화면만 구간 재생(vodSync 발행·수신 일시 해제).
  const localMode = useDubStore((s) => s.localMode)
  // G9-P3 누적 시사회: 호스트 토글 → 전원이 각자 트랙을 받아 얹음(영상 동기는 기존 vodSync 그대로).
  const screening = useDubStore((s) => s.screening)
  // S2 배경 베드(각인 #1): 기존 목소리 제거 스템을 video 에 슬레이브 — [원본 소리|목소리 뺀 배경] 토글.
  const bedUrls = useDubStore((s) => s.bedUrls)
  const bedMode = useDubStore((s) => s.bedMode)
  // DUB-PART-LOOP: submitted+synced 녹음 — 상시 레이어(일반 재생·시사회·리허설에서 항상 들림)
  const recordings = useDubStore((s) => s.recordings)
  const isDub = !!dubUrl
  const effectiveBed = isDub && bedUrls.length > 0 && bedMode === 'bed'
  // rehearse 는 재생 관점에선 일반 재생과 동일(원음/베드 유지) — record/preview 만 센터를 점유
  const localBlocking = !!localMode && localMode.kind !== 'rehearse'
  const [subtitle, setSubtitle] = useState('')
  const [myTurnTrackId, setMyTurnTrackId] = useState<string | null>(null) // G9-P4→U2: 재생 위치의 내 미제출 트랙(배너+원버튼)
  const [dubDurMs, setDubDurMs] = useState(0) // DUB-EDIT: 타임라인 스케일(loadedmetadata 실측)
  const [rate, setRate] = useState(1) // 호스트 배속 칩 활성 표시용(진실은 video.playbackRate)
  const bedRefs = useRef<Map<string, HTMLAudioElement>>(new Map()) // S2: 스템 N개 = audio N개(동일 슬레이브)
  const localActiveRef = useRef(false) // vodSync 게이트(이벤트 리스너·applier 가 클로저 밖에서 읽음)
  const lastSyncRef = useRef<VodSyncState | null>(null) // Y4: 마지막 적용 호스트 상태 — 유저 pause 와 applier pause 구분 재료
  const pauseHintShownRef = useRef(false) // Y4: 통제권 안내는 세션 1회만
  const localPrevRef = useRef<{ ms: number; paused: boolean } | null>(null) // 로컬모드 진입 전 위치(복귀용)
  const previewHandleRef = useRef<DubPreviewHandle | null>(null)

  // W1 DUB-VIDEO-STALL: 첫 진입에 소스가 readyState 0 에 고착(error 미발생)해 무한 스피너 되는 걸 자가복구.
  //   loadstart 후 STALL_MS 내 loadedmetadata 없으면 .load() 재시도(최대 MAX_RETRY). onError/onStalled 도 합류.
  //   readyState>=1(메타데이터 도착) 이면 재시도 안 함 — 정상 로드·재생 중 버퍼링 오탐 방지.
  const stallTimerRef = useRef<number | null>(null)
  const loadRetryRef = useRef(0)
  const STALL_MS = 4000
  const MAX_RETRY = 2
  const retryVideoLoad = () => {
    const v = videoRef.current
    if (!v || v.readyState >= 1 || loadRetryRef.current >= MAX_RETRY) return
    loadRetryRef.current += 1
    if (import.meta.env.DEV) {
      ;(window as unknown as { __dubStallRetries?: number }).__dubStallRetries = loadRetryRef.current
      console.warn(`[dub] 소스 로드 stall — .load() 재시도 ${loadRetryRef.current}/${MAX_RETRY}`)
    }
    v.load() // → onLoadStart 재발화 → 워치독 재무장
  }
  const armStallWatchdog = () => {
    if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current)
    stallTimerRef.current = window.setTimeout(retryVideoLoad, STALL_MS)
  }
  const clearStallWatchdog = () => {
    if (stallTimerRef.current) { window.clearTimeout(stallTimerRef.current); stallTimerRef.current = null }
  }
  // 새 소스마다 재시도 카운터 리셋(소스당 MAX_RETRY 독립)
  useEffect(() => { loadRetryRef.current = 0 }, [centerUrl])

  // 타임라인 동기(ROOM-01): 호스트=상태 리더+play/pause/seeked/ratechange 발행 / 비호스트=수신 보정.
  // 비호스트 controls 는 유지(스크럽해도 다음 호스트 이벤트·5s 하트비트에서 ±200ms 로 복귀 — 계약 §Scrubber 편차).
  useEffect(() => {
    const v = videoRef.current
    if (!centerUrl || !v) return
    if (isHost) {
      const read = (): VodSyncState => ({ positionMs: v.currentTime * 1000, playing: !v.paused && !v.ended, atMs: Date.now(), rate: v.playbackRate })
      setVodSyncReader(() => (localActiveRef.current ? null : read())) // 로컬모드 중 하트비트 정지
      const emit = () => {
        setRate(v.playbackRate)
        if (localActiveRef.current) return // 로컬 시크/재생을 방 전체에 방송하지 않음
        publishVodSync(read())
      }
      v.addEventListener('play', emit)
      v.addEventListener('pause', emit)
      v.addEventListener('seeked', emit)
      v.addEventListener('ratechange', emit) // 배속(U-3)도 즉시 발행 — 칩 클릭은 playbackRate 설정만(발행 단일 경로)
      return () => {
        setVodSyncReader(null)
        v.removeEventListener('play', emit)
        v.removeEventListener('pause', emit)
        v.removeEventListener('seeked', emit)
        v.removeEventListener('ratechange', emit)
      }
    }
    setVodSyncApplier((s) => {
      lastSyncRef.current = s // Y4: 호스트가 재생 중인지(유저 pause 판정 재료)
      if (localActiveRef.current) return // 로컬모드 중 호스트 보정 무시(복귀 시 다음 하트비트가 재동기)
      if (v.playbackRate !== s.rate) v.playbackRate = s.rate // 배속 먼저 — 드리프트 판정이 새 속도 기준
      const target = vodTargetMs(s, Date.now())
      const durMs = v.duration * 1000
      if (Number.isFinite(durMs) && target >= durMs - 250) {
        // 재연결 늦배달 stale 메시지의 과속 외삽(예: 2x 시절 at_ms) — 끝 강제 시크는 onEnded 로
        // 뷰어 공유를 영구 소멸시킨다. 시크만 스킵(다음 fresh 이벤트/5s 하트비트가 보정).
      } else if (vodNeedsSeek(v.currentTime * 1000, target)) v.currentTime = target / 1000
      if (s.playing && v.paused) void v.play().catch(() => {}) // 자동재생 차단 시 다음 보정에서 재시도
      else if (!s.playing && !v.paused) v.pause()
    })
    // Y4 통제권 안내(DUB-PLAYBACK-CONTROL-HINT): 호스트가 재생 중인데 유저가 controls 로 일시정지 →
    //   다음 보정/하트비트가 곧 되돌린다는 사실 + "나만 반복 듣기" 대안을 세션 1회 설명.
    //   applier 의 v.pause() 는 s.playing=false 일 때만이라 lastSyncRef.playing 게이트가 자체 pause 를 걸러낸다.
    const onUserPause = () => {
      if (!isDub || localActiveRef.current || pauseHintShownRef.current) return
      if (!lastSyncRef.current?.playing) return
      pauseHintShownRef.current = true
      toast.info(t('dub.syncPauseHint'))
    }
    v.addEventListener('pause', onUserPause)
    return () => {
      setVodSyncApplier(null)
      v.removeEventListener('pause', onUserPause)
    }
  }, [videoRef, centerUrl, isHost, isDub, t])

  // G9-P2 로컬모드 진입/전환/복귀. record=구간 시작으로 시크·음소거 재생, preview=방금 녹음을 스케줄해 동기 재생.
  useEffect(() => {
    previewHandleRef.current?.stop() // 모드 전환마다 이전 미리보기 오디오 정리
    previewHandleRef.current = null
    const v = videoRef.current
    if (!v) return
    if (localMode) {
      if (!localPrevRef.current) localPrevRef.current = { ms: v.currentTime * 1000, paused: v.paused } // record→preview 연쇄에도 최초 위치 유지
      localActiveRef.current = true
      if (localMode.kind === 'record' || localMode.kind === 'rehearse') {
        v.currentTime = localMode.startMs / 1000
        if (localMode.kind === 'record' && localMode.preroll) v.pause() // W3: 카운트다운 중 구간 시작 프레임 정지(준비) — 끝나면 record(preroll 없음)로 재생
        else void v.play().catch(() => {}) // rehearse: 구간 재생(반복은 onTimeUpdate, 더빙 오디오는 상시 레이어)
        return
      }
      if (!localMode.audioUrl) return
      let cancelled = false
      // W5: 미리보기 오디오(Web Audio)를 영상 pause/play 에 묶는다(정지 시 백그라운드 재생 방지)
      const onPause = () => previewHandleRef.current?.pause()
      const onPlay = () => previewHandleRef.current?.resume()
      // S2 각인 #2: 미리보기를 배경 스템 베드 위에서 — "배경음 위 내 목소리"가 즉시 들림.
      // durationMs 트림 = 합성(atrim)과 동일 규칙 — 프리뷰가 완성본 소리를 대변.
      void playDubPreview(v, [{ url: localMode.audioUrl, startMs: localMode.startMs, calMs: localMode.calMs, durationMs: localMode.endMs - localMode.startMs }], localMode.startMs, useDubStore.getState().bedUrls)
        .then((h) => {
          if (cancelled) { h.stop(); return }
          previewHandleRef.current = h
          v.addEventListener('pause', onPause)
          v.addEventListener('play', onPlay)
        })
        .catch(() => {})
      return () => { cancelled = true; v.removeEventListener('pause', onPause); v.removeEventListener('play', onPlay) }
    }
    // 해제 → 진입 전 위치·재생상태 복원(호스트면 seeked/play 발행이 동기 재개)
    localActiveRef.current = false
    const prev = localPrevRef.current
    if (prev) {
      localPrevRef.current = null
      v.currentTime = prev.ms / 1000
      if (prev.paused) v.pause()
      else void v.play().catch(() => {})
    }
  }, [videoRef, localMode])

  // 언마운트 시 미리보기 오디오 정리(위 효과의 상단 정리는 재실행 시에만 돈다) + W1 워치독 타이머 정리
  useEffect(() => () => { previewHandleRef.current?.stop(); clearStallWatchdog() }, [])

  // F2 텔레포트: 좌패널→센터 시크(DOM 조작만 — setState 없음). nonce 로 재클릭 재발화.
  // localMode 게이트: 녹음/프리뷰/리허설 중 텔레포트가 영상을 옮기면 테이크·구간 재생이 깨진다(잠재버그 픽스).
  const seekRequest = useDubStore((s) => s.seekRequest)
  useEffect(() => {
    const v = videoRef.current
    if (!seekRequest || !isDub || !v) return
    if (useDubStore.getState().localMode) return
    v.currentTime = seekRequest.ms / 1000
    if (seekRequest.pause) v.pause() // Y3 솔로 착지 정지 — 다음 파트를 읽고 준비되면 [지금 녹음](배너는 seek 의 timeupdate 로 갱신)
  }, [videoRef, seekRequest, isDub])

  // S2 베드 슬레이브: video 에 play/pause/seek/rate 미러 + 1s 드리프트 보정(±0.3s — vodSync applier 축소판).
  // record/preview 중엔 정지(그쪽 오디오는 dubPreview 스케줄러 소유 — 이중 방지).
  // 시사회는 베드 강제(원음 뮤트 대체) · 리허설은 일반 재생 취급(bedMode 그대로).
  useEffect(() => {
    const v = videoRef.current
    if (!isDub || !v) return
    const active = (effectiveBed || screening) && !localBlocking
    const beds = [...bedRefs.current.values()]
    const syncTime = () => beds.forEach((b) => { if (Math.abs(b.currentTime - v.currentTime) > 0.3) b.currentTime = v.currentTime })
    const syncRate = () => beds.forEach((b) => { b.playbackRate = v.playbackRate })
    const play = () => { if (active && !v.paused) beds.forEach((b) => void b.play().catch(() => {})) }
    const pause = () => beds.forEach((b) => b.pause())
    syncRate(); syncTime()
    if (active && !v.paused) play(); else pause()
    const onPlay = () => { syncTime(); play() }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', pause)
    v.addEventListener('seeked', syncTime)
    v.addEventListener('ratechange', syncRate)
    const iv = window.setInterval(syncTime, 1000)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', pause)
      v.removeEventListener('seeked', syncTime)
      v.removeEventListener('ratechange', syncRate)
      window.clearInterval(iv)
      pause()
    }
  }, [videoRef, isDub, effectiveBed, localBlocking, screening, bedUrls])

  // DUB-PART-LOOP 상시 레이어: submitted+synced 녹음(dubStore.recordings — DubPanel 이 Realtime 갱신)을
  // 일반 재생·시사회·리허설에서 항상 얹는다. 시크/배속은 attachDubLayer 가 재정렬(seeked/ratechange 재스케줄).
  // record/preview 중엔 해제 — 그 구간 오디오는 녹음 엔진/프리뷰 스케줄러 소유.
  useEffect(() => {
    const v = videoRef.current
    if (!isDub || !v || recordings.length === 0 || localBlocking) return
    let cancelled = false
    let detach: (() => void) | null = null
    void attachDubLayer(v, recordings.map((r) => ({
      url: r.url,
      startMs: r.startTimeMs,
      calMs: r.calibrationOffsetMs,
      // Z2 유효구간 트림 — 말꼬리 핸들까지 들리되 다음 세그 침범은 차단(endTimeMs=0 은 stale 서버 하위호환 → 트림 없음)
      durationMs: r.endTimeMs > r.startTimeMs ? dubEffectiveEndMs(r.endTimeMs, dubSegments) - r.startTimeMs : 0,
    })))
      .then((d) => { if (cancelled) d(); else detach = d })
      .catch(() => {})
    return () => { cancelled = true; detach?.() }
  }, [videoRef, isDub, recordings, localBlocking, dubSegments])

  // G9-P3 시사회: 상시 레이어가 오디오를 담당하므로 여기선 "처음부터 함께 보기"만 —
  // 호스트가 0으로 시크+재생(발행은 기존 vodSync seeked/play 리스너 단일 경로), 비호스트는 vodSync 추종.
  useEffect(() => {
    const v = videoRef.current
    if (!screening || !v) return
    if (isHost) {
      v.currentTime = 0
      void v.play().catch(() => {})
    }
    const onEnded = () => useDubStore.getState().setScreening(false) // 영상 끝 → 각자 종료(전원 동기라 동시 도달)
    v.addEventListener('ended', onEnded)
    return () => v.removeEventListener('ended', onEnded)
  }, [videoRef, screening, isHost])

  // ── video 이벤트 핸들러(더빙 전용 — MainView 가 isDub 일 때만 부착) ──
  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    clearStallWatchdog() // W1: 메타데이터 도착 = 정상 로드, 워치독 해제
    const d = e.currentTarget.duration
    setDubDurMs(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : 0)
    // S3: 소스 AR → 더빙 무대 fit 재료(Stage 가 읽음)
    const { videoWidth: vw, videoHeight: vh } = e.currentTarget
    useDubStore.getState().setSourceAR(vw > 0 && vh > 0 ? vw / vh : null)
  }
  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const ms = v.currentTime * 1000
    const seg = dubSegments.find((s) => ms >= s.start_ms && ms < s.end_ms)
    setSubtitle(seg ? (seg.translated_text || seg.text) : '')
    setDubSegment(seg ? seg.id : null)
    // U4: submitted 는 배너 제외(재녹음 진입은 좌패널 🎙) — 배너 = "아직 미제출" 유도만
    const turn = useDubStore.getState().myTurnRanges.find((r) => !r.submitted && ms >= r.startMs && ms < r.endMs)
    setMyTurnTrackId(turn ? turn.trackId : null) // 동값이면 리렌더 스킵
    // G9-P2/W3 수리: 구간 끝 도달 — 녹음이 파트를 넘지 않는다.
    //   record+루프 ON = 이전 테이크 폐기 후 새 테이크로 되감기 / OFF = 자동 정지 → 프리뷰.
    //   rehearse = 구간 반복(상시 레이어가 seeked 로 더빙도 재정렬) / preview = 재생 종료.
    const lm = useDubStore.getState().localMode
    if (lm && ms >= lm.endMs && !v.paused) {
      if (lm.kind === 'rehearse') {
        v.currentTime = lm.startMs / 1000
      } else if (lm.kind === 'record') {
        if (useDubStore.getState().recLoop) {
          useDubStore.getState().recEngine?.restartTake()
          v.currentTime = lm.startMs / 1000
        } else {
          useDubStore.getState().recEngine?.stop()
        }
      } else {
        v.pause()
      }
    }
  }
  const onEnded = () => {
    // 험지 픽스: 마지막 세그 유효끝(핸들) > 영상 길이면 끝에서 timeupdate 가 죽어 자동정지/반복이 영영 안 온다 —
    // ended 를 구간 끝 도달로 취급(onTimeUpdate 경계 분기 미러 + ended 는 paused 라 재생 재개 포함).
    const v = videoRef.current
    const lmEnded = useDubStore.getState().localMode
    if (!v || !lmEnded) return
    if (lmEnded.kind === 'rehearse') {
      v.currentTime = lmEnded.startMs / 1000
      void v.play().catch(() => {})
    } else if (lmEnded.kind === 'record') {
      if (useDubStore.getState().recLoop) {
        useDubStore.getState().recEngine?.restartTake()
        v.currentTime = lmEnded.startMs / 1000
        void v.play().catch(() => {})
      } else {
        useDubStore.getState().recEngine?.stop()
      }
    }
  }

  return {
    isDub, localBlocking, effectiveBed, localMode, screening, bedUrls,
    subtitle, myTurnTrackId, dubDurMs, rate, bedRefs,
    onLoadStart: armStallWatchdog, onStalled: retryVideoLoad, onError: retryVideoLoad,
    onLoadedMetadata, onTimeUpdate, onEnded,
  }
}
