import { describe, it, expect, afterEach } from 'vitest'
import i18n from '@/i18n'

// i18n 개통(G-17/INFRA-05) ground-truth: 언어 전환·fallback 이 실제로 동작하는지.
describe('i18n pipe', () => {
  afterEach(async () => {
    await i18n.changeLanguage('ko')
  })

  it('ko 기본값을 반환한다', () => {
    expect(i18n.t('common.cancel')).toBe('취소')
    expect(i18n.t('maintenance.message')).toBe('점검 중입니다. 잠시 후 다시 시도해주세요.')
  })

  it('en 으로 전환하면 시드된 키가 영어로 바뀐다', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('common.cancel')).toBe('Cancel')
    expect(i18n.t('login.title')).toBe('Log in')
  })

  it('ja 로 전환하면 시드된 키가 일본어로 바뀐다', async () => {
    await i18n.changeLanguage('ja')
    expect(i18n.t('settings.language')).toBe('言語')
  })

  it('미시드 키는 ko 로 fallback 한다(파이프는 열림, 값은 점진)', async () => {
    await i18n.changeLanguage('en')
    // dub.* 는 en 미시드 → 한국어로 fallback
    expect(i18n.t('dub.header')).toBe('더빙')
  })

  it('flat dotted 키를 중첩 없이 통째로 조회한다(keySeparator:false)', () => {
    expect(i18n.t('register.errors.invalidEmail')).toBe('이메일 형식이 올바르지 않습니다.')
  })
})
