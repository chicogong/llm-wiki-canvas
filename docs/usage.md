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
pnpm report:demo
pnpm dev
```

Open <http://127.0.0.1:4173>. Expected CLI result:

```text
Built 8 files · 16 links · 0 broken
8 files · 16 links · 0 diagnostic(s)
```

## 2. Build an existing Markdown or Obsidian Vault

The shortest daily workflow is one command. Build the package once when working from a source checkout, then serve any Vault:

```bash
pnpm build
pnpm lwc serve /path/to/vault
```

Open <http://127.0.0.1:4173>. The server keeps the graph in memory, watches Markdown, and tells the Workbench to refresh only after a complete build succeeds. It does not create `.lwc` state in the Vault. Stop it with `Ctrl+C`.

Useful options:

```bash
lwc serve /path/to/vault --port 4180
lwc serve /path/to/vault --no-watch
```

The default host is `127.0.0.1`. Setting `--host` to a network interface is an explicit exposure decision; the CLI prints a warning because page paths, summaries, tags, and relationships may be private.

To create persistent graph and Canvas artifacts instead:

```bash
pnpm exec tsx src/cli/index.ts build /path/to/vault \
  --graph public/graph.json \
  --canvas /path/to/vault/Wiki.canvas \
  --excalidraw /path/to/vault/Wiki.excalidraw
pnpm dev
```

This produces three persistent views:

- `public/graph.json` drives the local relationship Viewer.
- `/path/to/vault/Wiki.canvas` opens directly in Obsidian.
- `/path/to/vault/Wiki.excalidraw` opens as an editable Excalidraw scene with page titles, relative paths, and typed relationships.

Move nodes or add text, link, and group annotations in Obsidian, then run the same build again. Existing generated coordinates and sizes stay in place, manual annotations and their edges survive, and only new pages are placed to the right of the occupied layout. The CLI lists Markdown pages removed from the generated view.

The same ownership rule applies to Excalidraw: generated page positions, user-created shapes, and embedded files survive a rebuild, while generated arrows are refreshed from current Markdown relationships. Run `lwc excalidraw /path/to/vault -o Wiki.excalidraw`; use `--previous another.excalidraw` to take layout ownership from a different scene. A first build is deterministic and does not contain the Vault's absolute path.

### Export a focused explanation

Use one page and its immediate neighborhood when a full Vault graph is too dense for documentation or a design discussion:

```bash
lwc diagram /path/to/vault \
  --focus "Human Review" \
  --depth 1 \
  --direction both \
  --kind concept note \
  --format mermaid \
  --output Human-Review.mmd
```

`--focus` accepts an exact title, stable node ID, or relative Markdown path. Depth is deliberately limited to 1 or 2. Direction can be `incoming`, `outgoing`, or `both`; format can be `mermaid` or `excalidraw`. An ambiguous title fails with the matching paths instead of choosing silently. Mermaid output includes comments for broken links originating from selected pages.

## 3. Measure the current wiki

Generate a human-readable report to stdout:

```bash
pnpm lwc report /path/to/vault
```

For Agent comparisons or CI fixtures, write deterministic JSON:

```bash
pnpm lwc report /path/to/vault \
  --format json \
  --generated-at 2026-08-10T00:00:00.000Z \
  --output /path/to/report.json
```

The report contains observed page, relationship, connectivity, provenance, diagnostic, and degree counts. It does not assign an arbitrary health score. See [Benefits and workflows](value-and-workflows.md) for how to interpret and compare it.

### Verify Agent integration

At the repository root that contains Agent guidance, verify that every host points to the same reviewed-write contract:

```bash
lwc agents . --strict
lwc agents . --format json -o .lwc/agents.json
```

Strict mode fails when a required rule or Skill adapter is missing, unsafe, or stale. A `manual` result is deliberate rather than a failure: it means the host requires explicit context attachment. See [Agent compatibility](agent-compatibility.md).

## 4. Turn one selected source into an isolated draft

Register one Markdown or UTF-8 text source and one intended wiki target:

```bash
lwc intake create /path/to/vault \
  --source /path/to/meeting.txt \
  --target "concepts/Meeting Decision.md" \
  --generator Codex
