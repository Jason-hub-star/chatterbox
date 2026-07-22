import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'
import CommissionCorner from '@/features/avatar/CommissionCorner'
import type { AvatarJob } from '@/types/avatarJob'

// X1(AVATAR-DONE-NOTIFY): 재진입 배너 렌더 분기 실렌더 — awayDone>0 이면 통지 배너 + 닫기 콜백.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root | null = null

const render = (awayDone: number, onDismiss: () => void) =>
  act(() =>
    root!.render(
      <CommissionCorner
        jobs={[]}
        onSubmit={async () => {}}
        wizardOpen={false}
        onWizardToggle={() => {}}
        reused={false}
        onDismissReused={() => {}}
        awayDone={awayDone}
        onDismissAwayDone={onDismiss}
      />,
    ),
  )

const bannerTitle = () => i18n.t('atelier.awayDoneTitle')

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root!.unmount())
  container.remove()
})

describe('CommissionCorner 재진입 배너', () => {
  it('awayDone>0 이면 통지 배너 노출 + count 반영', () => {
    render(2, () => {})
    expect(container.textContent).toContain(bannerTitle())
    expect(container.textContent).toContain('2') // {{count}} 보간
  })

  it('awayDone=0 이면 배너 미노출', () => {
    render(0, () => {})
    expect(container.textContent).not.toContain(bannerTitle())
  })

  it('닫기 버튼이 onDismissAwayDone 호출', () => {
    let dismissed = false
    render(1, () => { dismissed = true })
    const closeBtn = [...container.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === i18n.t('common.close'),
    ) as HTMLButtonElement
    act(() => closeBtn.click())
    expect(dismissed).toBe(true)
  })
})

// X2(COMMISSION-QUEUED-GRAY): queued 잡은 OrderCard 에 "대기 중" 배지 노출(전 스텝 회색 오인 해소).
describe('CommissionCorner queued 배지', () => {
  const queuedJob: AvatarJob = {
    id: 'j1', userId: '', status: 'queued', phase: null,
    resultProjectUrl: null, error: null, createdAt: new Date(0).toISOString(), cached: false,
  }
  const renderJobs = (jobs: AvatarJob[]) =>
    act(() =>
      root!.render(
        <CommissionCorner
          jobs={jobs}
          onSubmit={async () => {}}
          wizardOpen={false}
          onWizardToggle={() => {}}
          reused={false}
          onDismissReused={() => {}}
          awayDone={0}
          onDismissAwayDone={() => {}}
        />,
      ),
    )

  it('queued 잡이면 "대기 중" 배지 노출', () => {
    renderJobs([queuedJob])
    expect(container.textContent).toContain(i18n.t('atelier.commissionQueued'))
  })

  it('running 잡이면 대기 배지 미노출', () => {
    renderJobs([{ ...queuedJob, status: 'running', phase: 'analyzing' }])
    expect(container.textContent).not.toContain(i18n.t('atelier.commissionQueued'))
  })
})
