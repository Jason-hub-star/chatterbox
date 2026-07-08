// i18n 키 커버리지 도구(A-SEAM-5). ko 가 키의 SSOT — en/ja 는 그 부분집합이어야 한다.
// missingKeys: ko 에 있으나 target 에 없는 키 = 번역 대기 목록(트랙 B 가 채움). fallbackLng:'ko' 라
//   빠져도 동작은 하지만 완성도를 추적/가드한다. orphanKeys: target 에만 있는 키 = ko 오타(렌더 안 됨) → 0 이어야.
export function missingKeys(base: Record<string, string>, target: Record<string, string>): string[] {
  return Object.keys(base).filter((k) => !(k in target))
}

export function orphanKeys(base: Record<string, string>, target: Record<string, string>): string[] {
  return Object.keys(target).filter((k) => !(k in base))
}
