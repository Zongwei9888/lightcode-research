import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { admit, checkContracts, compact, defaultContracts, estimateTokens, evolve, extractiveSummarizer,
  loadPolicy, recall, ReferenceStore, runTask, shellInput, verify } from '../src/index.mjs'

const rules = name => new URL(`../rules/${name}`, import.meta.url).pathname
const initial = await loadPolicy(rules('initial'))
const stub = (hash, project) => ({ hash, rules: [], project })

test('the initial policy loads with its content hash', () => {
  assert.equal(initial.hash, 'ddc7f0862b62b37510b2230e3b86f41d412d9755cc3bb76094af264829c8b251')
  assert.equal(initial.rules.length, 81)
})

test('admission delivers the raw observation unless the rendering is strictly smaller', () => {
  const input = shellInput({ command: 'ls -la src', output: 'total 120\n' + Array.from({ length: 30 }, (_, i) => `-rw-r--r--  1 root root  ${1000 + i} Sep 16 23:50 m${i}.py`).join('\n') + '\n' })
  const { delivered, decision } = admit(initial, input)
  assert.equal(decision.reason, 'would-project')
  assert.ok(delivered.length < input.raw.length && decision.savedTokens > 0)
  const unknown = shellInput({ command: 'my-tool', output: 'x'.repeat(500) })
  assert.equal(admit(initial, unknown).delivered, unknown.raw)
  const same = stub('same', i => ({ text: i.raw, ruleId: 'same' }))
  assert.equal(admit(same, input).decision.reason, 'non-growth-rejected')
  const broken = stub('broken', () => { throw new Error('boom') })
  assert.deepEqual([admit(broken, input).delivered, admit(broken, input).decision.reason], [input.raw, 'filter-error'])
  assert.equal(estimateTokens('abcd'), 9)
})

test('the initial policy meets every preservation requirement', () => {
  assert.equal(checkContracts(initial, defaultContracts()).passed, true)
})

test('verification follows the acceptance rule', () => {
  const cases = [{ id: 'a', input: shellInput({ command: 'x', output: 'x'.repeat(400) }) }, { id: 'b', input: shellInput({ command: 'y', output: 'y'.repeat(400) }) }]
  const contracts = [{ id: 'keep-z', input: shellInput({ command: 'z', output: 'zzzz important' }), requiredFragments: ['important'] }]
  const shorten = commands => i => commands.includes(i.command) ? { text: i.raw.slice(0, 40), ruleId: 'cut' } : undefined
  const parent = stub('p', shorten(['x']))
  assert.equal(verify({ parent, candidate: stub('c1', shorten(['x', 'y'])), cases, contracts }).accepted, true)
  assert.deepEqual(verify({ parent, candidate: stub('c2', shorten(['y'])), cases, contracts }).reasons, ['no-incremental-token-gain', 'replay-token-regression'])
  const lossy = stub('c3', i => i.command === 'z' ? { text: 'zzzz' } : shorten(['x', 'y'])(i))
  assert.deepEqual(verify({ parent, candidate: lossy, cases, contracts }).reasons, ['preservation-requirement-failed'])
  assert.deepEqual(verify({ parent, candidate: stub('p', parent.project), cases, contracts }).reasons, ['unchanged', 'no-incremental-token-gain'])
  // Repair: a parent violating a requirement is replaced by a feasible candidate even with a lower saving.
  const repair = verify({ parent: lossy, candidate: stub('c4', shorten(['x'])), cases, contracts })
  assert.equal(repair.accepted, true)
  assert.equal(repair.changeKind, 'safety-repair')
})

test('an evolution step adopts only a verified candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lightcode-test-'))
  const experience = [{ id: 'e1', input: shellInput({ command: 'ls', output: 'a\n' }), decision: { reason: 'no-filter-match', savedTokens: 0, rawTokens: 9 } }]
  const result = await evolve({ parentDirectory: rules('initial'), workspace: join(root, 'w'), versions: join(root, 'v'),
    task: 't', experience, contracts: defaultContracts(), propose: async () => {} })
  assert.equal(result.report.accepted, false)
  assert.equal(result.adopted, rules('initial'))
})

test('compaction externalizes verified observations, keeps user messages exact, and recall returns what the agent read', async () => {
  const store = new ReferenceStore()
  const big = Array.from({ length: 200 }, (_, i) => `line ${i}: value`).join('\n') + '\nE   KeyError: \'retry_backoff\''
  store.put('o1', big, 'bash')
  const context = [
    { id: 'u', role: 'user', text: 'Fix the KeyError. Do not change the API.' },
    { id: 'a1', role: 'assistant', text: 'run tests', toolCall: { id: 'c1', name: 'bash', args: {} } },
    { id: 'o1', role: 'tool', callId: 'c1', toolName: 'bash', text: big },
    { id: 'o2', role: 'tool', callId: 'c1', toolName: 'bash', text: 'unverified '.repeat(100) },
    { id: 'a2', role: 'assistant', text: 'next' }, { id: 'a3', role: 'assistant', text: 'more' },
  ]
  const result = await compact(context, { budgetTokens: 100, keepRecent: 2, store, summarize: extractiveSummarizer })
  assert.equal(result.compacted, true)
  assert.deepEqual(result.checkpoint.references.map(r => r.id), ['o1'])
  assert.deepEqual(result.checkpoint.contract, ['Fix the KeyError. Do not change the API.'])
  assert.ok(result.checkpointTokens < result.segmentTokens)
  assert.equal(recall(store, result.context, { observation_id: 'o1' }).text, big)
  assert.match(recall(store, result.context, { observation_id: 'o1' }, { windowBytes: 200 }).error, /pass a query/)
  const window = recall(store, result.context, { observation_id: 'o1', query: 'KeyError' }, { windowBytes: 200 })
  assert.ok(window.text.includes("KeyError: 'retry_backoff'") && Buffer.byteLength(window.text) <= 200)
  assert.match(recall(store, result.context, { observation_id: 'o2' }).error, /unknown/)
  // A tampered observation is not verified, so it is not externalized.
  const tampered = [...context.slice(0, 2), { ...context[2], text: `${big}x` }, ...context.slice(3)]
  assert.equal((await compact(tampered, { budgetTokens: 100, keepRecent: 2, store, summarize: extractiveSummarizer })).checkpoint.references.length, 0)
})

test('the task loop archives raw observations and recalls evicted evidence', async () => {
  const output = Array.from({ length: 80 }, (_, i) => `src/m${i}.py:${i + 1}: retry_backoff = 1.5`).join('\n') + '\n'
  let step = 0
  const model = async (context, { canRecall }) => {
    step++
    if (step <= 3) return { type: 'bash', command: `grep -rn retry_backoff src # ${step}` }
    if (step === 4 && canRecall) return { type: 'recall', observation_id: context[0].checkpoint.references[0].id, query: 'm40.py' }
    return { type: 'final', text: 'done' }
  }
  const result = await runTask({ task: 'find retry_backoff', model, exec: async () => ({ output, exitCode: 0 }), policy: initial,
    budgetTokens: 600, keepRecent: 2, summarize: extractiveSummarizer })
  assert.equal(result.final, 'done')
  assert.equal(result.archive.records.length, 3)
  assert.ok(result.archive.records.every(record => record.raw === output))
  assert.ok(result.stats.compactions >= 1 && result.stats.recalls === 1)
  const recalled = result.context.find(message => message.toolName === 'recall')
  assert.equal(recalled.text, result.archive.records[0].delivered)
})
