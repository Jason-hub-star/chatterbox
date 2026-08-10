import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { recLabelText } from '@/features/room/recordingLabels'

// REC-CONSENT-N 회귀 잠금.
//  - 동의 대기 라벨이 "n/N" 을 실어야 한다. 정적 "동의 대기 중" 으로 되돌아가면 호스트는
//    무응답자가 몇 명인지 다시 알 수 없게 된다(거절만 toast 로 오고 무응답은 영구 침묵).
//  - 분자/분모는 **서버가 준 값만** 쓴다. required=0(집계 미도착)이면 정적 라벨로 폴백해야지,
//    "0/0" 같은 거짓 진행률을 그리면 안 된다.
const t = (key: string, opts?: Record<string, unknown>) => String(i18n.t(key, opts as never))

describe('recLabelText', () => {
  it('동의 대기: 서버 집계가 있으면 n/N 을 싣는다', () => {
    const label = recLabelText('consentPending', t, { consent: { consented: 1, required: 3 } })
    expect(label).toContain('1')
    expect(label).toContain('3')
    expect(label).not.toBe(t('room.ctrlRecordPending'))
  })

  it('집계가 없거나 분모 0 이면 정적 라벨로 폴백한다(거짓 0/0 금지)', () => {
    expect(recLabelText('consentPending', t)).toBe(t('room.ctrlRecordPending'))
    expect(recLabelText('consentPending', t, { consent: null })).toBe(t('room.ctrlRecordPending'))
    expect(recLabelText('consentPending', t, { consent: { consented: 0, required: 0 } }))
      .toBe(t('room.ctrlRecordPending'))
  })

  it('업로드 진행률은 기존대로 % 를 병기한다(하단바 회귀 방지)', () => {
    expect(recLabelText('uploading', t, { uploadPct: 42 })).toBe(`${t('room.ctrlRecordUploading')} 42%`)
    expect(recLabelText('uploading', t)).toBe(t('room.ctrlRecordUploading'))
  })

  it('동의 집계는 consentPending 이외 phase 를 오염시키지 않는다', () => {
    const consent = { consented: 1, required: 3 }
    expect(recLabelText('recording', t, { consent })).toBe(t('room.ctrlRecordStop'))
    expect(recLabelText('idle', t, { consent })).toBe(t('room.ctrlRecord'))
  })
})
