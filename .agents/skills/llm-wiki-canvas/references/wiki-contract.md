# Wiki Contract

## Supported source conventions

- Markdown files under the selected root.
- YAML frontmatter fields: `title`, `type`, `tags`, `summary`, and `source`.
- Node types: `index`, `concept`, `source`, and `note`.
- Obsidian WikiLinks: `[[Page]]`, `[[Page|Label]]`, and `![[Page]]`.
- Relative Markdown file links: `[Label](path/Page.md)`.

## Generated artifacts

- `graph.json` uses schema version 1 and contains nodes, edges, diagnostics, and aggregate stats.
- `.canvas` follows the JSON Canvas 1.0 shape with file nodes and directed edges.
- `.excalidraw` follows Excalidraw's plaintext scene format with editable shapes, text, and arrows.
- Node IDs derive from normalized relative paths and stay stable across builds.
- Existing Canvas coordinates, dimensions, and colors are retained by node ID.
- Generated visual files contain relative knowledge paths, never machine-specific absolute Vault paths.
- Focused diagrams resolve an exact page title, ID, or relative path and select one or two relationship layers before rendering Mermaid or Excalidraw.
- `.lwc/drafts/<intake-id>/intake.json` records a selected `.md`/`.txt` source path, copied snapshot, SHA-256, byte count, generator, one declared Markdown target, and lifecycle state. It is local working state, not a public graph artifact.
- Intake proposal conversion must revalidate the original source and snapshot hashes, reject an unchanged placeholder or undeclared Markdown targets, and still pass through Proposal review before formal writes.
- `lwc agents` emits a deterministic cross-Agent compatibility report from repository-relative evidence paths. It must never include the absolute workspace root or equate a valid adapter with executed host-runtime evidence.

## Recommended wiki files

- `index.md`: small hand-maintained navigation entry point.
- `log.md`: append-only maintenance and ingestion log.
- `sources/`: immutable or minimally transformed source notes.
- `concepts/`: synthesized concept pages with source links.
- `AGENTS.md`: local schema, style, and review rules.
