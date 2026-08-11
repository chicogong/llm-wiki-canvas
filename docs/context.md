# Bounded Agent context / 有限 Agent 上下文

[English](#english) · [简体中文](#简体中文)

## English

`lwc context` turns one exact page and its relationship neighborhood into a finite, source-cited context bundle. It is designed for coding Agents that can already read files or run shell commands, so it needs no MCP server, embedded model, vector database, or cloud account.

```bash
lwc context /path/to/vault \
  --focus "Human Review" \
  --depth 1 \
  --direction both \
  --kind concept source note \
  --max-pages 8 \
  --max-words 2000 \
  --output .lwc/context/human-review.md
```

`--focus` must resolve to one exact title, stable node ID, or relative Markdown path. Depth is restricted to 0–2; page count to 1–50; and the Markdown budget to 1–100,000 words. Pages are ranked deterministically by relationship distance and then relative path. The focus page is always considered first, even when a kind filter excludes its type.

The bundle contains raw Markdown excerpts, relative paths, full-file SHA-256 values, graph distance, included relationships, relevant diagnostics, and explicit truncation/omission counts. Markdown output labels Vault content as quoted evidence rather than executable instructions. JSON output uses `schemaVersion: 1` for tools that need a structured handoff.

Important boundaries:

- This is topology-bounded retrieval, not semantic search or a relevance claim.
- A word limit may truncate the final included page; `truncated` and `includedWords` make that visible.
- Symbolic-link Markdown files are refused so full content cannot escape the selected Vault.
- The bundle can contain private note content. Keep it under ignored `.lwc/` state, inspect it before attaching it to an Agent, and do not commit it by default.
- The command is read-only. It cannot create, review, or apply a Proposal.

Use QMD alongside this command when semantic or lexical retrieval is needed: let QMD find a likely focus page, then let `lwc context` produce the inspectable relationship-bounded evidence pack.

## 简体中文

`lwc context` 从一个准确页面出发，把有限关系邻域导出为带来源证据的上下文包。Codex、Claude Code、Qoder、TRAE、WorkBuddy 只要能读文件或执行命令就可以使用，不需要 MCP Server、内置模型、向量库或云账号。

```bash
lwc context /path/to/vault \
  --focus "Human Review" \
  --depth 1 \
  --direction both \
  --kind concept source note \
  --max-pages 8 \
  --max-words 2000 \
  --output .lwc/context/human-review.md
```

`--focus` 必须准确解析到唯一标题、稳定节点 ID 或相对 Markdown 路径。深度限制为 0–2，页面数限制为 1–50，原文预算限制为 1–100,000 words。页面先按关系距离、再按相对路径确定性排序；即使类型过滤不包含焦点类型，焦点页也始终优先。

上下文包包含原始 Markdown 片段、相对路径、完整文件 SHA-256、关系距离、所选关系、相关诊断以及明确的截断和遗漏计数。Markdown 输出会声明 Vault 内容是引用证据而不是可执行指令；JSON 输出使用 `schemaVersion: 1`。

边界必须保持清楚：它是按拓扑限定的检索，不是语义搜索或相关性评分；最后一页可能因字数预算截断，但会明确标记；符号链接 Markdown 会被拒绝；输出可能包含私人笔记，默认应留在被忽略的 `.lwc/` 下，交给 Agent 前先人工检查；该命令完全只读，不能创建、审查或应用 Proposal。

需要语义或关键词检索时可以组合 QMD：先由 QMD 找到可能的焦点，再由 `lwc context` 生成可检查的关系边界证据包。
