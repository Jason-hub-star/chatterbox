import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'

// 글로벌 [+ 만들기](UIUX-OVERHAUL-2026-07 P2) — "생성이 첫 화면" 문법: 아바타·쇼츠·무대 3진입 1클릭.
// 아바타=의상실 위저드 딥링크(?create=1), 쇼츠=제작소(스튜디오 룸 기존 플로우), 무대=대극장 생성 모달(?tab=create).
// 게스트(비로그인·익명 관전 세션)는 목적지 보존 로그인으로(LOB-05 리다이렉트 규칙).
const DESTS = [
  { key: 'avatar', to: '/lobby/atelier?create=1' },
  { key: 'shorts', to: '/lobby/workshop' },
  { key: 'stage', to: '/lobby/theater?tab=create' },
] as const

export default function CreateMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useUserStore((s) => s.session)
  const user = useUserStore((s) => s.user)
  const named = !!session && user?.is_anonymous !== true
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 바깥 클릭 닫기(FriendsButton 팝오버 동형).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const go = (to: string) => {
    setOpen(false)
    if (named) navigate(to)
    else navigate('/login', { state: { from: to } })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-lg bg-fire-amber px-4 py-1.5 text-sm font-bold text-stage-base hover:opacity-90"
      >
        + {t('create.menuTitle')}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-lg border border-stage-border bg-stage-elevated p-1 shadow-lg"
        >
          {DESTS.map((d) => (
            <button
              key={d.key}
              role="menuitem"
              onClick={() => go(d.to)}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-stage-text hover:bg-stage-panel"
            >
              {t(`create.${d.key}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
