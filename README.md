# LightCode: Evidence-Guided Self-Evolving Context Compression for Coding Agents

Demo code for the paper: a compact, dependency-free implementation of the three
stages of LightCode, with the initial compression policy, the verification rule
and the preservation requirements. It runs on its own (Node.js 22 or newer; no
model or API key is needed for the offline examples). Experimental data and
results are not included; they are reported in the paper.

| Paper | Code |
|---|---|
| Executable observation compression, policy pi = recognizer, parsers and transformations (Sec. 3.2, Eq. 2) | `src/policy.mjs`; policies are rule directories in `rules/` |
| Admission F_pi with a fixed validity check; raw archive A (Eq. 3) | `src/admission.mjs` |
| Recoverable history compaction Psi: externalize, then summarize; checkpoint K = (G(Q(H;R)), A, R); fallback (Sec. 3.3, Eq. 4) | `src/history.mjs` (`compact`) |
| Recall of evicted evidence | `src/history.mjs` (`recall`) |
| Saving s_pi(e) on replay evidence (Eq. 7) | `src/verify.mjs` (`replay`) |
| Preservation requirements P (Appendix A.3) | `src/contracts.mjs` |
| Verification and the acceptance rule (Eq. 9) | `src/verify.mjs` (`verify`) |
| Self-evolution pi_{k+1} = Verify(Propose(pi_k, E_k)) (Eq. 6), learner input and instructions | `src/evolution.mjs` |
| Algorithm 1 (one task) | `src/agent.mjs` (`runTask`) |
| Running example (Figure 3) | `examples/01-running-example.mjs` |
| History compaction example (Figure 4) | `examples/03-history-compaction.mjs` |

## Quick start

```sh
npm install          # only needed to rebuild rule directories from source
npm test
node examples/01-running-example.mjs      # Figure 3: same dots, opposite decisions
node examples/02-evolution-step.mjs       # Verify(Propose(...)) with three scripted proposals
node examples/03-history-compaction.mjs   # externalize, summarize, recall
LIGHTCODE_API_KEY=... node examples/04-live-agent.mjs   # live model, real bash, a small bug-fix task
```

The command-line tool works on any rule directory:

```sh
pytest -q 2>&1 | node bin/lightcode.mjs project --rules rules/initial --command "pytest -q"
node bin/lightcode.mjs replay --rules <rule-directory> --cases observations.jsonl
node bin/lightcode.mjs check  --parent <rule-directory> --candidate <rule-directory> --cases observations.jsonl
node bin/lightcode.mjs build  <rule-directory>    # src/ -> lib/
node bin/lightcode.mjs hash   <rule-directory>
```

## Policies

`rules/initial` is pi_0, the 81 hand-written filters that evolution starts from.

A rule directory is a self-contained program: `index.json` lists the rules in
order, and each entry module exports `project(input)`, which returns `null` (the
rule does not recognize the observation) or `{ text, sourceMap }`. The source map
records which spans of the output are copied from the observation. The first rule
that returns a rendering wins; admission then delivers it only if it is strictly
smaller in bytes and saves tokens, and otherwise delivers the raw observation.
Rules are written in TypeScript or JavaScript under `src/` and built into `lib/`
with `node bin/lightcode.mjs build`.

Replay evidence for `replay` and `check` is a JSON Lines file with one
`{ "id": ..., "input": { "kind": "shell", "command": ..., "raw": ..., "exitCode": 0, "stream": "stdout" } }`
object per line; `RawArchive.replayCases()` produces it from a run.

## Evolution with a coding-agent learner

`evolve()` in `src/evolution.mjs` performs one step. It writes the experience
E_k of the finished task to a learner workspace:

```
<workspace>/
  PROMPT.md             the learner's instructions (as in the experiments)
  START.md              the task
  evidence-index.json   one row per observation: command, decision, tokens
  cases/NNNN.json       raw observation, what the agent read, the decision
  task-trajectory.json  the agent's actions
  rules-work/           an editable copy of pi_k
```

Any coding agent can act as the learner: run it in the workspace with
`PROMPT.md` as its task. It checks its candidate with
`node bin/lightcode.mjs check --workspace <workspace>`, which replays all evidence
D_k (kept outside the workspace) and the preservation requirements. Pass the agent
as the `propose` callback to `evolve()`. The candidate is adopted only if
verification accepts it; otherwise pi_{k+1} = pi_k. `examples/02-evolution-step.mjs`
uses scripted proposals in place of the agent. `examples/04-live-agent.mjs` writes
a learner workspace from a live run.

## How this demo differs from the experimental system

The experiments ran LightCode as a plugin inside DeepSeek Harness. This repository
reimplements the mechanisms outside that harness, so that they can be read and run
on their own. The differences:

- **Rule execution.** The experiments ran rule code in a network-less, read-only
  container. Here it runs in-process, so load only rule directories you trust.
- **Agent loop.** The harness integration (tool-result hooks, spill files,
  sessions) is replaced by the minimal loop in `src/agent.mjs`. Replay applies each
  rule input on its own; the harness's separate handling of stderr streams is
  omitted.
- **History compaction.** Compaction follows the same steps as the experiments: a
  verification against what the agent read, references with a bounded excerpt of
  at most 320 bytes, exact user messages kept outside the summary, a fallback when
  the checkpoint is not smaller, and recall that returns a bounded window. It works
  on a plain message list, however. The summarizer instruction is abridged, and the
  recall tool is offered as soon as the catalog has an entry.
- **Token counts.** Tokens use the harness's fixed-density estimate (4 characters
  per token, plus framing), as in the experiments.
- **Benchmarks.** The benchmark harnesses (EvoAgentBench, LongCLI-Bench,
  MemoryAgentBench), the baselines, the evolved policies and the experimental
  data are not included.

## License

MIT, see `LICENSE`. The initial policy includes filters derived from RTK; see
`rules/initial/licenses/rtk` (Apache-2.0).
