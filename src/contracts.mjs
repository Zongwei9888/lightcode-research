/**
 * Preservation requirements P (Section 3.4, Appendix A.3): each one is an input
 * observation and content that any policy must keep when processing it. A
 * policy meets a requirement if its output contains every required fragment
 * or if it abstains. This is the set used in the experiments.
 */
import { readFileSync } from 'node:fs'
import { shellInput } from './admission.mjs'

export function defaultContracts() {
  const cases = JSON.parse(readFileSync(new URL('./contract-fixture.json', import.meta.url), 'utf8'))
  const add = (id, command, raw, requiredFragments, extra = {}) =>
    cases.push({ id, input: { ...shellInput({ command, output: raw }), ...extra }, requiredFragments })

  // A source dump must not treat blank or repeated lines inside literals as disposable layout.
  for (const [id, command, raw] of [
    ['native-cat-string-blanks', 'cat module.py', 'payload = """first\n' + '\n'.repeat(128) + 'last"""\nprint(payload)\n'],
    ['native-sed-partial-string-repeats', "sed -n '20,90p' module.py",
      'def embedded_example():\n' + '    important literal payload, not executable source\n'.repeat(10)
        + '\n'.repeat(128) + '"""\nprint(payload)\n'],
    ['native-cat-template-string', 'cat module.js', 'const data = `first\n' + '\n'.repeat(128)
      + 'important literal payload, not executable source\n'.repeat(10) + 'last`;\nconsole.log(data);\n'],
  ]) add(id, command, raw, [raw])

  // Progress-looking text can be application stdout (Figure 3, case B): a tail
  // window may have cut the capture header, and -s / --capture=no expose stdout.
  const printedDots = '.'.repeat(100) + '\n'
  add('pytest-ansi-failure', 'pytest -q tests/test_cli.py 2>&1 | tail -10',
    '\u001b[31mF [100%]\u001b[0m\n\u001b[31mE AssertionError: expected=42 actual=0\u001b[0m\n1 failed in 0.03s\n',
    ['AssertionError: expected=42 actual=0', '1 failed in 0.03s'])
  add('pytest-ansi-captured-stdout', 'pytest -rP -q tests/test_cli.py | tail -3',
    '\u001b[32m' + printedDots.trimEnd() + '\u001b[0m\nimportant application output\n1 passed in 0.03s\n',
    [printedDots.trimEnd(), 'important application output', '1 passed in 0.03s'])
  for (const [id, command, prefix] of [
    ['pytest-window-captured-stdout', 'pytest -rP -q tests/test_cli.py | tail -10',
      '==================== PASSES ====================\n---------------- Captured stdout call ----------------\n'],
    ['pytest-window-cut-capture-header', 'pytest -rP -q tests/test_cli.py | tail -2', ''],
    ['pytest-window-uncaptured-stdout', 'python -m pytest -s -q tests/test_cli.py 2>&1 | tail -10', ''],
    ['pytest-window-capture-no', 'pytest --capture=no -q tests/test_cli.py | head -10', ''],
  ]) add(id, command, prefix + printedDots + '1 passed in 0.03s\n', [printedDots, '1 passed in 0.03s'])

  // Deduplicating diagnostics must keep every unique diagnostic.
  const diagnostic = 'Font warning: cache unavailable\n'
  add('stderr-dedup-preserves-unique-diagnostics', 'python render.py', 'unique before\n' + diagnostic.repeat(5) + 'unique after\n',
    ['unique before\n', diagnostic, 'unique after\n'], { stream: 'stderr' })

  // Partial source windows: a comment-looking line is no evidence of lexical state.
  const terminal = (command, body) => `(testbed) root@abc:/testbed# ${command}\n${body}(testbed) root@abc:/testbed#\n[exit code: 0]`
  for (const [id, file, body] of [
    ['python-partial-string', 'module.py', '# data in an already-open string\n'.repeat(5) + '\n\n"""\ndef get():\n    return 1\n'.repeat(4)],
    ['python-significant-blank-lines', 'module.py', 'payload = """first\n\n\n\nlast"""\n' + 'x = 1\n'.repeat(12)],
    ['javascript-template-string', 'module.js', 'const payload = `\n' + '// literal data\n'.repeat(5) + '\n\n`;\n' + 'console.log(payload);\n'.repeat(12)],
  ]) {
    const command = `sed -n '1,100p' ${file}`
    add(id, command, terminal(command, body), [body, '[exit code: 0]'], { toolName: 'evoagentbench' })
  }
  const body = 'def embedded_example():\n' + '    # literal line in an already-open string\n'.repeat(6)
    + '\n\n\n    return 1\n' + 'x = 1\n'.repeat(12)
  const command = "sed -n '20,60p' module.py"
  add('code-shaped-text-inside-open-string', command, terminal(command, body), [body, '[exit code: 0]'], { toolName: 'evoagentbench' })

  // Program output can itself contain prompt-looking text; it is not a terminal transcript.
  const transcript = cases[0].input
  for (const [id, extra] of [
    ['plain-bash-output-is-not-terminal-transport', { toolName: 'bash' }],
    ['stderr-is-not-terminal-command-echo', { stream: 'stderr' }],
  ]) cases.push({ id, input: { ...transcript, ...extra }, requiredFragments: [transcript.raw] })
  return cases
}

/** P(pi): run every requirement; the policy's rendering (or the raw input if it abstains) must keep each fragment. */
export function checkContracts(policy, contracts) {
  const results = contracts.map(item => {
    if (!item.requiredFragments.length || item.requiredFragments.some(fragment => !item.input.raw.includes(fragment))) {
      throw new Error(`requirement ${item.id}: every fragment must occur in its input`)
    }
    try {
      const delivered = policy.project(item.input)?.text ?? item.input.raw
      const missing = item.requiredFragments.filter(fragment => !delivered.includes(fragment))
      return { id: item.id, passed: missing.length === 0, missing }
    } catch (error) {
      return { id: item.id, passed: false, error: String(error) }
    }
  })
  return { passed: results.every(result => result.passed), results }
}
