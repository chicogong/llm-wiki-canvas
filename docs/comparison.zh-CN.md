# 对比与决策指南

[English](comparison.md) · [简体中文](comparison.zh-CN.md)

最后核对：**2026-08-14**

这里比较的是当前产品边界，不是项目热度。各项目变化很快，最新细节应以文末官方资料为准。

图例：**是**代表当前一等能力；**部分**代表范围较窄、可选或依赖外围工作流；**否**代表它不是核心能力。“否”不表示永远不能通过插件或集成实现。

## 一句话怎么选

- Markdown 已经存在，需要给 Agent 修改增加证据边界、隔离草稿、精确 diff、完整性校验和人工写回：选 **LLM Wiki Canvas**。
- 主要由人日常写作、浏览、安装插件和进行广泛的应用内 CLI 自动化：选 **Obsidian**。
- Agent 最需要的是高质量本地检索：选 **QMD**。
- 希望 LLM 摄取来源文件并持续自动生成、维护个人 Wiki：选 **LLM Wiki**。
- 需要完整知识平台，包括多格式解析、RAG、Agent、服务、集成、权限和运维：选 **WeKnora**。

## 能力矩阵

| 能力 | LLM Wiki Canvas | Obsidian | QMD | LLM Wiki | WeKnora |
| --- | --- | --- | --- | --- | --- |
| 主要界面 | 无头 CLI + 本地 Viewer | 桌面/移动编辑器 + 官方 CLI | CLI + 库/MCP | 跨平台桌面应用 | Web/API/CLI/MCP 平台 |
| 已有 Markdown 作为主要输入 | **是** | **是** | **是**，作为文档索引 | **是**，raw/wiki/schema 工作流 | **部分**，托管知识源和生成 Wiki |
| 核心关系图/检查需要 LLM | **否** | **否** | **部分**，关键词不需要，语义/重排使用本地模型 | **是**，用于摄取和生成 | **是**，用于 Agent/Wiki/RAG |
| 自动综合生成 Wiki | **否** | 核心能力中**否** | **否** | **是** | **是**，Wiki Mode |
| PDF/Office/OCR 摄取流水线 | **否** | **部分**，偏阅读/导入生态，不负责综合 | **否**，不做 Wiki 综合 | **是** | **是**，支持广泛格式 |
| 关键词检索 | Viewer 字符串过滤 | **是** | **是**，BM25 | **是** | **是** |
| 向量/混合检索 | **否** | 依赖插件 | **是** | 可选向量 + 图相关性 | **是**，多种检索引擎 |
| 关系图 | **是**，由显式链接编译 | **是** | 没有可视关系图 | **是**，多信号关系图 | **是**，Wiki/知识图谱 |
| 确定性结构检查 | **是** | **部分** | **否** | **部分**，提供不同契约的 Lint/健康工作流 | 偏托管验证，不是同一文件契约 |
| 可编辑 JSON Canvas 生成 | **是** | **是**，原生编辑 Canvas | **否** | 没有一等导出器 | 没有一等导出器 |
| 稳定 ID 和可复现图 fixture | **是** | 不是主要契约 | 索引可重建 | 由应用管理 | 由服务管理索引 |
| Agent 集成 | 仓库 Skill + 无头 CLI | 官方 CLI、文件和插件生态 | CLI + MCP | 本地 API + Agent Skill | API + CLI + MCP + Skills |
| 来源绑定的隔离草稿 | **是**，一份选定来源与一个声明目标 | 可通过文件流程实现，不是核心审查契约 | **否** | 由应用管理生成流程 | 由平台管理 Wiki/Agent 流程 |
| 写回前的哈希绑定 Proposal | **是** | 依赖 Git 或插件 | **否** | 产品特定 Review 流程 | 有确认与平台工作流，但不是同一文件契约 |
| 内置聊天 | **否** | 核心能力中**否** | 没有通用聊天 UI | **是** | **是** |
| 团队 RBAC 和服务运维 | **否** | 不是平台 RBAC | **否** | 偏个人本地 | **是** |
| 典型运行成本 | Node CLI + 静态 Viewer；无需应用进程 | 安装桌面应用；官方 CLI 需要 Obsidian 正在运行 | Node CLI；语义模式下载本地模型 | 桌面应用 + 模型提供方 | Docker/服务部署 + 基础设施配置 |

