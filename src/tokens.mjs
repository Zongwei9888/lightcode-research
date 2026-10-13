/**
 * Token estimate T^ used for admission and replay savings: the fixed-density
 * heuristic of the agent scaffold (DeepSeek Harness), one text block in a
 * tool-result message: ceil(chars / 4) + 4 (block framing) + 4 (role framing).
 */
export const CHARS_PER_TOKEN = 4
const BLOCK_OVERHEAD = 4
const ROLE_OVERHEAD = 4

export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD + ROLE_OVERHEAD
}

export const bytes = text => Buffer.byteLength(text, 'utf8')
