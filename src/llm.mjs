/**
 * Optional live model: any OpenAI-compatible chat-completions endpoint with
 * tool calling (DeepSeek by default). Configure with environment variables:
 *   LIGHTCODE_API_KEY   (required)
 *   LIGHTCODE_BASE_URL  (default https://api.deepseek.com)
 *   LIGHTCODE_MODEL     (default deepseek-flash)
 */
const SYSTEM = 'You are a coding agent working in a repository through a bash tool. Investigate, edit files and run tests until the task is done, then reply with a short final report and no tool call.'

const TOOLS = {
  bash: { type: 'function', function: { name: 'bash', description: 'Run a bash command in the repository and return its output.',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  recall: { type: 'function', function: { name: 'recall',
    description: 'Read again an observation listed in the observation catalog, exactly as you first saw it. Large observations need a query: an exact symbol, path or diagnostic it contains.',
    parameters: { type: 'object', properties: { observation_id: { type: 'string' }, query: { type: 'string' } }, required: ['observation_id'] } } },
}

export function llmConfig(env = process.env) {
  if (!env.LIGHTCODE_API_KEY) return undefined
  return { apiKey: env.LIGHTCODE_API_KEY, baseUrl: (env.LIGHTCODE_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''), model: env.LIGHTCODE_MODEL ?? 'deepseek-flash' }
}

async function chat(config, body) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, ...body }) })
  if (!response.ok) throw new Error(`model request failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`)
  return (await response.json()).choices[0].message
}

/** Context messages of ./agent.mjs as chat messages. */
function toChat(context) {
  return context.map(message => {
    if (message.role === 'tool') return { role: 'tool', tool_call_id: message.callId, content: message.text }
    if (message.role !== 'assistant') return { role: message.role, content: message.text }
    // Thinking models expect their reasoning back with each assistant turn.
    return { role: 'assistant', content: message.text || (message.toolCall ? null : ''),
      reasoning_content: message.reasoning ?? '',
      ...message.toolCall ? { tool_calls: [{ id: message.toolCall.id, type: 'function',
        function: { name: message.toolCall.name, arguments: JSON.stringify(message.toolCall.args) } }] } : {} }
  })
}

/** A `model` for runTask. Only the first tool call of a reply is executed. */
export function llmModel(config) {
  return async (context, { canRecall }) => {
    const reply = await chat(config, { messages: [{ role: 'system', content: SYSTEM }, ...toChat(context)],
      tools: canRecall ? [TOOLS.bash, TOOLS.recall] : [TOOLS.bash] })
    const call = reply.tool_calls?.[0]
    const reasoning = reply.reasoning_content ?? undefined
    if (!call) return { type: 'final', text: reply.content ?? '', reasoning }
    let args
    try { args = JSON.parse(call.function.arguments) } catch { args = {} }
    if (call.function.name === 'recall') return { type: 'recall', observation_id: String(args.observation_id ?? ''), query: args.query, thought: reply.content ?? '', reasoning }
    return { type: 'bash', command: String(args.command ?? ''), thought: reply.content ?? '', reasoning }
  }
}

/** The summarizer G as a model call. */
export function llmSummarizer(config) {
  return async (messages, instruction) => (await chat(config, {
    messages: [{ role: 'system', content: 'You compress conversations.' },
      { role: 'user', content: `${messages.map(m => `[${m.role}${m.toolCall ? ` -> ${m.toolCall.name} ${JSON.stringify(m.toolCall.args)}` : ''}]\n${m.text}`).join('\n\n')}\n\n---\n${instruction}` }],
  })).content ?? ''
}
