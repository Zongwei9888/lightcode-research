// A live run of Algorithm 1 on one task: a real model (any OpenAI-compatible endpoint,
// DeepSeek by default) fixes a bug in a copy of examples/fixture-project through bash,
// with the initial admission policy (pass --rules for another), recoverable history compaction under a small budget,
// and recall. Afterwards the task's experience E_k is written as a learner workspace.
//
//   LIGHTCODE_API_KEY=... node examples/04-live-agent.mjs [--budget 6000]
//
// The model's commands run on your machine inside a temporary copy of the fixture project.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { llmConfig, llmModel, llmSummarizer, loadPolicy, prepareLearnerWorkspace, runTask } from '../src/index.mjs'

const { values } = parseArgs({ options: { budget: { type: 'string', default: '6000' }, rules: { type: 'string' } } })
const config = llmConfig()
if (!config) {
  console.error('Set LIGHTCODE_API_KEY (and optionally LIGHTCODE_BASE_URL, LIGHTCODE_MODEL) to run this example.')
  process.exit(2)
}
const root = mkdtempSync(join(tmpdir(), 'lightcode-live-'))
const repo = join(root, 'repo')
cpSync(new URL('./fixture-project', import.meta.url).pathname, repo, { recursive: true, filter: path => !path.includes('__pycache__') })
const rules = values.rules ?? new URL('../rules/initial', import.meta.url).pathname
const policy = await loadPolicy(rules)

const exec = async command => {
  const result = spawnSync('bash', ['-c', `{ ${command}\n} 2>&1`], { cwd: repo, encoding: 'utf8', timeout: 60_000, maxBuffer: 16 << 20 })
  return { output: (result.stdout ?? '') + (result.error ? `\n${result.error.message}` : ''), exitCode: result.status ?? 1 }
}
const task = 'The test suite of this Python repository fails (run it with `python3 -m unittest -v`). ' +
  'Find the cause and fix it in the library code without changing its public API or the tests, then confirm that all tests pass.'
console.log(`model ${config.model}; policy ${policy.hash.slice(0, 12)} (${policy.rules.length} rules); budget ${values.budget} tokens; repo ${repo}\n`)
const result = await runTask({ task, model: llmModel(config), exec, policy, budgetTokens: Number(values.budget), keepRecent: 4,
  summarize: llmSummarizer(config), maxSteps: 30,
  log: event => console.log(JSON.stringify(event).slice(0, 240)) })

console.log(`\nfinal answer: ${result.final ?? '(step limit reached)'}`)
const check = await exec('python3 -m unittest 2>&1 | tail -3')
console.log(`independent check of the repository:\n${check.output}`)
console.log(JSON.stringify(result.stats))

// E_k for the learner (Section 3.4): raw/delivered pairs with decisions, plus the trajectory.
const learner = await prepareLearnerWorkspace({ workspace: join(root, 'learner'), parentDirectory: rules, task,
  experience: result.experience, trajectory: result.trajectory })
console.log(`\nlearner workspace: ${learner.workspace}\n` +
  `Run a coding agent there with the instructions in PROMPT.md; the candidate in rules-work/ is then verified with\n` +
  `  node bin/lightcode.mjs check --parent ${rules} --candidate ${learner.rulesWork}`)
