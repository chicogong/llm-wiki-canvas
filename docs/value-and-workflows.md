# Benefits and workflows

[English](value-and-workflows.md) · [简体中文](value-and-workflows.zh-CN.md)

The value of LLM Wiki Canvas is not how much prose an AI generates. It gives a local Markdown knowledge base repeatable, reviewable structural feedback.

## See the result in two minutes

From the source repository:

```bash
pnpm install
pnpm report:demo
pnpm demo:build
pnpm dev
```

`report:demo` prints a Wiki health report derived from the actual scan. `demo:build` generates `graph.json` and an Obsidian Canvas. Open the Viewer at <http://127.0.0.1:4173>.

The current example verifies:

| Signal | Observed result | What it establishes |
| --- | ---: | --- |
| Markdown pages | 8 | The explicit scope of this scan |
| Resolved relationships | 16 | Explicit connections available for traversal |
| Connected pages | 8 / 8 | No page sits outside the relationship graph |
| Pages with `source` metadata | 2 / 8 | Inspectable source declarations, not automatic proof of correctness |
| Structural errors / warnings | 0 / 0 | No broken, ambiguous, untitled, or orphaned pages found by the compiler |

These are observations of the checked-in repository, not a universal benchmark or an invented health score.

## Four concrete benefits

### 1. Understand a wiki

Instead of opening every file and following links manually, use the report to locate entry points and highly connected pages, then inspect one-hop relationships in the Viewer.

```bash
pnpm lwc report /path/to/vault
pnpm lwc scan /path/to/vault -o public/graph.json
pnpm dev
```

The verifiable result includes page and relationship counts, page types, highly connected pages, and local source paths.

### 2. Control structural quality

Move link integrity from manual intuition into local checks and CI.

```bash
pnpm lwc lint /path/to/vault
pnpm lwc lint /path/to/vault --strict
```

Default mode fails on errors. `--strict` also fails on warnings such as ambiguous links, missing titles, and orphan pages. Every diagnostic has a code and file path.

### 3. Review Agent changes

Save JSON reports before and after an approved edit to compare pages, relationships, connectivity, and diagnostics:

```bash
pnpm lwc report /path/to/vault --format json --generated-at 2026-08-10T00:00:00.000Z -o before.json
# Let the Agent edit Markdown after human approval
pnpm lwc report /path/to/vault --format json --generated-at 2026-08-10T00:00:00.000Z -o after.json
git diff --no-index before.json after.json
```

Using the same fixed timestamp removes time-only noise from this deliberate comparison. The report proves structural change, not factual correctness. The Agent must still cite sources and show the Markdown diff.

### 4. Avoid redrawing the same map

Generate JSON Canvas from WikiLinks, then arrange it manually in Obsidian. Later builds preserve existing node positions.

```bash
pnpm lwc build /path/to/vault \
  --graph public/graph.json \
  --canvas /path/to/vault/Wiki.canvas
```

Automation maintains connections; people own spatial layout and final communication.

## Three recommended workflows

### Personal Obsidian Vault

1. Edit Markdown normally in Obsidian.
2. Run `lwc lint` after a structural cleanup.
3. Run `lwc build` to refresh the Viewer and `Wiki.canvas`.
4. Keep `.lwc/` local; commit only selected Canvas views or deliberate fixtures.

### Agent-maintained project wiki

1. Keep `AGENTS.md` and the `llm-wiki-canvas` Skill in the repository.
2. Ask the Agent to run `report` and `lint` and describe the current state without editing.
3. Review the proposed pages and relationship changes before allowing writes.
4. After edits, rerun `report`, `lint`, and `build`, then inspect source and generated diffs.

Copy-ready task:

```text
Use the llm-wiki-canvas Skill. Run report and lint first, then describe the current page scope, connectivity, source metadata, structural diagnostics, and most-connected pages without editing.
Propose the Markdown files and relationships that would change. Do not write until I approve. After approval, apply only accepted changes, rerun report, lint, and build, and compare the before and after results.
```

### Team CI gate

```bash
lwc lint ./wiki --strict
lwc report ./wiki --format json \
  --generated-at 2026-08-10T00:00:00.000Z \
  --output ./fixtures/wiki-report.json
lwc build ./wiki \
  --graph ./fixtures/graph.json \
  --canvas ./wiki/Wiki.canvas \
  --generated-at 2026-08-10T00:00:00.000Z
git diff --exit-code -- ./fixtures/wiki-report.json ./fixtures/graph.json ./wiki/Wiki.canvas
```

Use a fixed timestamp only for a deliberately tracked reproducible fixture. Everyday reports should retain their real generation time.

## Reading the report

- **Resolved relationships:** successfully resolved and deduplicated WikiLinks, Markdown links, and embeds.
- **Connected pages:** pages with at least one resolved incoming or outgoing relationship; this is not a content-quality score.
- **Pages with source metadata:** pages declaring `source` in frontmatter; this does not automatically validate the source.
- **Most connected pages:** ranked by resolved incoming plus outgoing relationships to expose likely entries and hubs, not importance.
- **Errors / warnings:** structural issues the compiler can determine; zero diagnostics does not prove factual correctness.

## Benefits not claimed

Without real user research or benchmarks, this project does not claim:

- a fixed percentage of time saved;
- automatic improvement in answer accuracy;
- that more relationships imply better knowledge;
- that a `source` field completes fact verification;
- that an Agent should maintain formal knowledge without human review.

What can be claimed today is narrower and testable: the same Markdown deterministically produces a structural report, diagnostics, relationship graph, and editable Canvas whose changes can be checked with Git and CI.
