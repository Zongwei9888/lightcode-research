/**
 * Recoverable history compaction Psi (Section 3.3, Equation 4).
 *
 * When the context exceeds the budget tau, an older segment H is compacted and
 * the recent suffix is left unchanged:
 *   1. externalize: each observation in H whose stored content verifies
 *      against what the agent read is replaced in place by a reference with a
 *      short excerpt, giving the residual Q(H; R);
 *   2. summarize: a fixed summarizer G condenses only the residual;
 *   3. the checkpoint K = (G(Q(H; R)), A, R) replaces H, provided it is
 *      smaller than H; otherwise a standard summary of H is used instead.
 * A keeps the user's exact messages outside the summary. References carried
 * from earlier checkpoints are kept, and recall returns the content the agent
 * originally read (z_t, never the raw o_t).
 */
import { createHash } from 'node:crypto'
import { bytes, estimateTokens } from './tokens.mjs'

export const SUMMARY_INSTRUCTION = [
  'You are the context compressor for a coding agent.',
  'The conversation above is already residualized. Payloads marked',
  '[recoverable observation] were removed from this request and remain',
  'recoverable by observation_id. Do not invent elided file bodies, command',
  'logs, or test output.',
  '',
  'Write a bounded summary that preserves only what another model needs to continue:',
  '- the user\'s goals and later revisions (quote exact wording when it matters)',
  '- design choices and why alternatives were rejected',
  '- agreements not yet written into the repository',
  '- unfinished work, the current focus and the single next intended action',
  '',
  'Do not freeze git status, file contents, or test verdicts as durable facts.',
  'Do not list observation ids; the host appends the catalog.',
  'If a prior <compacted-summary> exists, merge still-true content and drop stale claims.',
  'Output only the summary text.',
].join('\n')

export const STANDARD_INSTRUCTION = 'Summarize the conversation above so that another model can continue the task: goals, decisions, files, errors and fixes, and the next step. Output only the summary.'

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex')
export const messageTokens = message => estimateTokens(message.text)
export const contextTokens = context => context.reduce((sum, message) => sum + messageTokens(message), 0)

/** The reference store: what the agent read for each observation, keyed by observation id. */
export class ReferenceStore {
  #entries = new Map()

  /** Called at admission with z_t, the text that enters the context. */
  put(id, text, toolName) {
    this.#entries.set(id, { text, toolName, sha256: sha256(text), bytes: bytes(text) })
  }

  /** Stored content matches what the agent read. */
  verifies(message) {
    const entry = this.#entries.get(message.id)
    return entry !== undefined && entry.sha256 === sha256(message.text)
  }

