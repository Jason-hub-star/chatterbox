import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Cue } from './cues'
import { CUE_TEXT_CLS, type FontScale } from './fontScale'

// 텔레프롬프터 포커스 뷰(ROOM-06 A안) — 현재 대사를 크게 보여주고, 긴 대사는 박스 안에서
// 스크롤되며, 다음 대사를 흐리게 미리 보여준다. 계약: contracts/ScriptPanel.md.
// ponytail: 배치 무관 컴포넌트로 분리한 이유 = C 승급(무대 하단 전폭 오버레이) 시 이 컴포넌트를
//   그대로 오버레이 컨테이너에 mount 하면 됨(cue 동기·역할 로직 재작성 0).
//   ceiling: 좁은 좌 dock 폭 — 무대 몰입이 중요해지면 C(전폭)로 승급.

interface Props {
  cue: Cue | null
  cueIndex: number
  total: number
  myTurn: boolean
  nextCue: Cue | null
  fontScale: FontScale
  canAdvance: boolean
  atStart: boolean
  atEnd: boolean
  onAdvance: (delta: number) => void
}

export default function TeleprompterFocus({
  cue,
  cueIndex,
  total,
  myTurn,
  nextCue,
  fontScale,
  canAdvance,
  atStart,
  atEnd,
  onAdvance,
}: Props) {
  const { t } = useTranslation()
  // 긴 대사: cue 가 바뀌면 박스를 맨 위로 되감아 새 대사를 처음부터 읽게 한다.
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = 0
  }, [cueIndex])

  return (
    <div className="mt-2">
      {/* 현재 대사(포커스 박스) — 내 차례면 강조, 긴 대사는 내부 스크롤 */}
      <div
        data-testid="current-cue"
        className={`rounded-lg border p-4 ${myTurn ? 'border-fire-amber bg-fire-amber/10' : 'border-stage-border'}`}
        role="status"
        aria-live="polite"
      >
        <div className="text-xs text-stage-text-muted">
          {cue ? `${cue.role} · ${cueIndex + 1}/${total}` : t('script.end')}
          {myTurn && <span className="ml-2 font-bold text-fire-amber">{t('script.myTurn')}</span>}
        </div>
        <div ref={boxRef} data-testid="cue-scroll" className="mt-1 max-h-[40vh] overflow-y-auto">
          <p className={`${CUE_TEXT_CLS[fontScale]} leading-relaxed text-stage-text`}>{cue?.text ?? '—'}</p>
        </div>
      </div>

      {/* 다음 대사 미리보기(흐리게 1줄) */}
      <p className="mt-1.5 truncate text-[11px] text-stage-text-muted">
        {nextCue ? `${t('script.nextUp')} · ${nextCue.role}: ${nextCue.text}` : t('script.end')}
      </p>

      {/* 진행 컨트롤 — 호스트/리허설 전원(canAdvance), 서버 advance-script-cue 가 동일 규칙 재검증 */}
      {canAdvance ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onAdvance(-1)}
            disabled={atStart}
            className="rounded-lg border border-stage-border px-3 py-1 text-sm text-stage-text disabled:opacity-40"
          >
            {t('script.prev')}
          </button>
          <button
            type="button"
            onClick={() => onAdvance(1)}
            disabled={atEnd}
            className="rounded-lg bg-fire-amber px-4 py-1 text-sm font-semibold text-stage-base disabled:opacity-40"
          >
            {t('script.next')}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-stage-text-muted">{t('script.hostAdvances')}</p>
      )}
    </div>
  )
}
