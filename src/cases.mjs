/** Replay evidence from a file: one JSON object `{ id, input }` per line (.jsonl, optionally gzipped). */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

export function loadCases(path) {
  const data = readFileSync(path)
  const text = String(path).endsWith('.gz') ? gunzipSync(data).toString('utf8') : data.toString('utf8')
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line))
}
