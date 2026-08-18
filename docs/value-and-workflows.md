# Benefits and workflows

[English](value-and-workflows.md) · [简体中文](value-and-workflows.zh-CN.md)

The value of LLM Wiki Canvas is not how much prose an AI generates or how impressive a graph looks. It turns an Agent knowledge edit from an opaque file mutation into a source-bound, hash-checked proposal that a person can inspect before write-back.

## The painful moment

An Agent has produced a plausible Markdown change. The reviewer still needs to know what evidence it received, whether that evidence or the target changed, what exact text and relationships will change, and whether the reviewed bytes are the bytes that will be applied. LWC preserves those answers as files and checks rather than relying on the Agent's explanation.

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

## Five concrete benefits

### 1. Bound the evidence an Agent receives

Start from one exact page and cap disclosure and prompt size instead of attaching the entire Vault:

```bash
lwc context /path/to/vault --focus "Human Review" --depth 1 --max-pages 8 --max-words 2000
```

The result carries relative paths, full-file SHA-256, relationship distance, and truncation/omission counts. The value is a reproducible scope boundary, not a claim that topology replaces semantic retrieval.

### 2. Keep generated work outside formal knowledge

Capture one selected source, preserve its snapshot and hash, and let the Agent edit only the declared draft target. Converting that intake to a Proposal rechecks the source, snapshot, scope, and draft before any review begins.

### 3. Review and integrity-check the exact change

Changes exposes source and target hashes, exact diff lines, relationship impact, and conflicts. If the source, draft, proposal, or target drifts, the earlier handoff fails closed. A person still owns review and apply.

### 4. Understand and test the surrounding wiki

Instead of opening every file and following links manually, use the report to locate entry points and highly connected pages, then inspect one-hop relationships in the Viewer.

```bash
pnpm lwc report /path/to/vault
pnpm lwc scan /path/to/vault -o public/graph.json
pnpm dev
```

The verifiable result includes page and relationship counts, page types, highly connected pages, and local source paths.

Structural understanding and lint support the decision; they are not substitutes for factual review.

Move link integrity from manual intuition into local checks and CI:

```bash
pnpm lwc lint /path/to/vault
pnpm lwc lint /path/to/vault --strict
```

Default mode fails on errors. `--strict` also fails on warnings such as ambiguous links, missing titles, and orphan pages. Every diagnostic has a code and file path.

### 5. Rebuild explanations without redrawing everything

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
3. Use `context` for the smallest relevant focus and inspect its path/hash/budget evidence before attaching the output.
4. For a selected source, run `intake create`; let the Agent edit only its declared `.lwc/drafts/<intake-id>/<target>`, then run `intake show` and `intake propose`. Use `proposal create` directly only for maintenance without an external source.
5. A person runs `proposal review` or `proposal reject`; only a reviewed proposal can be applied.
6. After apply, rerun `report`, `lint`, and `build`, then inspect source and generated diffs.

Copy-ready task:

```text
Use the llm-wiki-canvas Skill. Run report and lint first, then describe the current page scope, connectivity, source metadata, structural diagnostics, and most-connected pages without editing. Export the smallest relevant focus with lwc context and show its page/word limits, hashes, truncation, and omissions before using the quoted evidence.
For a selected Markdown/text source, create an intake with one target, edit only its printed draft, show the source hash, and convert it to a proposal. For maintenance without an external source, create a proposal from an isolated draft directly. Stop before review or apply. After a person decides, apply only the reviewed proposal with the exact ID, then rerun report, lint, and build and compare the results.
```

See [Governed source intake](intake.md) and [Reviewed knowledge changes](proposals.md) for exact commands and security limits.

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