  get(id) { return this.#entries.get(id) }
}

/** First two and last two non-empty lines, at most `maxBytes`. */
export function boundedDigest(text, maxBytes = 320) {
  const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
  const picked = [...lines.slice(0, 2), ...lines.slice(-2)]
  const unique = picked.filter((line, i) => picked.indexOf(line) === i).join('\n')
  if (bytes(unique) <= maxBytes) return unique
  const half = Math.floor((maxBytes - 3) / 2)
  const points = [...unique]
  return `${fit(points, half).join('')}...${fit(points.toReversed(), half).toReversed().join('')}`
}

/** The longest prefix of `points` within `maxBytes`. */
function fit(points, maxBytes) {
  const out = []
  let size = 0
  for (const point of points) { size += bytes(point); if (size > maxBytes) break; out.push(point) }
  return out
}

function referenceMarker(id, message, digest) {
  return ['[recoverable observation]', `observation_id: ${id}`, `tool: ${message.toolName ?? 'tool'}`,
    `source_bytes: ${bytes(message.text)}`, digest ? `excerpt:\n${digest}` : ''].filter(Boolean).join('\n')
}

const CATALOG_OPEN = '<lightcode-observation-catalog>'
const CATALOG_CLOSE = '</lightcode-observation-catalog>'
const CONTRACT_HEADING = '[exact user messages]'

function renderCheckpoint(summary, contract, references) {
  return [
    `<compacted-summary>\n${summary.trim()}\n</compacted-summary>`,
    contract.length ? `${CONTRACT_HEADING}\n${contract.map(text => `- ${JSON.stringify(text)}`).join('\n')}` : '',
    references.length ? [CATALOG_OPEN,
      ...references.map(ref => `observation_id: ${ref.id} | tool: ${ref.toolName ?? 'tool'} | bytes: ${ref.bytes}${ref.digest ? ` | excerpt: ${JSON.stringify(ref.digest)}` : ''}`),
      CATALOG_CLOSE, 'Use the recall tool with an observation_id (and a query for large observations) to read one again.'].join('\n') : '',
  ].filter(Boolean).join('\n\n')
}

/**
 * Psi. `summarize(messages, instruction)` is the fixed summarizer G.
 * Returns the new context and the checkpoint, or the context unchanged if it fits the budget.
 */
export async function compact(context, { budgetTokens, keepRecent = 4, store, summarize, digestMaxBytes = 320,
  minimumSavedTokens = 1, maxReferences = 64 }) {
  if (contextTokens(context) <= budgetTokens || context.length <= keepRecent) return { context, compacted: false }
  // Never split an action from its observation: the recent suffix starts at a non-tool message.
  let cut = context.length - keepRecent
  while (cut > 0 && context[cut].role === 'tool') cut--
  if (cut <= 0) return { context, compacted: false }
  const segment = context.slice(0, cut), recent = context.slice(cut)

  const prior = segment[0]?.checkpoint
  const references = [...prior?.references ?? []]
  const contract = [...prior?.contract ?? []]
  const residual = []
  for (const message of segment) {
    if (message.checkpoint) { residual.push({ ...message, text: `<compacted-summary>\n${message.checkpoint.summary}\n</compacted-summary>` }); continue }
    if (message.role === 'user') contract.push(message.text)
    if (message.role === 'tool' && store.verifies(message) && references.length < maxReferences) {
      const digest = boundedDigest(message.text, digestMaxBytes)
      const marker = referenceMarker(message.id, message, digest)
      if (bytes(marker) < bytes(message.text) && estimateTokens(message.text) - estimateTokens(marker) >= minimumSavedTokens) {
        residual.push({ ...message, text: marker })
        references.push({ id: message.id, toolName: message.toolName, bytes: bytes(message.text), digest })
        continue
      }
    }
    residual.push(message)
  }

  const summary = await summarize(residual, SUMMARY_INSTRUCTION)
  let checkpoint = { summary, contract, references, kind: 'lightcode' }
  let text = renderCheckpoint(summary, contract, references)
  if (estimateTokens(text) >= contextTokens(segment)) {
    // Fallback: a standard summary of the whole segment, without references.
    const standard = await summarize(segment, STANDARD_INSTRUCTION)
    checkpoint = { summary: standard, contract: [], references: [], kind: 'standard', reason: 'checkpoint-not-smaller' }
    text = `<compacted-summary>\n${standard.trim()}\n</compacted-summary>`
  }
  const message = { id: `checkpoint-${Date.now().toString(36)}`, role: 'user', text, checkpoint }
  return { context: [message, ...recent], compacted: true, checkpoint, segmentTokens: contextTokens(segment), checkpointTokens: estimateTokens(text) }
}

/** Observation ids the current context can recall: those in its latest checkpoint's catalog. */
export function reachableReferences(context) {
  return context.find(message => message.checkpoint)?.checkpoint.references.map(ref => ref.id) ?? []
}

/**
 * The recall tool. Returns the stored observation exactly as the agent read
 * it; one above `windowBytes` needs a query and returns a bounded window of
 * lines around its first literal match.
 */
export function recall(store, context, { observation_id: id, query }, { windowBytes = 8192 } = {}) {
  if (!reachableReferences(context).includes(id)) return { error: `unknown observation_id ${id}` }
  const entry = store.get(id)
  if (!entry) return { error: `observation ${id} is no longer stored` }
  if (entry.bytes <= windowBytes) return { observation_id: id, text: entry.text, complete: true }
  if (!query) return { error: `observation ${id} has ${entry.bytes} bytes; pass a query (an exact symbol, path or diagnostic)` }
  const lines = entry.text.split('\n')
  const hit = lines.findIndex(line => line.includes(query))
  if (hit < 0) return { error: `query not found in ${id}` }
  // Grow the window around the match one line at a time, alternating sides, within windowBytes.
  let start = hit, end = hit + 1, size = bytes(lines[hit])
  for (let grew = true; grew;) {
    grew = false
    if (start > 0 && size + bytes(lines[start - 1]) + 1 <= windowBytes) { start--; size += bytes(lines[start]) + 1; grew = true }
    if (end < lines.length && size + bytes(lines[end]) + 1 <= windowBytes) { size += bytes(lines[end]) + 1; end++; grew = true }
  }
  return { observation_id: id, text: lines.slice(start, end).join('\n'), complete: false, lines: [start + 1, end], totalLines: lines.length }
}

/** A deterministic stand-in for G, for offline demos: keeps the agent's own messages in order. */
export async function extractiveSummarizer(messages) {
  const lines = []
  for (const message of messages) {
    if (message.role === 'user' && message.text.startsWith('<compacted-summary>')) {
      lines.push(...message.text.replace(/<\/?compacted-summary>/g, '').trim().split('\n'))
    } else if (message.role === 'user') lines.push(`- User asked: ${firstLine(message.text)}`)
    else if (message.role === 'assistant' && message.text.trim()) lines.push(`- Agent: ${firstLine(message.text)}`)
  }
  return lines.join('\n')
}

const firstLine = text => text.trim().split('\n')[0].slice(0, 200)
