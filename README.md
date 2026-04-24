# loopany

A long-running agent brain. Records what the agent did, tracks how it
played out, and iterates its own skills from what worked.

Markdown + frontmatter for storage. Append-only JSONL for the graph.
No database for the source of truth — artifacts are plain files.
(An optional local SQLite index is built on demand for search; it's a
derived artifact and can be deleted at any time without data loss.)
Any MCP-capable agent (Claude Code, Hermes, OpenClaw, Codex, custom)
can attach this CLI and gain a persistent, self-iterating brain.

## Install

Paste this into any MCP-capable agent (Claude Code, Hermes, Codex, …):

```
Retrieve and follow the instructions at:
https://raw.githubusercontent.com/superdesigndev/loopany/main/INSTALL_FOR_AGENTS.md
```

The agent clones the repo, installs Bun + the CLI, initializes your
workspace, runs a 5-phase onboarding conversation with you, and loads
the skill library. You don't run any shell commands yourself.

## Search

loopany ships with hybrid keyword + semantic search over your artifacts.
Markdown stays the source of truth; search is a derived local index.

```sh
loopany reindex                         # build or refresh the index
loopany reindex --force                 # rebuild from scratch
loopany reindex --no-embed              # keyword-only (skips model download)

loopany search "authentication bug in the proxy"
loopany search "billing" --kind note --limit 5
loopany search "onboarding" --domain ads --status running
```

**How it works.** FTS5 (BM25) and vector cosine are run in parallel, then
fused via Reciprocal Rank Fusion and grouped by artifact (one hit per
artifact, best-scoring chunk wins). Index lives at
`$LOOPANY_HOME/search.db` via Bun's built-in SQLite — no native
dependency to compile.

**Embedding model.** `Xenova/all-MiniLM-L6-v2` (384 dim, ~22MB q8 ONNX),
downloaded from HuggingFace on first run and cached under `~/.cache/huggingface`.
Chosen for footprint, not multilingual quality — if the model fails to
load (e.g. sandboxed environment), search transparently falls back to
FTS5-only and logs a one-line warning to stderr. `--no-embed` lets you
opt into keyword-only indexing explicitly.

**When to re-run.** Manually, whenever you want fresh results.
Artifact writes don't auto-reindex in v1 — run `loopany reindex` on a
cadence that fits your workflow (or wire it to a commit hook).

### Alternative: QMD for heavier use cases

If your workspace grows past a few thousand artifacts, or you need
multilingual recall, LLM re-ranking, or query expansion,
[QMD](https://github.com/tobi/qmd) is a drop-in alternative that points
at the same `artifacts/` directory:

```sh
npm install -g @tobilu/qmd
qmd collection add ~/loopany/artifacts --name loopany
qmd embed
qmd query "your question"
```

QMD runs a heavier local stack (~2GB of GGUF models: EmbeddingGemma + a
Qwen3 re-ranker + a fine-tuned query expander) so quality is higher at
the cost of disk and startup time. loopany's built-in `search` is the
lightweight default; nothing stops you from running both side by side.

## Learn more

- [`CLAUDE.md`](./CLAUDE.md) — design philosophy, core concepts, MVP scope
- [`INSTALL_FOR_AGENTS.md`](./INSTALL_FOR_AGENTS.md) — agent-facing install + command reference
- [`ONBOARDING.md`](./ONBOARDING.md) — the 5-phase first-run script
- [`skills/RESOLVER.md`](./skills/RESOLVER.md) — skill dispatcher (read this if you're an agent)
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes

## Status

`0.1.0` — usable for single-user dogfooding. Self-iteration loop
(`reflect` + `proposal-review` skills) is shipped; bundled domain packs
(CRM / ads / content / metrics) are designed but not yet ported.

## Acknowledgments

loopany stands on the shoulders of a few specific people's thinking:

- **[GBrain](https://github.com/garrytan/gbrain)** by Garry Tan — the
  architectural sibling. Same overall shape (CLI + skills + markdown +
  MCP), different focus: GBrain answers *"what do I know"*, loopany
  answers *"what did I do, did it work, what should I change next."*
- **[LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)**
  by Andrej Karpathy — mental model for markdown-as-agent-memory and the
  latent-vs-deterministic division of labor.
