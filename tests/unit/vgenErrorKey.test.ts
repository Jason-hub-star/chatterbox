import { describe, expect, it } from 'vitest'
import { vgenErrorKey } from '@/lib/vgenError'

// UX-3(델타 감사): 생성 에러 원인 매핑. 매칭 없으면 null(서버 한글 메시지 그대로).
describe('vgenErrorKey', () => {
  it('레이트리밋 → vgen.errRate', () => {
    expect(vgenErrorKey('HTTP 429 Too Many Requests')).toBe('vgen.errRate')
    expect(vgenErrorKey('rate limit exceeded')).toBe('vgen.errRate')
  })
  it('네트워크 → vgen.errNetwork', () => {
    expect(vgenErrorKey('Failed to fetch')).toBe('vgen.errNetwork')
    expect(vgenErrorKey('request timed out')).toBe('vgen.errNetwork')
  })
  it('서버 한글 메시지·미매칭 → null(원문 유지)', () => {
    expect(vgenErrorKey('영상 생성 기능이 아직 비활성화 상태예요.')).toBeNull()
    expect(vgenErrorKey('생성 요청 실패')).toBeNull()
  })
})
