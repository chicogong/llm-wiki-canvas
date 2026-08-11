# Changelog

All notable changes will be documented here. This project follows Semantic Versioning after its first public release.

## [Unreleased]

### Added

- Markdown, YAML frontmatter, WikiLink, embed, and Markdown-link compiler.
- Stable graph IDs, link diagnostics, orphan detection, and JSON Canvas export.
- Local relationship Viewer with desktop and mobile layouts.
- Repository-scoped Agent Skill for ingest, query, lint, and visualization workflows.
- Release-style verification for source, package, CLI, production Viewer, and sensitive information.
- Complete English and Simplified Chinese project guides, an Atlas screenshot, and a reproducible example walkthrough with benefit comparisons.
- Deterministic topology layout with low-noise relationship highlighting and a dark local-instrument Viewer theme.
- Explicit open-source commit boundaries for reproducible public artifacts versus private or machine-local state.
- English and Chinese comparison and usage guides covering Obsidian, QMD, LLM Wiki, WeKnora, Agent Skills, and CI workflows.
- English and Chinese AI Agent integration guides, shared `AGENTS.md` rules, and native Skill adapters for Codex, TRAE, Qoder, and Claude Code, with an explicit Tencent WorkBuddy workspace workflow.
- A tested `lwc report` command for Markdown or JSON structure snapshots, a source-checkout `pnpm lwc` entry point, and bilingual benefit and workflow guides grounded in reproducible counts.
- A guarded `lwc proposal` lifecycle with isolated drafts, rendered diffs, review/reject states, exact-ID confirmation, SHA-256 integrity and target-drift checks, rollback attempts, and bilingual security documentation.
- Deterministic editable Excalidraw scene export through `lwc excalidraw` and `lwc build --excalidraw`, with stable IDs, typed relationship styles, relative source paths, and packaged CLI coverage.
- Focused Mermaid and Excalidraw diagrams through `lwc diagram`, with exact focus resolution, one- or two-layer traversal, direction and page-kind filters, broken-link evidence, and shared-subgraph parity tests.
- Position-owned Canvas and Excalidraw rebuilds that retain existing coordinates and manual annotations, place new pages outside the occupied layout, preserve embedded Excalidraw files, and report removed generated pages.
- Governed Markdown/text intake through `lwc intake create/show/propose`, including copied source snapshots, SHA-256 provenance, generator records, duplicate detection, single-target scope, drift/tamper checks, isolated `.lwc/drafts`, and handoff into the existing human-reviewed proposal lifecycle.
- A live, read-only Drafts Workbench with source/draft comparison, evidence-chain states, scope and hash validation, generator provenance, safe CLI handoff, filesystem refresh events, and desktop/mobile coverage; Changes now carries intake provenance into review.
- Deterministic cross-Agent contract verification through `lwc agents`, including Markdown/JSON output, strict CI failure, safe regular-file checks, Codex/Claude Code/Qoder/TRAE adapters, an honest manual WorkBuddy state, and a generated public compatibility matrix.
- Dry-run-first cross-Agent scaffolding through `lwc init`, with host selection, packaged canonical Skill resources, preservation of valid workspace-owned rules, all-or-nothing conflict blocking, exclusive file creation, and packaged CLI regression coverage.
- An opt-in synthetic host runtime fixture that distinguishes deterministic reference evidence, real host execution, authentication blocks, unavailable binaries, and semantic failures without touching formal Markdown or storing sessions.
- Linux and macOS package CI across Node.js 20 and 22, plus repeatable release checks and a documented schema compatibility policy.
- Bounded, read-only Agent context export through `lwc context`, with exact focus resolution, relationship depth/direction/type filters, page and word budgets, source hashes, truncation evidence, symlink refusal, Markdown/JSON output, and a copy-ready Workbench handoff.

### Compatibility

- Graph/report, intake, proposal, Agent compatibility, scaffolding, and host-runtime JSON remain at `schemaVersion: 1`; readers must reject unsupported future versions instead of guessing.
- Obsidian Canvas output follows JSON Canvas `1.0`; generated Excalidraw scenes use Excalidraw file format version `2`.
- Stable IDs and preserved positions remain compatibility promises within schema version 1. See [Schema compatibility](docs/schema-compatibility.md) for the change policy.
- Context bundles use `schemaVersion: 1`; relative paths, full-file hashes, explicit limits, and truncation/omission counts are compatibility fields. Page content is evidence, not an instruction channel.
