// One evolution step, pi_{k+1} = Verify(Propose(pi_k, E_k)), with three scripted
// learner proposals in place of the coding-agent learner (see 05 for a live one):
//   (a) a justified new rule              -> accepted
//   (b) a rule that drops required content -> rejected by a preservation requirement
//   (c) a rule that shadows a better one   -> rejected for a replay regression
// The replay evidence D_k is the current task's observations plus (synthetic)
// observations of earlier learning tasks.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { admit, defaultContracts, evolve, loadPolicy, shellInput } from '../src/index.mjs'

const parentDirectory = new URL('../rules/initial', import.meta.url).pathname
const root = await mkdtemp(join(tmpdir(), 'lightcode-evolve-'))
const parent = await loadPolicy(parentDirectory)

// E_k: task x_k ran pytest with -rsx several times; the initial policy passes these unchanged.
const run = n => `${'.'.repeat(40 + n)}${'s'.repeat(3)}${'.'.repeat(30)} [100%]\n=========================== short test summary info ============================\nSKIPPED [3] tests/test_io.py:${10 + n}: requires network\n${70 + n} passed, 3 skipped in ${n}.21s\n`
const experience = [1, 2, 3].map(n => {
  const input = shellInput({ command: `pytest -rsx -q tests/ -k io_${n}`, output: run(n) })
  const { delivered, decision } = admit(parent, input)
  return { id: `task-k:${n}`, input, raw: input.raw, delivered, decision }
})
// Observations of earlier tasks: directory listings and searches.
const listing = n => 'total 120\ndrwxr-xr-x  2 root root  4096 Sep 16 23:50 .\ndrwxr-xr-x 12 root root  4096 Sep 16 23:50 ..\n'
  + Array.from({ length: 20 + n }, (_, i) => `-rw-r--r--  1 root root  ${1000 + i * 37} Sep 16 23:50 module_${i}.py`).join('\n') + '\n'
const regressionCases = [
  ...[0, 5, 10, 15].map(n => ({ id: `task-${n}:ls`, input: shellInput({ command: `ls -la src/pkg${n}`, output: listing(n) }) })),
  ...[1, 2].map(n => ({ id: `task-${n}:grep`, input: shellInput({ command: `grep -rn compute src`,
    output: Array.from({ length: 30 }, (_, i) => `src/app/module_${i % 4}.py:${10 + i}:    value = compute_${i}(x)`).join('\n') + '\n' }) })),
]
console.log(`parent ${parent.hash.slice(0, 12)} (${parent.rules.length} rules); E_k: ${experience.length} observations, ` +
  `${experience.filter(e => e.decision.reason === 'would-project').length} compressed; D_k: ${experience.length + regressionCases.length} observations`)

/** Add a rule: its source and the built module are the same JavaScript here. */
async function addRule(rulesWork, { id, code, first = false, transformation }) {
  for (const dir of ['src', 'lib']) await writeFile(join(rulesWork, dir, 'entries', `${id}.js`), code)
  const index = JSON.parse(await readFile(join(rulesWork, 'index.json'), 'utf8'))
  const rule = { id, entry: `lib/entries/${id}.js`, transformation }
  index.rules = first ? [rule, ...index.rules] : [...index.rules, rule]
  await writeFile(join(rulesWork, 'index.json'), JSON.stringify(index, null, 2) + '\n')
}

// Progress lines are removable only when the report cannot contain captured output.
const progressRule = careful => `import { ProjectionBuilder, sourceLines } from '../projection-map.js';
export function project(input) {
  if (input.kind !== 'shell' || !/\\bpytest\\b/.test(input.command ?? '')) return null;
  ${careful ? "if (/(^|\\s)(-s|--capture=no|-r\\S*[PpA])(\\s|$)/.test(input.command) || input.command.includes('|')) return null;" : ''}
  const lines = sourceLines(input.raw);
  const progress = line => /^[.sxFEX]+(\\s+\\[\\s*\\d+%\\])?$/.test(line.text);
  if (!lines.some(progress)) return null;
  const builder = new ProjectionBuilder(input.raw);
  for (const line of lines) if (!progress(line)) builder.keep(line.start, line.end);
  return builder.finish();
}
`
const proposals = {
  '(a) remove pytest progress lines when no captured output can be printed': rulesWork =>
    addRule(rulesWork, { id: 'pytest-progress', code: progressRule(true), transformation: 'noise-removal' }),
  '(b) remove every line of dots in pytest output': rulesWork =>
    addRule(rulesWork, { id: 'pytest-progress', code: progressRule(false), transformation: 'noise-removal' }),
  '(c) a generic ls rule placed before the existing one': rulesWork =>
    addRule(rulesWork, { id: 'ls-trim', first: true, transformation: 'noise-removal', code: `import { ProjectionBuilder, sourceLines } from '../projection-map.js';
export function project(input) {
  if (input.kind !== 'shell' || !/^(cd \\S+ && )?ls\\b/.test(input.command ?? '')) return null;
  const builder = new ProjectionBuilder(input.raw);
  for (const line of sourceLines(input.raw)) builder.keep(line.start, line.start + line.text.trimEnd().length + (line.end > line.start + line.text.length ? 1 : 0));
  return builder.finish();
}
` }),
}

let i = 0
for (const [name, propose] of Object.entries(proposals)) {
  const { adopted, report } = await evolve({ parentDirectory, workspace: join(root, `step-${++i}`), versions: join(root, 'versions'),
    task: 'Fix the IO tests.', experience, regressionCases, contracts: defaultContracts(),
    propose: ({ rulesWork }) => propose(rulesWork) })
  console.log(`\n${name}`)
  console.log(`  ${report.accepted ? 'ACCEPTED' : 'REJECTED'}: gain ${report.gainTokens} tokens, ${report.regressions.length} regressions, ` +
    `${report.failures.length} violated requirements${report.reasons.length ? `; reasons: ${report.reasons.join(', ')}` : ''}`)
  if (report.failures.length) console.log(`  violated: ${report.failures.map(f => f.id).join(', ')}`)
  if (report.regressions.length) console.log(`  e.g. ${report.regressions[0].id}: saving ${report.regressions[0].parentSaving} -> ${report.regressions[0].saving}`)
  console.log(`  pi_{k+1} = ${adopted === parentDirectory ? 'pi_k (unchanged)' : `${report.candidateHash.slice(0, 12)} (new version)`}`)
}
