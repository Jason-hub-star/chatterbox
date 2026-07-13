import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomStore } from '@/stores/roomStore'
import { useAudioStore } from '@/stores/audioStore'

// ROOM-08 음량 믹서 — 하단바 🎧(open/onClose controlled prop, RoomPage 소유) → 마스터 + BGM + 원격 참가자별 슬라이더.
// 로컬 전용: 스토어에만 쓰고, 실제 적용은 useLiveKitRoom(원격 트랙)·lib/sound.ts(BGM) 구독 브리지가 담당.
// 계약 대비 편차: 업링크 헬스체크 defer — audioStore ponytail 주석 참조.
export default function AudioMixerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const participants = useRoomStore((s) => s.participants)
  const masterVolume = useAudioStore((s) => s.masterVolume)
  const bgmVolume = useAudioStore((s) => s.bgmVolume)
  const participantVolumes = useAudioStore((s) => s.participantVolumes)
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume)
  const setBgmVolume = useAudioStore((s) => s.setBgmVolume)
  const setParticipantVolume = useAudioStore((s) => s.setParticipantVolume)
  const micDeviceId = useAudioStore((s) => s.micDeviceId)
  const setMicDeviceId = useAudioStore((s) => s.setMicDeviceId)
  const bgmEnabled = useAudioStore((s) => s.bgmEnabled)
  const setBgmEnabled = useAudioStore((s) => s.setBgmEnabled)
  const remotes = participants.filter((p) => !p.isLocal)

  // 마이크 입력 기기 목록(패널 열릴 때 열거 — 룸은 이미 마이크 권한이라 label 채워짐). 게인은 defer(audioStore ponytail).
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    if (!open) return
    navigator.mediaDevices?.enumerateDevices?.()
      .then((ds) => setMics(ds.filter((d) => d.kind === 'audioinput')))
      .catch(() => {})
  }, [open])

  if (!open) return null

  return (
    <div
      data-audio-mixer
      // 🎧 오디오 버튼 앵커 팝오버(RoomBottomBar 의 relative 래퍼 안) — 버튼 바로 위에 열린다. 내용 길면 내부 스크롤.
      className="absolute bottom-full right-0 mb-2 z-40 max-h-[70vh] w-64 overflow-y-auto rounded-lg border border-stage-border bg-stage-panel/95 p-3 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-stage-text">🎚 {t('stage.mixerTitle')}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="text-xs text-stage-text-muted hover:text-stage-text"
        >
          ✕
        </button>
      </div>

      {/* 내 마이크 입력 기기(ROOM-08 오디오 통합) — 선택 시 로컬 트랙 재발행(useLiveKitRoom switchActiveDevice). 게인은 defer. */}
      <label className="mt-2 block text-[11px] text-stage-text-muted">
        {t('stage.mixerMic')}
        <select
          value={micDeviceId ?? ''}
          onChange={(e) => setMicDeviceId(e.target.value || null)}
          className="mt-1 w-full rounded border border-stage-border bg-stage-elevated px-2 py-1 text-xs text-stage-text"
          aria-label={t('stage.mixerMic')}
        >
          <option value="">{t('stage.mixerMicDefault')}</option>
          {mics.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>{m.label || m.deviceId.slice(0, 8)}</option>
          ))}
        </select>
      </label>

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

      {/* 배경 음악(BGM) 온오프 + 볼륨 — 끄면 슬라이더 볼륨을 기억한 채 무음(audioStore bgmEnabled → lib/sound.ts). */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-stage-text-muted">{t('stage.mixerBgm')} · {Math.round(bgmVolume * 100)}%</span>
          <button
            type="button"
            onClick={() => setBgmEnabled(!bgmEnabled)}
            aria-pressed={bgmEnabled}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              bgmEnabled ? 'bg-fire-amber/20 text-fire-amber' : 'border border-stage-border text-stage-text-muted hover:text-stage-text'
            }`}
          >
            {bgmEnabled ? t('stage.bgmOn') : t('stage.bgmOff')}
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={bgmVolume}
          onChange={(e) => setBgmVolume(Number(e.target.value))}
          disabled={!bgmEnabled}
          aria-label={t('stage.mixerBgm')}
          className="mt-1 w-full accent-fire-amber disabled:opacity-40"
        />
      </div>

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
