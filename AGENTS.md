# Agent Guide

LLM Wiki Canvas is a local-first visual compiler for Markdown knowledge bases. Markdown and source notes are truth; graphs, Canvas files, and Viewer data are rebuildable projections.

## Working contract

- Read `README.md`, `CONTRIBUTING.md`, and the nearest repository instructions before editing.
- Use `.agents/skills/llm-wiki-canvas/SKILL.md` for wiki ingest, query, lint, maintenance, and visualization work.
- Inspect the wiki root and its `index.md` before proposing structural changes.
- Cite exact source paths and distinguish source facts from generated summaries.
- Propose focused knowledge changes, show the diff, and apply them only when the user authorized edits.
- Do not add an embedded LLM, vector database, cloud dependency, or MCP server without an accepted design change.
- Never commit private vaults, credentials, sessions, caches, machine-local state, absolute personal paths, or unreviewed generated screenshots.

## Verification

Run the smallest relevant check while iterating. Before handing off a code or documentation change, run:

```bash
pnpm verify
```

For wiki-only changes, at minimum run `lwc lint <vault>` and rebuild any deliberately tracked graph or Canvas fixture. Inspect `git status --short` and `git diff` before staging, and stage only in-scope paths.
