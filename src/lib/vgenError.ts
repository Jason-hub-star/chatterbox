// vgen 생성 에러 원인 매핑(UX-3, 델타 감사): 네트워크·레이트리밋을 원인별 i18n 키로.
// 매칭 없으면 null → 서버가 준 한글 메시지·하드코딩 그대로(edgeFn 이 error.message 보존).
export function vgenErrorKey(raw: string): string | null {
  const s = raw.toLowerCase()
  if (s.includes('429') || s.includes('too many') || s.includes('rate limit')) return 'vgen.errRate'
  if (s.includes('failed to fetch') || s.includes('network') || s.includes('timeout') || s.includes('timed out')) return 'vgen.errNetwork'
  return null
}
