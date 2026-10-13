/**
 * Verification (Equation 9). A proposal pi' is compared with the current
 * policy pi_k on evidence the agent never reads:
 *   - replay evidence D_k (raw observations of all learning tasks so far)
 *     measures the saving s_pi(e) = T^(o_e) - T^(F_pi(o_e, m_e));
 *   - preservation requirements P guard fidelity.
 * Accept iff P(pi') and (not P(pi_k), a repair, or total gain > 0 with no
 * observation's saving reduced). Task outcomes are not consulted.
 */
import { admit } from './admission.mjs'
import { checkContracts } from './contracts.mjs'

/** s_pi(e) for every replay case. */
export function replay(policy, cases, options) {
  return cases.map(item => {
    const { decision } = admit(policy, item.input, options)
    return { id: item.id, reason: decision.reason, ruleId: decision.ruleId ?? null, saving: decision.savedTokens }
  })
}

export function verify({ parent, candidate, cases, contracts, minimumSavedTokens = 1 }) {
  if (new Set(cases.map(item => item.id)).size !== cases.length) throw new Error('duplicate replay evidence ID')
  const options = { minimumSavedTokens }
  const parentRows = replay(parent, cases, options)
  const rows = replay(candidate, cases, options)
  const parentSafety = checkContracts(parent, contracts)
  const safety = checkContracts(candidate, contracts)
  const comparisons = rows.map((row, i) => ({ ...row, parentSaving: parentRows[i].saving, delta: row.saving - parentRows[i].saving }))
  const gain = comparisons.reduce((sum, row) => sum + row.delta, 0)
  const regressions = comparisons.filter(row => row.delta < 0)
  const ruleErrors = rows.filter(row => row.reason === 'filter-error').length
  const changed = candidate.hash !== parent.hash
  const repair = !parentSafety.passed && safety.passed
  const accepted = changed && safety.passed && ruleErrors === 0 && (repair || (gain > 0 && regressions.length === 0))
  return {
    accepted,
    changeKind: repair ? 'safety-repair' : 'compression-improvement',
    parentHash: parent.hash,
    candidateHash: candidate.hash,
    gainTokens: gain,
    regressions,
    failures: safety.results.filter(row => !row.passed),
    ruleErrors,
    reasons: [
      !changed && 'unchanged',
      !safety.passed && 'preservation-requirement-failed',
      ruleErrors > 0 && 'filter-error',
      !repair && gain <= 0 && 'no-incremental-token-gain',
      !repair && regressions.length > 0 && 'replay-token-regression',
    ].filter(Boolean),
    comparisons,
  }
}
