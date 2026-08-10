# Usage guide

[English](usage.md) · [简体中文](usage.zh-CN.md)

LLM Wiki Canvas currently runs from a source checkout. The commands below match the v0.1 repository and do not assume that a newer npm package has been published.

## 1. Verify the demo

```bash
git clone https://github.com/chicogong/llm-wiki-canvas.git
cd llm-wiki-canvas
pnpm install
pnpm demo:build
pnpm lint:demo
pnpm dev
```

Open <http://127.0.0.1:4173>. Expected CLI result:

```text
Built 8 files · 16 links · 0 broken
8 files · 16 links · 0 diagnostic(s)
```

## 2. Build an existing Markdown or Obsidian Vault

From the LLM Wiki Canvas checkout:

```bash
pnpm exec tsx src/cli/index.ts build /path/to/vault \
  --graph public/graph.json \
  --canvas /path/to/vault/Wiki.canvas
pnpm dev
```

This produces two different views:

- `public/graph.json` drives the local relationship Viewer.
- `/path/to/vault/Wiki.canvas` opens directly in Obsidian.

Move nodes in Obsidian and run the same build again. Existing node coordinates and sizes are preserved when stable IDs still match.

## 3. Scan, lint, or generate only one artifact

Use the source CLI during development:

```bash
pnpm exec tsx src/cli/index.ts scan /path/to/vault \
  --output /path/to/vault/.lwc/graph.json

pnpm exec tsx src/cli/index.ts lint /path/to/vault

pnpm exec tsx src/cli/index.ts canvas /path/to/vault \
  --output /path/to/vault/Wiki.canvas
```

`lint` exits non-zero for broken links. Add `--strict` to treat warnings such as ambiguous links, missing titles, and orphan pages as failures.

## 4. Use it with Obsidian

Recommended ownership:

```text
Obsidian owns editing and manual layout.
Markdown owns knowledge truth.
LLM Wiki Canvas owns generated graph diagnostics and projection.
Git owns review and history.
```

Keep `Wiki.canvas` in the Vault when it is a curated shared view. Keep `.lwc/` ignored when it contains disposable local scans.

## 5. Use it with QMD

Both tools can point to the same Markdown root without sharing an index:

```bash
qmd collection add /path/to/vault --name my-wiki
qmd embed
qmd query "where is the review policy defined?"

pnpm exec tsx src/cli/index.ts lint /path/to/vault
pnpm exec tsx src/cli/index.ts build /path/to/vault \
  --graph public/graph.json \
  --canvas /path/to/vault/Wiki.canvas
```

Use QMD for keyword, semantic, and reranked retrieval. Use LLM Wiki Canvas for explicit link topology, structural diagnostics, and JSON Canvas generation.

## 6. Use it with Codex, Claude Code, or WorkBuddy

Copy the public Skill into the target repository when that Agent supports repository Skills:

```text
.agents/skills/llm-wiki-canvas/
├── SKILL.md
├── agents/openai.yaml
└── references/wiki-contract.md
```

Then ask the Agent to:

1. read the repository instructions and `index.md`;
2. run `lwc lint` before proposing structural changes;
3. cite exact source paths;
4. show Markdown and generated graph diffs;
5. apply knowledge changes only after human review.

No MCP server is required. The Agent reads files and invokes the CLI using its existing workspace permissions.

## 7. Use it in CI

For a repository that vendors or installs the CLI, the essential quality gate is:

```bash
lwc lint ./wiki --strict
lwc build ./wiki \
  --graph ./fixtures/graph.json \
  --canvas ./wiki/Wiki.canvas \
  --generated-at 2026-08-10T00:00:00.000Z
git diff --exit-code -- ./fixtures/graph.json ./wiki/Wiki.canvas
```

Use a deliberate fixed timestamp only for checked-in fixtures. Do not hide real source changes by automatically committing generated output from CI.

## 8. What the current Viewer does and does not do

The Viewer supports graph browsing, metadata search, page-kind filters, node evidence cards, and direct-neighbor navigation. It does not currently render Markdown bodies, perform semantic search, edit source files, or call an LLM.

For failures, run `lwc lint` first, check that the Viewer graph path returns JSON, and verify that the Wiki root contains readable `.md` files.
