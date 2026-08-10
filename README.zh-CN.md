# LLM Wiki 画布

一个面向 Codex、Claude Code、WorkBuddy 与 Obsidian 的本地可视化知识工作区。Markdown 是事实源，CLI 负责编译关系、检查断链并生成可编辑的 JSON Canvas；项目不内置 LLM、向量数据库、聊天界面或 MCP。

## 快速开始

```bash
pnpm install
pnpm demo:build
pnpm dev
```

浏览器打开 `http://127.0.0.1:4173`。执行 `pnpm check` 可完成核心单测、示例编译、生产构建和 Skill 校验；执行 `pnpm verify` 还会安装真实 npm 打包产物并测试生产 Viewer。

当前 v0.1 已支持 Markdown/YAML/WikiLink 解析、稳定关系 ID、断链与孤立页定位、Obsidian Canvas 增量位置保留、关系图搜索筛选，以及仓库级 Agent Skill。`AGENTS.md`、`CLAUDE.md` 与 `.agents/` 规则文件不会混入知识图谱。
