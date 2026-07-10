import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useTrackingStore } from '@/stores/trackingStore'
import { resolveAvatarUrl } from '@/lib/avatars'
import { useInterior } from '@/pages/lobby/useInterior'
import SelfAvatar from '@/features/stage/SelfAvatar'
import ProgressBar from '@/components/shared/ProgressBar'

// 분장실(Green Room, MOD-05/06 + LOB-04) — 입장 전 아바타·마이크 로컬 점검.
// 소프트 게이트(주인님 콜 2026-07-08): 트래킹/권한 실패여도 입장 가능 — 8동작 필수 검증(계약
// GreenRoom.md·CalibrationWizard)은 외부 공개 직전에 조이는 후속(as-built 편차 기록).
// 순수 로컬 단계라 방 멤버십 불요 — 조인·비번·정원 게이트는 다음 화면(RoomPage)이 담당.
const SKIP_KEY = 'cb.greenroomSkip'

// 거울 크기 — 화면을 지배하는 대형 거울(의상실 문법, 주인님 콜: "거울이 많이 커야해").
// 데스크탑 = 우측 패널(320)+여백 제외 폭·뷰포트 높이 62% 중 작은 쪽. 분장실은 체류가 짧은
// 이행 화면이라 마운트 1회 계산으로 충분(반응형 게이트는 뷰포트별 fresh load 로 판정).
function computeMirrorPx(): number {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!window.matchMedia('(min-width: 768px)').matches) return Math.min(Math.round(vw * 0.62), 300)
  return Math.max(280, Math.min(Math.round(vh * 0.62), vw - 320 - 96, 560))
}

const noop = () => {}

export default function GreenRoomPage() {
  const { t } = useTranslation()
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const myAvatarUrl = useUserStore((s) => s.avatarUrl)
  const trackingState = useTrackingStore((s) => s.state)
  const backdrop = useInterior('rooms')?.hero // 대극장 내부 원화 — 직전 화면과 시각 연속
  const [mirrorPx] = useState(computeMirrorPx)

  // "다음부턴 바로 입장" — 마운트 1회 판정(레이지): 체크된 유저는 분장실을 스치지 않고 직행.
  const [skipNext, setSkipNext] = useState(() => localStorage.getItem(SKIP_KEY) === '1')
  useEffect(() => {
    if (roomId && localStorage.getItem(SKIP_KEY) === '1') navigate(`/rooms/${roomId}`, { replace: true })
  }, [roomId, navigate])

  // 마이크 레벨 미터(MOD-05 소리 점검, 0-dep): AnalyserNode 피크를 100ms 간격으로 — 60fps 리렌더 회피.
  const [micLevel, setMicLevel] = useState<number | null>(null)
  const [micErr, setMicErr] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let ctx: AudioContext | null = null
    let stream: MediaStream | null = null
    let cancelled = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)
        timer = setInterval(() => {
          analyser.getByteTimeDomainData(buf)
          let peak = 0
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128)
          setMicLevel(peak)
        }, 100)
      } catch {
        if (!cancelled) setMicErr(true)
      }
    })()
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      void ctx?.close()
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  const toggleSkip = (checked: boolean) => {
    setSkipNext(checked)
    if (checked) localStorage.setItem(SKIP_KEY, '1')
    else localStorage.removeItem(SKIP_KEY)
  }

  if (!roomId) return null
  const deviceTrouble = micErr || trackingState === 'ERROR' || trackingState === 'UNSUPPORTED'

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-stage-base p-4 text-stage-text md:p-6">
      {/* 백드롭: 대극장 내부 원화 디밍+블러(주인님 콜) — 대극장→분장실→무대가 한 시퀀스로 이어짐 */}
      {backdrop && <img src={backdrop} alt="" aria-hidden="true" draggable={false} className="scene-veil select-none" />}

      <div className="scene-veil-in relative flex w-full flex-col items-center gap-5 md:flex-row md:justify-center md:gap-10">
        {/* 거울 — 화면의 주인공(의상실과 같은 아치 금장 프레임). 송신은 없음(방 연결 전). */}
        <div className="mirror-frame mirror-frame--arch flex flex-col items-center">
          <SelfAvatar projectUrl={resolveAvatarUrl(myAvatarUrl)} sendBlendshapes={noop} size={mirrorPx} />
        </div>

        {/* 점검 패널 — 목조 반투명(interior-panel, 내부 씬 공통 문법) */}
        <div className="interior-panel w-full max-w-sm md:w-80">
          <h1 className="text-xl font-bold md:text-2xl">{t('greenroom.title')}</h1>
          <p className="mt-1 text-sm text-stage-text-muted">{t('greenroom.hint')}</p>

          <div className="mt-5">
            {micErr ? (
              <p className="rounded-lg bg-fire-hot/10 px-3 py-2 text-xs text-fire-hot" role="alert">
                {t('greenroom.micDenied')}
              </p>
            ) : (
              <ProgressBar value={micLevel ?? 0} label={t('greenroom.micLevel')} />
            )}
          </div>

          {/* MOD-06 최소: 권한/디바이스 문제 안내 — 그래도 입장은 막지 않는다(소프트 게이트). */}
          {deviceTrouble && (
            <p className="mt-3 text-xs text-stage-text-muted">{t('greenroom.troubleHint')}</p>
          )}

          <button
            onClick={() => navigate(`/rooms/${roomId}`)}
            className={`mt-6 w-full rounded-lg bg-fire-amber px-4 py-3 text-base font-bold text-stage-base hover:opacity-90 ${
              trackingState === 'TRACKING' ? 'ring-2 ring-spring-green/60' : ''
            }`}
          >
            {t('greenroom.enter')}
          </button>

          <label className="mt-3 flex items-center gap-2 text-xs text-stage-text-muted">
            <input type="checkbox" checked={skipNext} onChange={(e) => toggleSkip(e.target.checked)} />
            {t('greenroom.skipNext')}
          </label>
        </div>
      </div>
    </main>
  )
}
