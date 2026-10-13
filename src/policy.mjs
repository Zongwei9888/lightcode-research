/**
 * The observation-compression policy pi as a program (Section 3.2).
 *
 * A policy is a rule directory: `index.json` lists rules in order, and each
 * rule's entry module exports `project(input)`. A rule that recognizes the
 * observation (kappa) parses it (phi_c) and returns the compact rendering
 * (T_c) as `{ text, sourceMap }`; otherwise it returns null. The first rule
 * that returns a rendering wins; if none does, pi(o, m) is undefined (bottom).
 */
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TRANSFORMATIONS = ['noise-removal', 'preview', 'lossless-formatting', 'diagnostic-deduplication']
const RULE_ID = /^[a-z0-9][a-z0-9/_.-]{0,127}$/
const RULE_ENTRY = /^lib\/[a-zA-Z0-9_/-]+\.js$/

/** Read every file of a rule directory, in a fixed order, without following links. */
export async function readRuleFiles(directory) {
  const files = new Map()
  async function visit(path, relative) {
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) throw new Error(`rule symlink rejected: ${relative}`)
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error(`nonportable rule path: ${relative}/${name}`)
        await visit(join(path, name), relative ? `${relative}/${name}` : name)
      }
    } else if (stat.isFile()) files.set(relative, await readFile(path))
    else throw new Error(`invalid rule file: ${relative}`)
  }
  await visit(directory, '')
  const index = parseIndex(JSON.parse(files.get('index.json')?.toString() ?? 'null'))
  for (const rule of index.rules) if (!files.has(rule.entry)) throw new Error(`missing rule entry: ${rule.entry}`)
  // The same content hash the experiments recorded for each policy version.
  const hash = createHash('sha256')
  for (const [name, data] of files) hash.update(JSON.stringify([name, data.length])).update('\0').update(data)
  return { files, index, hash: hash.digest('hex') }
}

export function parseIndex(index) {
  if (index?.schemaVersion !== 1 || !Array.isArray(index.rules) || index.rules.length > 1024) throw new Error('invalid rule index')
  const ids = new Set()
  for (const rule of index.rules) {
    if (!RULE_ID.test(rule?.id ?? '') || !RULE_ENTRY.test(rule.entry ?? '') || rule.entry.split('/').includes('..')
      || !TRANSFORMATIONS.includes(rule.transformation)) throw new Error(`invalid rule: ${JSON.stringify(rule)}`)
    if (ids.has(rule.id)) throw new Error(`duplicate rule ID: ${rule.id}`)
    ids.add(rule.id)
  }
  return index
}

/**
 * Load a frozen copy of a policy. Later edits to `directory` (for example by
 * the learner) do not change a loaded policy.
 *
 * The experiments ran rule code in a network-less, read-only container; this
 * demo runs it in-process, so only load rule directories you trust.
 */
export async function loadPolicy(directory) {
  const source = await readRuleFiles(directory)
  const root = await mkdtemp(join(tmpdir(), 'lightcode-policy-'))
  for (const [name, data] of source.files) {
    await mkdir(join(root, name, '..'), { recursive: true })
    await writeFile(join(root, name), data)
  }
  const rules = []
  for (const rule of source.index.rules) {
    const module = await import(pathToFileURL(join(root, rule.entry)).href)
    if (typeof module.project !== 'function') throw new Error(`rule ${rule.id} does not export project()`)
    rules.push({ ...rule, project: module.project })
  }
  return {
    hash: source.hash,
    rules: source.index.rules,
    directory,
    /** pi(o, m): the first rule's rendering, or undefined. Throws if a rule throws. */
    project(input) {
      for (const rule of rules) {
        const result = rule.project({ ...input, options: { ...input.options, ...rule.options } })
        if (result != null) {
          if (typeof result.text !== 'string') throw new Error(`rule ${rule.id} returned no text`)
          return { text: result.text, sourceMap: result.sourceMap, ruleId: rule.id, transformation: rule.transformation }
        }
      }
      return undefined
    },
  }
}
