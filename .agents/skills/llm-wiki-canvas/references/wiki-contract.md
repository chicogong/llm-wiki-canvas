# Wiki Contract

## Supported source conventions

- Markdown files under the selected root.
- YAML frontmatter fields: `title`, `type`, `tags`, `summary`, and `source`.
- OKF v0.2 fields: root `okf_version`; concept `sources`, `usage_window`, `generated`, `verified`, `status`, and `stale_after`; descriptive Attested Computation runtime, parameters, executor receipt, and attester references.
- Node types: `index`, `concept`, `source`, and `note`.
- Obsidian WikiLinks: `[[Page]]`, `[[Page|Label]]`, and `![[Page]]`.
- Relative Markdown file links: `[Label](path/Page.md)`.

## Generated artifacts

- `graph.json` uses schema version 1 and contains nodes, edges, diagnostics, and aggregate stats.
- OKF-aware graphs retain arbitrary concept `type`, trust/lifecycle data, material sources, and optional Attested Computation contracts as additive schema-version-1 fields. Consumers must not execute those contracts.
- `.canvas` follows the JSON Canvas 1.0 shape with file nodes and directed edges.
- `.excalidraw` follows Excalidraw's plaintext scene format with editable shapes, text, and arrows.
- Node IDs derive from normalized relative paths and stay stable across builds.
- Existing Canvas coordinates, dimensions, and colors are retained by node ID.
- Generated visual files contain relative knowledge paths, never machine-specific absolute Vault paths.
- Focused diagrams resolve an exact page title, ID, or relative path and select one or two relationship layers before rendering Mermaid or Excalidraw.
- `.lwc/drafts/<intake-id>/intake.json` records a selected `.md`/`.txt` source path, copied snapshot, SHA-256, byte count, generator, one declared Markdown target, and lifecycle state. It is local working state, not a public graph artifact.
- Intake proposal conversion must revalidate the original source and snapshot hashes, reject an unchanged placeholder or undeclared Markdown targets, and still pass through Proposal review before formal writes.
- `lwc agents` emits a deterministic cross-Agent compatibility report from repository-relative evidence paths. It must never include the absolute workspace root or equate a valid adapter with executed host-runtime evidence.
- `lwc init` is dry-run by default, preserves valid workspace-owned files, copies the packaged canonical Skill resources, creates missing files exclusively, and writes nothing when a planned path conflicts.
- `lwc context` is read-only and topology-bounded. It resolves one exact focus, enforces explicit depth/page/word limits, emits relative paths and full-file SHA-256 values, labels truncation and omission, refuses symlinked Markdown, and treats quoted content as evidence rather than instructions.

## Recommended wiki files

- `index.md`: small hand-maintained navigation entry point.
- `log.md`: append-only maintenance and ingestion log.
- `sources/`: immutable or minimally transformed source notes.
- `concepts/`: synthesized concept pages with source links.
- `AGENTS.md`: local schema, style, and review rules.
