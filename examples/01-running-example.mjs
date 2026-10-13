// Figure 3 of the paper: two pytest observations end in the same line of dots.
// In A the dots are progress and can go; in B they may be application output and must stay.
// The initial policy keeps both. A revision that parses the command removes the dots in A
// only; a careless one removes them in B as well and violates a preservation requirement.
import { admit, checkContracts, defaultContracts, loadPolicy, shellInput } from '../src/index.mjs'

const initial = await loadPolicy(new URL('../rules/initial', import.meta.url).pathname)
const progress = line => /^[.sxFEX]+(\s+\[\s*\d+%\])?$/.test(line)
/** Remove pytest progress lines; if `careful`, only when the report cannot print captured output. */
const revision = careful => ({
  hash: careful ? 'careful' : 'careless',
  project(input) {
    const command = input.command ?? ''
    const unsafe = /(^|\s)(-s|--capture=no|-r\S*[PpA])(\s|$)/.test(command)
    if (/\bpytest\b/.test(command) && !(careful && unsafe) && input.raw.split('\n').some(progress)) {
      return { text: input.raw.split('\n').filter(line => !progress(line)).join('\n'), ruleId: 'pytest-progress', transformation: 'noise-removal' }
    }
    return initial.project(input)
  },
})
const dots = '.'.repeat(60)
const observations = {
  'A. removable progress': shellInput({ command: 'pytest -rsx -q tests/test_cli.py | tail -2', output: `${dots} [100%]\n1 passed in 0.03s\n` }),
  'B. possible application output': shellInput({ command: 'pytest -rP -q tests/test_cli.py | tail -2', output: `${dots}\n1 passed in 0.03s\n` }),
}
for (const [name, policy] of [['initial policy', initial], ['careful revision', revision(true)], ['careless revision', revision(false)]]) {
  console.log(`=== ${name}: P(pi) = ${checkContracts(policy, defaultContracts()).passed}`)
  for (const [case_, input] of Object.entries(observations)) {
    const { delivered, decision } = admit(policy, input)
    console.log(`--- ${case_}: $ ${input.command}\n${delivered}  (${decision.reason}${decision.ruleId ? `, rule ${decision.ruleId}` : ''})`)
  }
}
const failed = checkContracts(revision(false), defaultContracts()).results.filter(row => !row.passed).map(row => row.id)
console.log(`\nthe careless revision violates: ${failed.join(', ')}`)
