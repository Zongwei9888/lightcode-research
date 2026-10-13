// Recoverable history compaction (Figure 4): externalize verified observations, then
// summarize only the residual; the agent later recalls an exact error message that
// the summary does not contain. Offline: a scripted agent, recorded tool outputs and a
// deterministic summarizer stand in for the model (06 runs a live one).
import { extractiveSummarizer, loadPolicy, runTask } from '../src/index.mjs'

const policy = await loadPolicy(new URL('../rules/initial', import.meta.url).pathname)
const testLog = [
  '============================= test session starts ==============================',
  'collected 48 items', '',
  ...Array.from({ length: 40 }, (_, i) => `tests/test_config.py::test_case_${i} PASSED`),
  'tests/test_config.py::test_load_defaults FAILED', '',
  '=================================== FAILURES ===================================',
  '______________________________ test_load_defaults ______________________________',
  '    def test_load_defaults():', '>       cfg = parse_config({})', '',
  'src/app/config.py:41: in parse_config', "    backoff = raw['retry_backoff']",
  "E   KeyError: 'retry_backoff'", '',
  '=========================== short test summary info ============================',
  "FAILED tests/test_config.py::test_load_defaults - KeyError: 'retry_backoff'",
  '========================= 1 failed, 47 passed in 0.84s =========================', '',
].join('\n')
const source = Array.from({ length: 60 }, (_, i) => i === 40 ? "    backoff = raw['retry_backoff']" : `    line_${i} = settings.get('option_${i}', DEFAULT_${i})`).join('\n') + '\n'
const outputs = {
  'pytest -v tests/test_config.py': testLog,
  "sed -n '1,60p' src/app/config.py": source,
  'grep -rn retry_backoff src tests docs': Array.from({ length: 30 }, (_, i) => `docs/settings/page_${i}.md:${10 + i}: retry_backoff controls the delay between retries (${i})`).join('\n') + '\n',
  'git log --oneline -5': 'a1b2c3d Rename retry settings\nb2c3d4e Add backoff\nc3d4e5f Initial commit\n',
}
const script = [
  { type: 'bash', command: 'pytest -v tests/test_config.py', thought: 'Run the failing tests first.' },
  { type: 'bash', command: "sed -n '1,60p' src/app/config.py", thought: 'Read parse_config.' },
  { type: 'bash', command: 'grep -rn retry_backoff src tests docs', thought: 'Where else is retry_backoff used?' },
  { type: 'bash', command: 'git log --oneline -5', thought: 'Check recent changes; the key was probably renamed.' },
]
let step = 0
const model = async (context, { canRecall }) => {
  if (step < script.length) return script[step++]
  if (step++ === script.length && canRecall) {
    // The summary keeps what was done, not the payloads; fetch the exact diagnostic.
    const catalog = context[0].checkpoint.references
    const log = catalog.find(ref => ref.digest.includes('test session starts'))
    return { type: 'recall', observation_id: log.id, query: 'KeyError', thought: 'What exactly failed?' }
  }
  return { type: 'final', text: 'Done.' }
}
const result = await runTask({
  task: "test_load_defaults fails with a KeyError in parse_config. Fix it without changing the public API.",
  model, exec: async command => ({ output: outputs[command], exitCode: 0 }), policy,
  budgetTokens: 900, keepRecent: 2, summarize: extractiveSummarizer,
  log: event => console.log(JSON.stringify(event)),
})
const checkpoint = result.context.find(message => message.checkpoint)
console.log(`\n--- checkpoint K that replaced the older segment (${checkpoint.checkpoint.kind})\n${checkpoint.text}`)
console.log(`\n--- the summary alone contains the exact error: ${checkpoint.checkpoint.summary.includes("KeyError: 'retry_backoff'")}`)
const recalled = result.context.find(message => message.toolName === 'recall')
console.log(`--- recalled (exactly what the agent read when it ran pytest):\n${recalled.text}`)
console.log(`\n${JSON.stringify(result.stats)}`)
