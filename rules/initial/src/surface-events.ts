/** Privacy-safe Token Economy activity emitted for browser and session projections. */
import { RTK_FILTER_IDS } from './rtk/catalog.ts'
export const ECONOMY_FILTER_NAMES = ['pytest', 'grep', 'git-diff', 'tsc', 'eslint-json', 'vite-build', 'pnpm-install', 'native-grep', 'native-glob', 'ruff-json', 'go-test-json', 'git-status', 'search-layout', 'path-list', 'test-progress', 'ls-listing', 'test-report', 'cargo-build', 'learned-rule', ...RTK_FILTER_IDS] as const
export type EconomyFilterName = typeof ECONOMY_FILTER_NAMES[number]

/** Product-facing rule name. Durable IDs remain unchanged for historical evidence and policies. */
export function economyRuleDisplayName(name: EconomyFilterName): string {
  return name.startsWith('rtk/') ? name.slice(4) : name
}

export const ECONOMY_ACTIVITY_EVENT = 'lightcode/economy-activity' as const

export interface EconomyActivityEventData {
  readonly deliveredSha256?: string
  readonly schemaVersion: 1
  readonly callId: string
  readonly turn: number | null
  readonly mode: 'preview' | 'applied'
  readonly filter: EconomyFilterName
  readonly rawTokens: number
  readonly projectedTokens: number
  readonly savedTokens: number
  readonly recoverable: boolean
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'lightcode/economy-activity': EconomyActivityEventData
  }
}
