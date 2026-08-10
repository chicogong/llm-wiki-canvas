---
name: llm-wiki-canvas
description: Build, inspect, lint, and visualize a local Markdown or Obsidian knowledge wiki. Use when Codex needs to ingest notes into an LLM Wiki structure, analyze WikiLinks and relationships, find broken links or orphan pages, generate an Obsidian JSON Canvas, or maintain index.md and log.md without adding MCP, a database, or an embedded LLM. Do not use for cloud RAG systems, silent bulk rewrites of source notes, or applying unreviewed Agent changes.
---

# LLM Wiki Canvas

Treat Markdown, source files, and review records as truth. Treat generated graph and canvas files as disposable views.

## Inspect the Wiki

1. Locate the wiki root and read its `AGENTS.md` or `CLAUDE.md` if present.
2. Read `index.md` to learn the intended information architecture.
3. Run `lwc scan <root> -o <root>/.lwc/graph.json` to compile relationships.
4. Run `lwc report <root>` for a factual structure and provenance snapshot.
5. Run `lwc lint <root>` before proposing structural changes.
6. Report exact file paths for broken, ambiguous, and orphaned pages.

If the repository package is not installed globally, run `pnpm exec tsx <repo>/src/cli/index.ts` in place of `lwc`.

## Query and Explain

1. Start from the smallest relevant page or index.
2. Traverse direct WikiLinks before widening the search.
3. Cite the local file path for each material claim.
4. Distinguish source facts from generated summaries.
5. Say when the wiki has no evidence instead of inventing a relationship.

## Ingest or Maintain

1. Preserve raw source files; do not rewrite them as generated prose.
2. Put suggested Markdown under `<root>/.lwc/drafts/<name>/`, preserving its intended relative path. Never write the formal wiki before review.
3. Run `lwc proposal create <root> --from <draft> --summary <reason>` and `lwc proposal show <proposal>`.
4. Stop for human review. Only a person should run `proposal review --approve <id>` or `proposal reject --confirm <id>`.
5. Apply only a `reviewed` proposal with `lwc proposal apply <proposal> <root> --confirm <id>`.
6. Keep edits focused. Never regenerate a large `index.md` wholesale.
7. Add a dated entry to `log.md` describing created, updated, and unresolved items through the same proposal.
8. Re-run `lwc report`, `lwc lint`, and `lwc build` after apply.
9. Compare the before and after report, then show the source diff and generated diagnostics for review.

## Visualize

Run:

```bash
lwc build <root> \
  --graph <viewer-public>/graph.json \
  --canvas <root>/Wiki.canvas
```

Open `Wiki.canvas` in Obsidian for manual spatial editing. Future builds preserve positions when the same output canvas is used. Use the local Viewer for filtering and relationship inspection.

For a live local Workbench, run `lwc serve <root>`. Use Map for relationships, Health for compiler facts, and Changes to inspect proposal lifecycle, hashes, and diffs. Changes is evidence only: never claim that viewing a proposal reviewed, rejected, or applied it, and run those state transitions only after the person gives explicit direction.

## Safety Rules

- Keep Agent-authored content reviewable and attributable.
- Never treat `.lwc/graph.json` as a source of truth.
- Do not add MCP merely to expose local files; the host Agent can read files and run the CLI.
- Do not silently apply generated wiki rewrites.
- Never impersonate human review or invent the reviewer name. Creating and showing a proposal is safe; review and apply require explicit human direction.
- Preserve user-edited Canvas coordinates by building onto the existing Canvas file.
- Before staging changes, inspect `git status --short` and `git diff`; stage only explicit in-scope paths.
- Commit sanitized examples and deliberate reproducible fixtures, but never private vaults, `.lwc/` working state, credentials, sessions, caches, logs, absolute personal paths, or unreviewed screenshots.
- Treat generated artifacts as ignored by default. Commit one only when tests or public documentation depend on it and its provenance is documented.

Read [wiki-contract.md](references/wiki-contract.md) for supported conventions and generated artifact schemas.
