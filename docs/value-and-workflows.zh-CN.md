# 收益与使用场景

[English](value-and-workflows.md) · [简体中文](value-and-workflows.zh-CN.md)

LLM Wiki Canvas 的收益不是“AI 自动写了多少内容”，也不是图谱看起来多复杂，而是把一次不透明的 Agent 文件修改，变成来源绑定、哈希校验、可由人审查后再写回的 Proposal。

## 用户真正痛苦的时刻

Agent 已经生成了一段看起来合理的 Markdown。审查人仍然需要知道：它收到了什么证据、来源或目标是否已经变化、具体文字和关系会怎样改变，以及最终写入的是否仍是刚刚审查的内容。LWC 用文件和校验保留这些答案，不依赖 Agent 自己解释“我做了什么”。

## 两分钟看到结果

在项目源码仓库中：

```bash
pnpm install
pnpm report:demo
pnpm demo:build
pnpm dev
```

`report:demo` 输出基于真实扫描结果的 Wiki health report；`demo:build` 生成 `graph.json` 和 Obsidian Canvas；Viewer 在 <http://127.0.0.1:4173> 打开。

当前示例可以验证：

| 信号 | 实际结果 | 能说明什么 |
| --- | ---: | --- |
| Markdown 页面 | 8 | 本次检查的明确范围 |
| 有效关系 | 16 | 可以沿图谱检查的显式连接 |
| 已连接页面 | 8 / 8 | 没有游离在关系图外的页面 |
| 带 `source` 元数据的页面 | 2 / 8 | 可检查的来源声明，不等于自动证明内容正确 |
| 结构错误 / 警告 | 0 / 0 | 当前编译器没有发现断链、歧义、缺标题或孤立页面 |

这些是仓库当前状态的观测值，不是通用性能基准，也不代表虚构的“健康分”。

## 五类直接收益

### 1. 限定 Agent 获得的证据

从一个准确页面出发，同时限制披露范围和 Prompt 大小，不再附加整个 Vault：

```bash
lwc context /path/to/vault --focus "Human Review" --depth 1 --max-pages 8 --max-words 2000
```

结果保留相对路径、完整文件 SHA-256、关系距离和截断/遗漏计数。这里的价值是范围可以复现，并不宣称拓扑检索替代语义检索。

### 2. 让生成内容留在正式知识之外

捕获一份明确来源，保存快照与哈希，Agent 只能编辑声明过的草稿目标。Intake 转成 Proposal 时会重新检查来源、快照、范围和草稿，之后才进入 Review。

### 3. 审查并校验实际变化

Changes 展示来源和目标哈希、精确 diff、关系影响与冲突。来源、草稿、Proposal 或目标文件任一漂移，原交接自动失败。Review 和 Apply 仍由人负责。

### 4. 理解并检查周围的知识库

以前需要逐个打开文件和沿链接跳转；现在先运行报告定位入口和高连接页面，再在 Viewer 中查看一跳关系。

```bash
pnpm lwc report /path/to/vault
pnpm lwc scan /path/to/vault -o public/graph.json
pnpm dev
```

可验证结果包括页面总数、关系总数、高连接页面、页面类型和本地源路径。

结构理解和 lint 服务于决策，不能替代事实审查。

把“链接是不是坏了”从人工感觉变成可以进入本地检查和 CI 的命令：

```bash
pnpm lwc lint /path/to/vault
pnpm lwc lint /path/to/vault --strict
```

默认模式遇到错误失败；`--strict` 会把歧义链接、缺标题和孤立页面等警告也作为失败。每条诊断包含错误码与文件路径。

### 5. 重建解释视图而不用重复画图

从 WikiLink 自动生成 JSON Canvas，然后在 Obsidian 中人工整理。再次构建时复用已有节点位置。

```bash
pnpm lwc build /path/to/vault \
  --graph public/graph.json \
  --canvas /path/to/vault/Wiki.canvas
```

自动化负责建立和更新连接；人负责空间布局与最终表达。

## 三种推荐用法

### 个人 Obsidian Vault

1. 用 Obsidian 正常编辑 Markdown。
2. 每次整理后执行 `lwc lint`。
3. 用 `lwc build` 更新关系 Viewer 和 `Wiki.canvas`。
4. `.lwc/` 保持为本地临时状态；只有经过选择的 Canvas 或 fixture 才提交。

### Agent 维护的项目 Wiki

1. 把 `AGENTS.md` 和 `llm-wiki-canvas` Skill 放进仓库。
2. 要求 Agent 先运行 `report` 和 `lint`，只读描述现状。
3. 对最小相关焦点使用 `context`，把输出交给 Agent 前检查路径、哈希和预算证据。
4. 对明确选择的来源先执行 `intake create`；Agent 只编辑声明的 `.lwc/drafts/<intake-id>/<target>`，再执行 `intake show` 和 `intake propose`。只有没有外部来源的维护任务才直接使用 `proposal create`。
5. 人执行 `proposal review` 或 `proposal reject`；只有 reviewed proposal 才能 apply。
6. Apply 后重新执行 `report`、`lint` 和 `build`，检查源文件与生成产物 diff。

可直接复制的任务：

```text
使用 llm-wiki-canvas Skill。先运行 report 和 lint，只读说明当前页面规模、连接情况、来源元数据、结构诊断和高连接页面。用 lwc context 导出最小相关焦点，在使用引用证据前展示页面/字数限制、哈希、截断和遗漏。
对于明确选择的 Markdown/文本来源，创建只声明一个目标的 Intake，只编辑打印出的草稿，展示来源哈希，再转换为 Proposal。没有外部来源的维护任务可以直接从隔离草稿创建 Proposal。停在 review/apply 之前；人作出决定后，只用准确 ID 应用 reviewed proposal，再运行 report、lint 和 build 并对比结果。
```

准确命令与安全限制见[受控资料进入知识库](intake.zh-CN.md)和[审查式知识修改](proposals.zh-CN.md)。

### 团队 CI 门禁

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

固定时间只用于需要提交的可复现 fixture。日常报告应保留真实生成时间。

## 如何理解报告

- **Resolved relationships**：成功解析并去重后的 WikiLink、Markdown 链接和嵌入关系。
- **Connected pages**：至少有一条有效入边或出边的页面，不代表内容质量。
- **Pages with source metadata**：frontmatter 中声明了 `source` 的页面，不代表来源已经自动验证。
- **Most connected pages**：按照有效入边加出边排序，帮助发现入口和枢纽，不等同于页面重要性评分。
- **Errors / warnings**：编译器可以确定的结构问题；没有诊断不代表事实完全正确。

## 不应声称的收益

在没有真实用户研究或基准测试前，不声称：

- 节省固定百分比的时间；
- 自动提高答案准确率；
- 关系多就代表知识质量高；
- 有 `source` 字段就完成了事实核验；
- Agent 可以不经人工审查直接维护正式知识。

当前可以可靠声称的是：同一批 Markdown 能确定性地产生结构报告、诊断、关系图和可编辑 Canvas，并能通过 Git 与 CI 检查这些变化。
