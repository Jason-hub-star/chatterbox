import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// SSOT: docs/specs/FeatureFlags.md — app_config 테이블 + Realtime.
interface AppConfig {
  VGEN_ENABLED: boolean
  DUB_ENABLED: boolean
  DUB_YOUTUBE_ENABLED: boolean
  ROOM_MAX_USERS: number
  VGEN_DAILY_LIMIT: number
  VGEN_MAX_SEC: number
  LIVEKIT_ENABLED: boolean
  MAINTENANCE_MODE: boolean
  NEW_ONBOARDING: boolean
  VGEN_REFUND_MODERATION: boolean
  VGEN_REFUND_USER_CANCEL: boolean
  DUB_REFUND_USER_CANCEL: boolean
  [key: string]: boolean | number | string
}

// ponytail: 비용 발생 기능은 로드 실패 시 false로 닫는다 (FeatureFlags.md §MUST NOT).
const DEFAULT_CONFIG: AppConfig = {
  VGEN_ENABLED: false,
  DUB_ENABLED: false,
  DUB_YOUTUBE_ENABLED: false,
  ROOM_MAX_USERS: 6,
  VGEN_DAILY_LIMIT: 3,
  VGEN_MAX_SEC: 10,
  LIVEKIT_ENABLED: true,
  MAINTENANCE_MODE: false,
  NEW_ONBOARDING: false,
  VGEN_REFUND_MODERATION: false,
  VGEN_REFUND_USER_CANCEL: false,
  DUB_REFUND_USER_CANCEL: false,
}

type ConfigValue = boolean | number | string
// app_config.value 는 JSONB {"value": ...} 형태 (FeatureFlags.md §스키마).
interface ConfigRow {
  key: string
  value: { value: ConfigValue }
}

interface ConfigStore {
  config: AppConfig
  ready: boolean
  loadConfig: () => Promise<void>
  subscribeRealtime: () => () => void
  getFlag: <K extends keyof AppConfig>(key: K) => AppConfig[K]
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  ready: false,

  loadConfig: async () => {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .eq('enabled', true)
      .returns<ConfigRow[]>()

    if (error || !data) return

    const config: AppConfig = { ...DEFAULT_CONFIG }
    for (const row of data) config[row.key] = row.value.value
    set({ config, ready: true })
  },

  subscribeRealtime: () => {
    const channel = supabase
      .channel('app_config_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_config' },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          // boundary 캐스팅: Realtime payload.new 는 제네릭 Record 이므로 여기서 한 번만 좁힌다.
          const row = payload.new as ConfigRow
          set((state) => ({
            config: { ...state.config, [row.key]: row.value.value },
          }))
        },
      )
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  },

  getFlag: (key) => get().config[key] ?? DEFAULT_CONFIG[key],
}))
