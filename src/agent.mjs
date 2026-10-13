/**
 * The interaction loop of Algorithm 1 for one task:
 *   a_t ~ p_theta(. | C),  (o_t, m_t) = Exec(a_t),
 *   A <- A + (o_t, m_t),  C <- C + (a_t, F_pi(o_t, m_t)),
 *   if T^(C) > tau: C <- Psi(C).
 * Recall requests are actions answered from the reference store.
 *
 * `model(context, { canRecall })` returns one of
 *   { type: 'bash', command, thought? } | { type: 'recall', observation_id, query?, thought? } | { type: 'final', text }.
 * `exec(command)` returns { output, exitCode }.
 */
import { admit, RawArchive, shellInput } from './admission.mjs'
import { compact, contextTokens, reachableReferences, recall, ReferenceStore } from './history.mjs'

export async function runTask({ task, model, exec, policy, budgetTokens = 32_000, keepRecent = 6, summarize,
  maxSteps = 40, minimumSavedTokens = 1, store = new ReferenceStore(), archive = new RawArchive(), log = () => {} }) {
  let context = [{ id: 'task', role: 'user', text: task }]
  const trajectory = [], experience = []
  const stats = { steps: 0, inputTokens: 0, savedAtAdmission: 0, compactions: 0, recalls: 0 }
  let final
  for (let step = 0; step < maxSteps; step++) {
    stats.steps++
    stats.inputTokens += contextTokens(context) // every call reads the whole context
    const action = await model(context, { canRecall: reachableReferences(context).length > 0 })
    const { reasoning, ...visible } = action
    trajectory.push({ step, action: visible })
    const said = reasoning === undefined ? {} : { reasoning }
    if (action.type === 'final') { final = action.text; context.push({ id: `a${step}`, role: 'assistant', text: action.text, ...said }); break }
    const callId = `call-${step}`
    if (action.type === 'recall') {
      stats.recalls++
      const result = recall(store, context, action)
      context.push({ id: `a${step}`, role: 'assistant', text: action.thought ?? '', ...said, toolCall: { id: callId, name: 'recall', args: { observation_id: action.observation_id, ...action.query ? { query: action.query } : {} } } })
      // A recalled observation is not stored again: it is already recallable.
      context.push({ id: `r${step}`, role: 'tool', callId, toolName: 'recall', text: result.error ? `error: ${result.error}` : result.text })
      log({ step, kind: 'recall', id: action.observation_id, ok: !result.error })
    } else {
      const { output, exitCode } = await exec(action.command)
      const input = shellInput({ command: action.command, output, exitCode })
      const { delivered, decision } = admit(policy, input, { minimumSavedTokens })
      const record = archive.add({ input, raw: output, delivered, decision })
      experience.push(record)
      stats.savedAtAdmission += decision.savedTokens
      // The exit status is host-owned and always kept.
      const text = exitCode === 0 ? delivered : `${delivered}${delivered.endsWith('\n') ? '' : '\n'}[exit code: ${exitCode}]`
      store.put(record.id, text, 'bash')
      context.push({ id: `a${step}`, role: 'assistant', text: action.thought ?? '', ...said, toolCall: { id: callId, name: 'bash', args: { command: action.command } } })
      context.push({ id: record.id, role: 'tool', callId, toolName: 'bash', text })
      log({ step, kind: 'bash', command: action.command, reason: decision.reason, rule: decision.ruleId, saved: decision.savedTokens })
    }
    const compacted = await compact(context, { budgetTokens, keepRecent, store, summarize })
    if (compacted.compacted) {
      stats.compactions++
      context = compacted.context
      log({ step, kind: 'compaction', from: compacted.segmentTokens, to: compacted.checkpointTokens, references: compacted.checkpoint.references.length, mode: compacted.checkpoint.kind })
    }
  }
  return { final, context, trajectory, experience, stats, archive, store }
}