## 最重要的产品边界

LLM Wiki Canvas 不是“更小的 WeKnora”，也不是第二个 LLM Wiki 桌面应用。它交付的是一次受控知识变更：

```text
选定来源
  → 哈希绑定的隔离草稿
  → 精确 Proposal 与关系影响
  → 人工决定
  → 正式 Markdown
```

编译器不决定 Wiki 应该写什么。LWC 在正式 Markdown 改变前把 Agent 交接变成可检查证据；Git 继续负责仓库历史与协作。图谱、Canvas 和诊断服务于审查，不再定义整个产品。

## 哪些情况应该选其他工具

### 应该选 Obsidian

主要任务是写作、导航、标签、嵌入媒体或使用丰富插件时，选择 Obsidian。Obsidian 把笔记存为本地 Markdown，也支持 JSON Canvas，因此它更适合作为 `lwc` 周围的人工工作台，而不是必须替换的竞争产品。

推荐组合：在 Obsidian 编辑，在 CI 中执行 lint，重新生成精选 `.canvas` 时保留人工位置。

Obsidian 官方 CLI 已覆盖广泛的应用内自动化，包括读、搜、写、任务、标签、未解析链接、插件开发和截图。它要求安装当前版本的 Obsidian、明确启用 CLI，并保持 Obsidian 应用运行。Obsidian 还把 Headless Sync 作为独立的服务器同步产品。LLM Wiki Canvas 不应复制这些通用命令；它更窄的价值是仓库原生编译与审查边界：确定性的图谱/Canvas 产物、精确结构诊断、带来源哈希且范围受限的 Agent 上下文，以及必须经过人工审查才可应用的提案。

### 应该选 QMD

主要问题是从大量本地文档找到相关段落时，选择 QMD。QMD 提供 BM25、向量搜索、查询扩展和本地 LLM 重排。LLM Wiki Canvas 只过滤图谱元数据，不宣称语义检索。

推荐组合：两个工具指向同一个 Markdown 根目录。QMD 回答“哪些段落相关”，`lwc` 回答“Agent 收到了哪些有边界的证据、准备改什么、当前是否仍可安全写回”。

### 应该选 LLM Wiki

希望桌面应用导入 PDF、DOCX、Markdown、图片或监控目录，并由 LLM 综合生成持续维护的互链 Wiki 时，选择 LLM Wiki。它还包括聊天、搜索、图谱洞察、Review 和 Agent 本地 API。

只有当你特别需要可复现 JSON 图谱 fixture，或希望把这些 Markdown 页面变成可编辑 Obsidian Canvas 时，才需要再把 LLM Wiki Canvas 作为下游编译器。

### 应该选 WeKnora

需要企业知识系统而不是文件编译器时，选择 WeKnora。其当前平台覆盖广泛文档解析、多种检索引擎和向量库、RAG 问答、ReAct Agent、Wiki Mode、API、MCP、IM/数据源集成、RBAC、任务管理和可观测性。

不要把 LLM Wiki Canvas 当作这些运维能力的替代品。本项目有意不包含服务端、模型管理、解析集群、租户模型或访问控制层。

## 官方资料

- [LLM Wiki Canvas README](../README.zh-CN.md)
- [Obsidian 官方介绍](https://obsidian.md/help/obsidian)、[数据存储方式](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata)与[官方 Obsidian CLI](https://obsidian.md/cli)
- [QMD 官方仓库](https://github.com/tobi/qmd)
- [LLM Wiki 官方仓库](https://github.com/nashsu/llm_wiki)
- [WeKnora 官方仓库](https://github.com/Tencent/WeKnora)
- [JSON Canvas 1.0 规范](https://jsoncanvas.org/spec/1.0/)

如果某个项目发生实质变化，请附官方来源提交 Issue 或 PR，并更新核对日期。
