import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// 단일 대상(행/필터) postgres_changes 구독 seam(A-SEAM-3 / UX-GAPS P-3).
// 수동 새로고침을 대체한다 — 변경 감지 시 onChange 를 호출해 호출부가 신뢰 소스에서 재조회하게 한다
// (payload 를 그대로 쓰지 않음: RLS·조인 파생 상태는 재fetch 가 안전). vgenStore.subscribeToVgenJob 과 동형.
// onChange 는 ref 로 최신값을 유지 → 대상(table/filter/value)이 바뀔 때만 재구독(콜백 identity 로 인한 재구독 없음).
export function useRealtimeRow(
  table: string,
  filterColumn: string,
  value: string | null | undefined,
  onChange: () => void,
) {
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  }, [onChange])
  useEffect(() => {
    if (!value) return
    const ch = supabase
      .channel(`rt:${table}:${filterColumn}:${value}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${filterColumn}=eq.${value}` },
        () => cb.current(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [table, filterColumn, value])
}
