import type { ToolCallId, ContentBlock } from '@deepseek-ai/dsh-llm'
import type { MappedProjection, SourceMap, OmittedSourceRange } from './projection-map.ts'
import type { EconomyFilterName } from './surface-events.ts'
import type { FilterOptions } from './filter-options.ts'
export { ECONOMY_FILTER_NAMES } from './surface-events.ts'
export type { EconomyFilterName } from './surface-events.ts'

export const ECONOMY_PROJECTION_EVENT = 'lightcode/economy-projection' as const

export type EconomyTransformation = 'noise-removal' | 'preview' | 'lossless-formatting' | 'diagnostic-deduplication'

export interface FilterInput {
  readonly command: string
  readonly stdout: string
  readonly exitCode: number
  readonly options?: FilterOptions
}

export interface FilterCandidate extends MappedProjection {
  readonly filter: EconomyFilterName
  readonly transformation: EconomyTransformation
  readonly text: string
}

export interface EconomyFilter {
  readonly name: EconomyFilterName
  readonly transformation: EconomyTransformation
  project(input: FilterInput): string | undefined
  projectMapped(input: FilterInput): MappedProjection | undefined
}

export type EconomyDecisionReason =
  | 'would-project'
  | 'projected'
  | 'unsupported-tool'
  | 'invalid-command'
  | 'background-call'
  | 'tool-error'
  | 'non-text-content'
  | 'unsupported-result-shape'
  | 'already-truncated'
  | 'no-filter-match'
  | 'filter-error'
  | 'non-growth-rejected'
  | 'cancelled'
  | 'missing-session-owner'
  | 'missing-spill-store'
  | 'spill-failed'
  | 'provenance-append-failed'
  | 'nested-call'
  | 'final-result-changed'
  | 'missing-provenance-support'
  | 'interrupted-result'
  | 'learned-retention'
  | 'invalid-filter-options'
  | 'policy-runtime-mismatch'
  | 'task-scope-unavailable'

export interface EconomyDecision {
  readonly callId: ToolCallId
  readonly toolName: string
  readonly reason: EconomyDecisionReason
  readonly matchDetail?: 'unsupported-shell-syntax' | 'compound-output-unrecognized' | 'command-not-covered' | 'output-format-unrecognized'
  readonly command?: string
  readonly filter?: EconomyFilterName
  readonly transformation?: EconomyTransformation
  readonly ruleId?: string
  readonly policyHash?: string
  readonly rulesHash?: string
  readonly filterOptions?: FilterOptions
  readonly rawBytes?: number
  readonly candidateBytes?: number
  readonly rawTokens?: number
  readonly candidateTokens?: number
  readonly candidateContent?: readonly ContentBlock[]
  readonly sourceMap?: SourceMap
}

/** Raw artifact and candidate provenance; a matching final result confirms application. */
export interface EconomyProjectionEventData {
  readonly schemaVersion: 1
  /** Absent in legacy recoverable deliveries. Raw refs are private audit data. */
  readonly delivery?: 'standalone'
  readonly callId: ToolCallId
  readonly toolName: string
  readonly filter: EconomyFilterName
  readonly minimumSavedTokens: number
  readonly ruleVersion?: 'static-v2' | 'static-v3' | 'static-v4' | 'static-v5' | 'static-v6' | 'static-v7' | 'static-v8' | 'static-v9' | 'static-v10'
  readonly policyHash?: string
  readonly rulesHash?: string
  readonly ruleId?: string
  readonly filterOptions?: FilterOptions
  readonly transformation?: EconomyTransformation
  /** UTF-16 ranges not copied into the projection, including layout whitespace. */
  readonly omittedSourceRanges?: readonly OmittedSourceRange[]
  readonly sourceMap?: SourceMap
  readonly raw: {
    readonly contentSha256: string
    readonly byteLength: number
    readonly estimatedTokens: number
    readonly artifact: {
      readonly locator: string
      readonly byteLength: number
      readonly retrievalHint: string
    }
  }
  readonly projected: {
    readonly contentSha256: string
    readonly byteLength: number
    readonly estimatedTokens: number
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'lightcode/economy-projection': EconomyProjectionEventData
  }
}
