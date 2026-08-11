# Examples / 示例

[English](#english) · [简体中文](#简体中文)

## English

### Agent Knowledge Atlas

[`atlas-wiki`](atlas-wiki/) is the canonical end-to-end example. It is intentionally small enough to inspect by hand and complete enough to exercise all v0.1 page types and outputs.

It demonstrates:

- an index that links concepts, sources, workflow notes, and a maintenance log;
- YAML metadata and WikiLinks with paths and aliases;
- repository instructions that are excluded from the graph;
- deterministic graph compilation;
- a clean `lwc lint` result;
- an editable Obsidian JSON Canvas;
- an editable Excalidraw relationship scene;
- a searchable local relationship Viewer.

Build and check it from the repository root:

```bash
pnpm demo:build
pnpm lint:demo
pnpm report:demo
pnpm proposal:demo
pnpm dev
```

Expected compiler output:

```text
Built 8 files · 16 links · 0 broken
8 files · 16 links · 0 diagnostic(s)
```

The report additionally verifies **8 / 8 connected pages**, **2 / 8 pages with source metadata**, and the most-connected pages. It uses observed counts and intentionally does not invent a health score.

`proposal:demo` compares [`proposal-draft`](proposal-draft/) with the formal Atlas Wiki, writes an ignored local proposal, and prints a hash-bound diff. It never applies the example change.

Try these three checks in the Viewer:

1. Search for `review`; the graph should narrow to **1 / 8** pages.
2. Select **Human Review**; its evidence card should show its source path, tags, and neighboring pages.
3. Filter by **Source**; only source notes should remain emphasized.

Export the Human Review neighborhood in two equivalent formats:

```bash
pnpm lwc diagram examples/atlas-wiki --focus "Human Review" --depth 1 --format mermaid -o .lwc/examples/human-review.mmd
pnpm lwc diagram examples/atlas-wiki --focus "Human Review" --depth 1 --format excalidraw -o .lwc/examples/human-review.excalidraw
```

Both outputs contain **4 pages and 6 resolved relationships** from the same focused subgraph.

Then open [`atlas-wiki/Atlas.canvas`](atlas-wiki/Atlas.canvas) in Obsidian. Move a node and rebuild with the same output path: the compiler reuses that node's position.

Open [`atlas-wiki/Atlas.excalidraw`](atlas-wiki/Atlas.excalidraw) in Excalidraw to annotate the same relationship evidence with ordinary editable shapes and arrows.

Try the governed source-intake boundary with the synthetic [`intake-source/meeting.txt`](intake-source/meeting.txt):

```bash
pnpm lwc intake create examples/atlas-wiki \
  --source examples/intake-source/meeting.txt \
  --target "concepts/Meeting Decision.md" \
  --generator Codex
```

The command creates ignored local state under `examples/atlas-wiki/.lwc/drafts/`. It copies the source, records its SHA-256, and prints one placeholder draft. Edit that draft, then use the printed manifest with `lwc intake show` and `lwc intake propose`. Proposal conversion still does not apply the page.

The separate [`host-fixture`](host-fixture/) is the public cross-Agent execution case. `pnpm test:hosts` runs its deterministic reference implementation; explicitly enabled Codex or Claude Code runs must produce the same one-draft, one-proposal, zero-formal-write semantics. See [Host runtime fixtures](../docs/host-runtime.md).

### Copy the pattern

A minimal page looks like this:

```markdown
---
title: Human Review
type: concept
tags: [governance, agent]
summary: Agent changes remain proposals until a person accepts them.
---

# Human Review

Review is part of the knowledge lifecycle. See [[Agent Workflow]] and
[[sources/Karpathy Pattern]].
```

Start a new wiki with an `index.md`, add WikiLinks between ordinary Markdown files, and run:

```bash
lwc build /path/to/wiki \
  --graph /path/to/graph.json \
  --canvas /path/to/wiki/Wiki.canvas \
  --excalidraw /path/to/wiki/Wiki.excalidraw
lwc lint /path/to/wiki
```

## 简体中文

### Agent Knowledge Atlas

[`atlas-wiki`](atlas-wiki/) 是仓库的标准端到端示例。它足够小，可以人工逐页检查；同时也完整覆盖 v0.1 的页面类型和输出产物。

示例展示了：

- 一个连接概念、来源、工作流和维护日志的入口页；
- YAML 元数据，以及包含路径和别名的 WikiLink；
- 不会混入知识图谱的仓库规则文件；
- 确定性关系图编译；
- 无诊断问题的 `lwc lint`；
- 可继续编辑的 Obsidian JSON Canvas；
- 可继续编辑的 Excalidraw 关系场景；
- 可搜索的本地关系 Viewer。

在仓库根目录构建并检查：

```bash
pnpm demo:build
pnpm lint:demo
pnpm report:demo
pnpm proposal:demo
pnpm dev
```

预期编译输出：

```text
Built 8 files · 16 links · 0 broken
8 files · 16 links · 0 diagnostic(s)
```

报告还会验证 **8 / 8 个页面已连接**、**2 / 8 个页面声明来源元数据**，并列出高连接页面。它只使用实际观测值，不虚构综合健康分。

`proposal:demo` 会把 [`proposal-draft`](proposal-draft/) 与正式 Atlas Wiki 对比，生成一份被忽略的本地 proposal，并打印绑定哈希的 diff；它不会应用示例修改。

在 Viewer 中可以做三个验证：

1. 搜索 `review`，关系图应缩小到 **1 / 8** 个页面。
2. 选择 **Human Review**，证据卡应显示源文件路径、标签和相邻页面。
3. 按 **来源**筛选，只有来源笔记保持突出显示。

把 Human Review 邻域导出为两种等价格式：

```bash
pnpm lwc diagram examples/atlas-wiki --focus "Human Review" --depth 1 --format mermaid -o .lwc/examples/human-review.mmd
pnpm lwc diagram examples/atlas-wiki --focus "Human Review" --depth 1 --format excalidraw -o .lwc/examples/human-review.excalidraw
```

两份输出来自同一个局部子图，都包含 **4 个页面和 6 条有效关系**。

然后在 Obsidian 中打开 [`atlas-wiki/Atlas.canvas`](atlas-wiki/Atlas.canvas)，移动任意节点，再使用同一个输出路径重新构建；编译器会复用该节点的位置。

还可以在 Excalidraw 中打开 [`atlas-wiki/Atlas.excalidraw`](atlas-wiki/Atlas.excalidraw)，继续用普通可编辑图形和箭头标注同一份关系证据。

可以使用合成资料 [`intake-source/meeting.txt`](intake-source/meeting.txt) 验证受控资料边界：

```bash
pnpm lwc intake create examples/atlas-wiki \
  --source examples/intake-source/meeting.txt \
  --target "concepts/Meeting Decision.md" \
  --generator Codex
```

命令会在 `examples/atlas-wiki/.lwc/drafts/` 下创建被忽略的本地状态：复制来源、记录 SHA-256，并打印唯一的占位草稿。编辑草稿后，使用打印的 manifest 执行 `lwc intake show` 和 `lwc intake propose`；转换 Proposal 仍然不会直接应用页面。

独立的 [`host-fixture`](host-fixture/) 是公开的跨 Agent 运行案例。`pnpm test:hosts` 执行确定性基准；显式启用的 Codex 或 Claude Code 必须产生相同的“一份草稿、一份 Proposal、正式知识零写入”语义。详见 [Host 运行 fixture](../docs/host-runtime.md)。

### 复制这种模式

一个最小页面如下：

```markdown
---
title: Human Review
type: concept
tags: [governance, agent]
summary: Agent changes保持提案状态，直到人明确接受。
---

# Human Review

审查是知识生命周期的一部分。参见 [[Agent Workflow]] 和
[[sources/Karpathy Pattern]]。
```

创建 `index.md`，在普通 Markdown 文件之间加入 WikiLink，然后执行：

```bash
lwc build /path/to/wiki \
  --graph /path/to/graph.json \
  --canvas /path/to/wiki/Wiki.canvas \
  --excalidraw /path/to/wiki/Wiki.excalidraw
lwc lint /path/to/wiki
```