```

Edit only the printed draft path. Then inspect and convert it into the existing Proposal lifecycle:

```bash
lwc intake show /path/to/vault/.lwc/drafts/<intake-id>/intake.json
lwc intake propose /path/to/vault/.lwc/drafts/<intake-id>/intake.json \
  /path/to/vault --summary "Record meeting decision"
```

The source snapshot, source SHA-256, generator, and target stay attached to the local intake record. Original-source drift, snapshot tampering, unchanged placeholders, duplicate source-target pairs, and undeclared Markdown targets are blocked. No formal Markdown changes before the resulting Proposal is reviewed and applied. See [Governed source intake](intake.md).

## 5. Review an Agent change before writing

Keep proposed Markdown in a separate draft directory, then create and inspect a proposal:

```bash
pnpm lwc proposal create /path/to/vault \
  --from /path/to/vault/.lwc/drafts/change-name \
  --summary "Explain the intended knowledge change"
pnpm lwc proposal show /path/to/proposal.json
```

A person can review or reject it by repeating the printed proposal ID. Only a reviewed proposal can be applied:

```bash
pnpm lwc proposal review /path/to/proposal.json \
  --approve <proposal-id> --reviewer "Alice"
pnpm lwc proposal apply /path/to/proposal.json /path/to/vault \
  --confirm <proposal-id>
```

No source Markdown changes during create, show, review, or reject. Apply checks payload, review, path, and original-target hashes before writing. See [Reviewed knowledge changes](proposals.md) for the state model and limits.

When `lwc serve /path/to/vault` is running, open **Changes** to inspect proposal files stored under `<vault>/.lwc/proposals/`. The Inbox separates proposed, reviewed, applied, and rejected states and shows exact file diffs with complete SHA-256 values. Invalid JSON and proposals belonging to another Vault appear as isolated inbox issues.

Changes is deliberately read-only. Review, reject, and apply remain explicit CLI operations so the Workbench cannot impersonate a reviewer or silently modify Markdown.

## 6. Scan, lint, or generate only one artifact

Use the source CLI during development:

```bash
pnpm exec tsx src/cli/index.ts scan /path/to/vault \
  --output /path/to/vault/.lwc/graph.json

pnpm exec tsx src/cli/index.ts lint /path/to/vault

pnpm exec tsx src/cli/index.ts canvas /path/to/vault \
  --output /path/to/vault/Wiki.canvas
```

`lint` exits non-zero for broken links. Add `--strict` to treat warnings such as ambiguous links, missing titles, and orphan pages as failures.

## 7. Use it with Obsidian

Recommended ownership:

```text
Obsidian owns editing and manual layout.
Markdown owns knowledge truth.
LLM Wiki Canvas owns generated graph diagnostics and projection.
Git owns review and history.
```

Keep `Wiki.canvas` in the Vault when it is a curated shared view. Keep `.lwc/` ignored when it contains disposable local scans.

## 8. Use it with QMD

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

## 9. Use it with AI agents

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

Codex and TRAE use the shared `.agents/skills` entry directly. Qoder and Claude Code use the included `.qoder/skills` and `.claude/skills` adapters. Tencent WorkBuddy should use the repository as its working directory and `@`-reference the rule and Skill files. See [Using AI agents](ai-agents.md) for the exact matrix, tool-specific setup, permissions, and copy-ready prompts.

## 10. Use it in CI

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

## 11. What the current Viewer does and does not do

The Workbench has four factual views. **Map** supports graph browsing, metadata search, page-kind filters, node evidence cards, relationship direction, and direct-neighbor navigation. **Health** reports compiled page/link totals, broken links, orphan pages, diagnostics, page-type distribution, and the most-connected pages. **Drafts** verifies source snapshots, isolated draft content, target scope, hashes, and proposal linkage. **Changes** renders the local proposal lifecycle, provenance, hashes, topology impact, and exact diffs without making the review decision. It does not currently render full formal Markdown pages, perform semantic search, edit source files, or call an LLM.

For failures, run `lwc lint` first, check that the Viewer graph path returns JSON, and verify that the Wiki root contains readable `.md` files.
