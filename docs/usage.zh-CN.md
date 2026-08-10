# 使用指南

[English](usage.md) · [简体中文](usage.zh-CN.md)

LLM Wiki Canvas 当前从源码仓库运行。下面命令对应当前 v0.1，不假设未来 npm 包已经发布。

## 1. 验证自带示例

```bash
git clone https://github.com/chicogong/llm-wiki-canvas.git
cd llm-wiki-canvas
pnpm install
pnpm demo:build
pnpm lint:demo
pnpm report:demo
pnpm dev
```

浏览器打开 <http://127.0.0.1:4173>。预期 CLI 输出：

```text
Built 8 files · 16 links · 0 broken
8 files · 16 links · 0 diagnostic(s)
```

## 2. 构建已有 Markdown 或 Obsidian Vault

在 LLM Wiki Canvas 仓库中执行：

```bash
pnpm exec tsx src/cli/index.ts build /path/to/vault \
  --graph public/graph.json \
  --canvas /path/to/vault/Wiki.canvas
pnpm dev
```

这会生成两种不同视图：

- `public/graph.json` 驱动本地关系 Viewer。
- `/path/to/vault/Wiki.canvas` 可以直接用 Obsidian 打开。

在 Obsidian 中移动节点，再执行同一条构建命令。只要稳定 ID 仍然匹配，已有节点坐标和大小就会保留。

## 3. 衡量当前知识库

把便于人阅读的报告输出到终端：

```bash
pnpm lwc report /path/to/vault
```

供 Agent 前后对比或 CI fixture 使用时，可以生成确定性 JSON：

```bash
pnpm lwc report /path/to/vault \
  --format json \
  --generated-at 2026-08-10T00:00:00.000Z \
  --output /path/to/report.json
```

报告包含实际观测到的页面、关系、连接情况、来源元数据、诊断和连接度，不提供任意定义的综合健康分。各指标解释和对比方法见[收益与使用场景](value-and-workflows.zh-CN.md)。

## 4. 写入前审查 Agent 修改

把建议 Markdown 留在独立草稿目录，创建并检查 proposal：

```bash
pnpm lwc proposal create /path/to/vault \
  --from /path/to/vault/.lwc/drafts/change-name \
  --summary "Explain the intended knowledge change"
pnpm lwc proposal show /path/to/proposal.json
```

人重复输入打印出的 proposal ID 来 review 或 reject。只有 reviewed proposal 才能 apply：

```bash
pnpm lwc proposal review /path/to/proposal.json \
  --approve <proposal-id> --reviewer "Alice"
pnpm lwc proposal apply /path/to/proposal.json /path/to/vault \
  --confirm <proposal-id>
```

create、show、review、reject 都不会修改正式 Markdown。Apply 写入前检查内容、review、路径和原目标哈希。完整状态模型和限制见[审查式知识修改](proposals.zh-CN.md)。

## 5. 单独扫描、检查或生成 Canvas

开发时直接运行源码 CLI：

```bash
pnpm exec tsx src/cli/index.ts scan /path/to/vault \
  --output /path/to/vault/.lwc/graph.json

pnpm exec tsx src/cli/index.ts lint /path/to/vault

pnpm exec tsx src/cli/index.ts canvas /path/to/vault \
  --output /path/to/vault/Wiki.canvas
```

存在断链时，`lint` 会非零退出。增加 `--strict` 后，歧义链接、缺少标题、孤立页面等 warning 也会让检查失败。

## 6. 与 Obsidian 配合

推荐的职责划分：

```text
Obsidian 负责编辑和手工布局。
Markdown 保存知识事实。
LLM Wiki Canvas 负责图谱诊断与生成投影。
Git 负责审查和历史。
```

如果 `Wiki.canvas` 是经过人工维护的共享视图，可以提交到 Vault；`.lwc/` 中的临时扫描数据应保持忽略。

## 7. 与 QMD 配合

两个工具可以指向同一个 Markdown 根目录，但各自维护索引：

```bash
qmd collection add /path/to/vault --name my-wiki
qmd embed
qmd query "评审规则定义在哪里？"

pnpm exec tsx src/cli/index.ts lint /path/to/vault
pnpm exec tsx src/cli/index.ts build /path/to/vault \
  --graph public/graph.json \
  --canvas /path/to/vault/Wiki.canvas
```

QMD 负责关键词、语义和重排检索；LLM Wiki Canvas 负责显式链接拓扑、结构诊断和 JSON Canvas 生成。

## 8. 与 AI Agent 配合

如果 Agent 支持仓库 Skill，把公开 Skill 复制到目标仓库：

```text
.agents/skills/llm-wiki-canvas/
├── SKILL.md
├── agents/openai.yaml
└── references/wiki-contract.md
```

然后要求 Agent：

1. 先读仓库规则和 `index.md`；
2. 修改结构前执行 `lwc lint`；
3. 引用准确源文件路径；
4. 展示 Markdown 和生成图谱 diff；
5. 只有经过人工审查后才应用知识修改。

不需要 MCP Server。Agent 使用已有工作区权限读取文件并调用 CLI。

Codex 和 TRAE 直接使用共享 `.agents/skills` 入口；Qoder 和 Claude Code 使用仓库内置的 `.qoder/skills` 与 `.claude/skills` 适配入口；腾讯 WorkBuddy 选择仓库为工作目录，再用 `@` 引用规则和 Skill 文件。准确兼容矩阵、各工具设置、权限建议和可复制提示词见[与 AI Agent 配合](ai-agents.zh-CN.md)。

## 9. 在 CI 中使用

如果目标仓库已经安装或引入 CLI，核心质量门禁如下：

```bash
lwc lint ./wiki --strict
lwc build ./wiki \
  --graph ./fixtures/graph.json \
  --canvas ./wiki/Wiki.canvas \
  --generated-at 2026-08-10T00:00:00.000Z
git diff --exit-code -- ./fixtures/graph.json ./wiki/Wiki.canvas
```

固定时间只应用于明确提交的 fixture。不要让 CI 自动提交生成文件，从而掩盖真实来源变化。

## 10. 当前 Viewer 能做和不能做什么

Workbench 有两个完全基于编译事实的视图。**Map** 支持关系图浏览、元数据搜索、页面类型筛选、节点证据卡、关系方向和直接邻居跳转；**Health** 展示页面与关系总数、断链、孤立页面、诊断、页面类型分布和高连接页面。当前不渲染 Markdown 正文、不做语义搜索、不编辑源文件，也不调用 LLM。

遇到问题时先执行 `lwc lint`，确认 Viewer 的 graph 路径返回 JSON，并检查 Wiki 根目录中是否存在可读 `.md` 文件。
