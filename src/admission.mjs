/**
 * Admission F_pi (Equation 3): the policy's rendering enters the context only
 * if it passes a fixed validity check; anything else enters unchanged. Every
 * raw observation is kept in the raw archive A, which the agent never reads.
 */
import { bytes, estimateTokens } from './tokens.mjs'

/** The rule input for one shell observation (o, m). */
export function shellInput({ command, output, exitCode = 0, toolName = 'bash', stream = 'stdout' }) {
  return { kind: 'shell', toolName, arguments: { command }, command, raw: output, exitCode, stream }
}

/**
 * Validity check: strictly fewer bytes and at least `minimumSavedTokens`
 * fewer tokens than the raw observation. A rule error also falls back to raw.
 */
export function admit(policy, input, { minimumSavedTokens = 1 } = {}) {
  const raw = input.raw
  const rawTokens = estimateTokens(raw)
  let candidate
  try {
    candidate = policy.project(input)
  } catch (error) {
    return { delivered: raw, decision: { reason: 'filter-error', error: String(error), rawTokens, savedTokens: 0 } }
  }
  if (candidate === undefined) return { delivered: raw, decision: { reason: 'no-filter-match', rawTokens, savedTokens: 0 } }
  const candidateTokens = estimateTokens(candidate.text)
  const base = { ruleId: candidate.ruleId, transformation: candidate.transformation, rawTokens, candidateTokens }
  if (candidate.text.trim() === '' || bytes(candidate.text) >= bytes(raw) || rawTokens - candidateTokens < minimumSavedTokens) {
    return { delivered: raw, decision: { ...base, reason: 'non-growth-rejected', savedTokens: 0 } }
  }
  return { delivered: candidate.text, candidate,
    decision: { ...base, reason: 'would-project', savedTokens: rawTokens - candidateTokens } }
}

/** The raw archive A: every raw observation with what the agent actually read. */
export class RawArchive {
  records = []

  add(record) {
    const entry = { id: `obs-${String(this.records.length + 1).padStart(4, '0')}`, ...record }
    this.records.push(entry)
    return entry
  }

  /** Replay evidence: the inputs of every archived observation. */
  replayCases() {
    return this.records.map(record => ({ id: record.id, input: record.input }))
  }
}
