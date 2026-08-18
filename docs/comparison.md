# Comparison and decision guide

[English](comparison.md) · [简体中文](comparison.zh-CN.md)

Last verified: **2026-08-14**

This guide compares current product boundaries, not project popularity. Features change quickly; follow the linked official documentation for the latest detail.

Legend: **Yes** = a current first-class capability; **Partial** = narrower, optional, or available through a surrounding workflow; **No** = intentionally not a core capability. “No” does not mean an integration or plugin is impossible.

## Short answer

- Choose **LLM Wiki Canvas** when Markdown already exists and Agent changes need bounded evidence, isolated drafts, exact diffs, integrity checks, and human-controlled write-back.
- Choose **Obsidian** for daily human authoring, browsing, plugins, and broad app-backed CLI automation.
- Choose **QMD** when local retrieval quality for Agents is the main problem.
- Choose **LLM Wiki** when an LLM should ingest source documents and continuously generate and maintain a personal Wiki.
- Choose **WeKnora** when you need a complete knowledge platform: broad ingestion, RAG, Agent execution, services, integrations, access control, and operations.

## Capability matrix

| Capability | LLM Wiki Canvas | Obsidian | QMD | LLM Wiki | WeKnora |
| --- | --- | --- | --- | --- | --- |
| Primary interface | Headless CLI + local Viewer | Desktop/mobile editor + official CLI | CLI + library/MCP | Cross-platform desktop app | Web/API/CLI/MCP platform |
| Existing Markdown remains primary input | **Yes** | **Yes** | **Yes**, indexed as documents | **Yes**, in a raw/wiki/schema workflow | **Partial**, managed knowledge sources and generated Wiki |
| Requires an LLM for core graph/lint | **No** | **No** | **Partial**, keyword search does not; semantic/rerank uses local models | **Yes** for ingest and generation | **Yes** for Agent/Wiki/RAG flows |
| Automatic Wiki synthesis | **No** | **No** in core | **No** | **Yes** | **Yes**, Wiki Mode |
| PDF/Office/OCR ingestion pipeline | **No** | **Partial**, reading/import ecosystem rather than synthesis | **No** as a Wiki synthesis pipeline | **Yes** | **Yes**, broad managed formats |
| Keyword search | Viewer substring filter | **Yes** | **Yes**, BM25 | **Yes** | **Yes** |
| Vector/hybrid retrieval | **No** | Plugin-dependent | **Yes** | Optional vector + graph relevance | **Yes**, multiple retrieval engines |
| Relationship graph | **Yes**, compiled from explicit links | **Yes** | **No** visual graph | **Yes**, multi-signal graph | **Yes**, Wiki/knowledge graph |
| Deterministic structural lint | **Yes** | **Partial** | **No** | **Partial**, includes Lint/health workflows with a different contract | Managed validation rather than this file-level contract |
| Editable JSON Canvas generation | **Yes** | **Yes**, native Canvas authoring | **No** | **No** first-class exporter | **No** first-class exporter |
| Stable IDs and reproducible graph fixture | **Yes** | Not its primary contract | Index is rebuildable | App-managed | Service-managed indexes |
| Agent integration | Repo Skill + headless CLI | Official CLI, files, and plugin ecosystem | CLI + MCP | Local API + Agent Skill | API + CLI + MCP + Skills |
| Source-bound isolated draft | **Yes**, one selected source and declared target | File workflow, not a core review contract | **No** | App-managed generation workflow | Managed Wiki/Agent workflow |
| Hash-bound proposal before write-back | **Yes** | Git/plugin-dependent | **No** | Product-specific review flow | Confirmation and platform workflows, not this file-native contract |
| Built-in chat | **No** | **No** in core | **No** general chat UI | **Yes** | **Yes** |
| Team RBAC and service operations | **No** | **No** platform RBAC | **No** | Personal/local focus | **Yes** |
| Typical operating weight | Node CLI + static Viewer; no app process required | Installed application; the official CLI requires the app to be running | Node CLI + downloaded local models for semantic modes | Desktop app + configured model provider | Docker/service deployment and configured infrastructure |

## The important boundary

LLM Wiki Canvas is not a “smaller WeKnora” and not a second LLM Wiki desktop application. Its unit of value is a controlled knowledge change:

```text
selected source
  → hash-bound isolated draft
  → exact proposal and relationship impact
  → human decision
  → formal Markdown
```

The compiler does not decide what the Wiki should say. LWC makes the Agent handoff inspectable before formal Markdown changes; Git remains the repository history and collaboration layer. Graph, Canvas, and diagnostics support that review rather than define the product.

## When another tool is the better answer

### Choose Obsidian instead

Choose Obsidian when the main job is writing, navigating, tagging, embedding media, or using a rich plugin ecosystem. Obsidian stores notes as local Markdown and supports JSON Canvas, so it is the natural human workspace around `lwc`, not a competitor that must be replaced.

Recommended combination: edit in Obsidian, lint in CI, and regenerate a curated `.canvas` without losing manual node positions.

Obsidian's official CLI now covers broad app-backed automation, including reading, searching, writing, tasks, tags, unresolved links, plugin development, and screenshots. It requires a current Obsidian installation, explicit CLI activation, and a running Obsidian app. Obsidian also documents Headless Sync as a separate server-oriented sync product. LLM Wiki Canvas should not duplicate those generic commands. Its narrower role is a repository-native compiler and review boundary: deterministic graph/Canvas artifacts, exact structural diagnostics, bounded source-hashed Agent context, and proposals that remain unapplied until human review.

### Choose QMD instead

Choose QMD when the problem is finding relevant passages across many local documents. QMD provides BM25, vector search, query expansion, and local LLM reranking. LLM Wiki Canvas only filters graph metadata and does not claim semantic retrieval.

Recommended combination: point both tools at the same Markdown root. Let QMD answer “which passages matter?” and let `lwc` answer “what bounded evidence was handed to the Agent, what is it proposing, and is that write-back still safe?”

### Choose LLM Wiki instead

Choose LLM Wiki when you want a desktop app to import PDFs, DOCX, Markdown, images, or watched folders and have an LLM synthesize a persistent, interlinked Wiki. It also includes chat, search, graph insights, review flows, and an Agent-facing local API.

LLM Wiki Canvas is useful only as an optional downstream compiler when you specifically want reproducible JSON graph fixtures or an editable Obsidian Canvas from those Markdown pages.

### Choose WeKnora instead

Choose WeKnora when you need an enterprise knowledge system rather than a file compiler. Its current platform covers broad document ingestion, multiple retrieval engines and vector stores, RAG Q&A, ReAct Agents, Wiki Mode, APIs, MCP, IM/data-source integrations, RBAC, task management, and observability.

Do not adopt LLM Wiki Canvas as a substitute for those operational capabilities. It intentionally has no server, model management, parser fleet, tenant model, or access-control layer.

## Sources

- [LLM Wiki Canvas README](../README.md)
- [Obsidian: About Obsidian](https://obsidian.md/help/obsidian), [how Obsidian stores data](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata), and [official Obsidian CLI](https://obsidian.md/cli)
- [QMD official repository](https://github.com/tobi/qmd)
- [LLM Wiki official repository](https://github.com/nashsu/llm_wiki)
- [WeKnora official repository](https://github.com/Tencent/WeKnora)
- [JSON Canvas 1.0 specification](https://jsoncanvas.org/spec/1.0/)

If a listed project changes materially, open an issue or PR with an official source and update the verification date.
