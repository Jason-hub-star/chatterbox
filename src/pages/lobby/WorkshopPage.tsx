import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { ensureStudioRoom } from '@/lib/rooms'
import InteriorShell from '@/pages/lobby/InteriorShell'
import VgenStatusTab from '@/features/vgen/VgenStatusTab'

// 공방(로비 v3 재편) = 쇼츠 제작소. VGEN 이 room 에 강결합(vgen_jobs.room_id·호스트검증·R2 경로)이라
// 유저당 숨겨진 스튜디오 방을 get-or-create(ensure-studio-room)로 확보한 뒤, 기존 VgenStatusTab 을
// 그대로 마운트한다 — reference-to-video·9:16·크레딧·R2 경로·SEC-2/3 보안 무변경. isHost=내 스튜디오라 true.
// 방 만들기(create-room)는 대극장(TheaterPage)으로 이관됨. 공유(onShare)는 룸 전용이라 미전달(버튼 숨김).
export default function WorkshopPage() {
  const { t } = useTranslation()
  const session = useUserStore((s) => s.session)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      try {
        const { room_id } = await ensureStudioRoom(session.access_token)
        if (!cancelled) setRoomId(room_id)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  return (
    <InteriorShell dest="create" title={t('shorts.title')}>
      <div className="relative z-10 mx-auto w-full max-w-xl px-4 pb-8 md:absolute md:inset-x-0 md:top-[12%] md:px-6">
        <div className="interior-panel">
          {failed ? (
            <p className="text-sm text-stage-text-muted">{t('shorts.loadError')}</p>
          ) : !roomId ? (
            <p className="text-sm text-stage-text-muted">{t('shorts.preparing')}</p>
          ) : (
            <VgenStatusTab roomId={roomId} isHost />
          )}
        </div>
      </div>
    </InteriorShell>
  )
}
