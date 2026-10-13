/**
 * Build a rule directory: transpile `src/**` (TypeScript or JavaScript) into
 * `lib/**`, refusing non-local imports, so the policy stays a self-contained
 * program. Requires the `typescript` package (a dev dependency).
 */
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { parseIndex } from './policy.mjs'

export async function buildRuleDirectory(directory) {
  let ts
  try { ts = (await import('typescript')).default } catch {
    throw new Error('building rules needs the typescript package: run `npm install` first')
  }
  const index = parseIndex(JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')))
  const sources = []
  async function walk(path) {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error('rule symlink rejected')
    if (info.isDirectory()) for (const name of await readdir(path)) await walk(join(path, name))
    else if (/\.(ts|js)$/.test(path)) sources.push(path)
    else throw new Error(`unsupported rule source file: ${path}`)
  }
  await walk(join(directory, 'src'))
  const outputs = new Map()
  for (const path of sources) {
    const result = ts.transpileModule(await readFile(path, 'utf8'), { fileName: path, reportDiagnostics: true, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true,
    } })
    const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? []
    if (errors.length) throw new Error(ts.formatDiagnostics(errors, { getCurrentDirectory: () => directory, getCanonicalFileName: x => x, getNewLine: () => '\n' }))
    outputs.set(relative(join(directory, 'src'), path).replace(/\.ts$/, '.js'), result.outputText)
  }
  for (const [name, source] of outputs) {
    for (const { fileName: specifier } of ts.preProcessFile(source).importedFiles) {
      const target = relative('/rules/lib', resolve('/rules/lib', dirname(name), specifier))
      if (!specifier.startsWith('.') || target.startsWith('..') || !outputs.has(target)) {
        throw new Error(`nonlocal or missing rule dependency: ${name} -> ${specifier}`)
      }
    }
  }
  for (const rule of index.rules) if (!outputs.has(rule.entry.replace(/^lib\//, ''))) throw new Error(`missing source for ${rule.entry}`)
  await rm(join(directory, 'lib'), { recursive: true, force: true })
  for (const [name, content] of outputs) {
    await mkdir(dirname(join(directory, 'lib', name)), { recursive: true })
    await writeFile(join(directory, 'lib', name), content)
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n')
  return { rules: index.rules.length, files: outputs.size }
}
