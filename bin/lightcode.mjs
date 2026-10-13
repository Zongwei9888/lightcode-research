#!/usr/bin/env node
/**
 * lightcode project --rules DIR --command CMD [--exit-code N] < output
 * lightcode replay  --rules DIR --cases FILE.jsonl[.gz]
 * lightcode check   --parent DIR --candidate DIR --cases FILE.jsonl[.gz]
 * lightcode check   --workspace DIR          (the learner's checker)
 * lightcode build   DIR
 * lightcode hash    DIR
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { admit, buildRuleDirectory, check, defaultContracts, loadCases, loadPolicy, readRuleFiles, replay, shellInput } from '../src/index.mjs'
import { checkerFile } from '../src/evolution.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  rules: { type: 'string' }, command: { type: 'string' }, 'exit-code': { type: 'string' },
  cases: { type: 'string' }, parent: { type: 'string' }, candidate: { type: 'string' }, workspace: { type: 'string' },
} })
const [action, target] = positionals
const cases = () => {
  if (!values.cases) throw new Error('pass replay evidence with --cases FILE.jsonl (one {"id", "input"} object per line)')
  return loadCases(values.cases)
}
const print = value => process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`)

switch (action) {
  case 'project': {
    const policy = await loadPolicy(values.rules ?? 'rules/initial')
    const input = shellInput({ command: values.command ?? '', output: readFileSync(0, 'utf8'), exitCode: Number(values['exit-code'] ?? 0) })
    const { delivered, decision } = admit(policy, input)
    process.stdout.write(delivered)
    process.stderr.write(`\n[${decision.reason}${decision.ruleId ? ` by ${decision.ruleId}` : ''}: ${decision.rawTokens} -> ${decision.rawTokens - decision.savedTokens} tokens]\n`)
    break
  }
  case 'replay': {
    const policy = await loadPolicy(values.rules ?? 'rules/initial')
    const evidence = cases()
    const rows = replay(policy, evidence)
    const rawTokens = evidence.reduce((sum, item) => sum + Math.ceil(item.input.raw.length / 4) + 8, 0)
    const saved = rows.reduce((sum, row) => sum + row.saving, 0)
    const byRule = {}
    for (const row of rows) if (row.saving > 0) byRule[row.ruleId] = (byRule[row.ruleId] ?? 0) + row.saving
    print({ policy: policy.hash, rules: policy.rules.length, observations: rows.length,
      compressed: rows.filter(row => row.saving > 0).length, rawTokens, savedTokens: saved,
      topRules: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 10) })
    break
  }
  case 'check': {
    let parentDirectory = values.parent, candidateDirectory = values.candidate, replayCases
    if (values.workspace) {
      const checker = JSON.parse(readFileSync(checkerFile(values.workspace), 'utf8'))
      parentDirectory = checker.parentDirectory
      candidateDirectory = join(values.workspace, 'rules-work')
      replayCases = checker.cases
    }
    if (!parentDirectory || !candidateDirectory) throw new Error('check needs --parent and --candidate, or --workspace')
    const report = await check({ parentDirectory, candidateDirectory, cases: replayCases ?? cases(), contracts: defaultContracts() })
    const { comparisons, ...summary } = report
    print({ ...summary, improved: comparisons.filter(row => row.delta > 0).length })
    process.exitCode = report.accepted ? 0 : 1
    break
  }
  case 'build': print(await buildRuleDirectory(target)); break
  case 'hash': print((await readRuleFiles(target)).hash); break
  default:
    print(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''))
    process.exitCode = action === undefined ? 0 : 2
}
