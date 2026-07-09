import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomStore } from '@/stores/roomStore'
import { useAudioStore } from '@/stores/audioStore'

// ROOM-08 음량 믹서 — 무대 우상단 부동 토글(🎚, PiP 아래) → 마스터 + 원격 참가자별 슬라이더.
// 로컬 전용: 스토어에만 쓰고, 실제 적용은 useLiveKitRoom 의 스토어 구독 브리지가 담당.
// 계약 대비 편차: BGM 슬라이더(기능 부재)·업링크 헬스체크 defer — audioStore ponytail 주석 참조.
export default function AudioMixerPanel() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const participants = useRoomStore((s) => s.participants)
  const masterVolume = useAudioStore((s) => s.masterVolume)
  const participantVolumes = useAudioStore((s) => s.participantVolumes)
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume)
  const setParticipantVolume = useAudioStore((s) => s.setParticipantVolume)
  const remotes = participants.filter((p) => !p.isLocal)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('stage.mixerOpen')}
        title={t('stage.mixerOpen')}
        className="absolute right-14 top-2 z-30 grid h-9 w-9 place-items-center rounded-full border border-stage-border bg-stage-panel/80 text-sm hover:border-fire-amber"
      >
        🎚
      </button>
    )
  }

  return (
    <div
      data-audio-mixer
      // PiP 패널과 같은 기본 슬롯(top-14) — 동시 개방 시 겹치면 PiP 를 드래그로 치울 수 있어 수용(희귀 경로).
      className="absolute right-2 top-14 z-30 w-56 rounded-lg border border-stage-border bg-stage-panel/95 p-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-stage-text">🎚 {t('stage.mixerTitle')}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('common.close')}
          className="text-xs text-stage-text-muted hover:text-stage-text"
        >
          ✕
        </button>
      </div>

      <label className="mt-2 block text-[11px] text-stage-text-muted">
        {t('stage.mixerMaster')} · {Math.round(masterVolume * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={masterVolume}
          onChange={(e) => setMasterVolume(Number(e.target.value))}
          aria-label={t('stage.mixerMaster')}
          className="mt-1 w-full accent-fire-amber"
        />
      </label>

      {remotes.length === 0 ? (
        <p className="mt-3 text-[11px] text-stage-text-muted">{t('stage.mixerNoRemote')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {remotes.map((p) => {
            const v = participantVolumes[p.identity] ?? 1
            return (
              <li key={p.identity} className="text-[11px] text-stage-text-muted">
                <span className="block truncate text-stage-text">{p.name || p.identity} · {Math.round(v * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v}
                  onChange={(e) => setParticipantVolume(p.identity, Number(e.target.value))}
                  aria-label={t('stage.mixerParticipant', { name: p.name || p.identity })}
                  className="mt-0.5 w-full accent-fire-amber"
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
