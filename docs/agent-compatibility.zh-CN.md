# Agent 兼容性验证

[English generated matrix](agent-compatibility.md) · [简体中文](agent-compatibility.zh-CN.md)

LLM Wiki Canvas 不用“能读 Markdown”冒充完整兼容。`lwc agents` 检查一个工作区中实际存在的共享规则、Canonical Skill 和宿主适配入口，并把结果输出为 Markdown 或 JSON。

新工作区先运行安全初始化预览：

```bash
lwc init /path/to/workspace
lwc init /path/to/workspace --agents codex,claude-code,qoder
lwc init /path/to/workspace --write
```

默认只生成计划。`--write` 也只创建缺失文件；已有且有效的自定义规则会保留，一个过期文件、符号链接或目录冲突会阻止整批写入。Canonical Skill、Codex metadata 和 Wiki contract 来自当前安装包，不维护隐藏的第二份 Skill 模板。

```bash
lwc agents /path/to/workspace
lwc agents /path/to/workspace --strict
lwc agents /path/to/workspace --format json -o .lwc/agents.json
```

状态含义：

- **ready**：所需规则和 Skill 入口存在、是普通文件，并且指向同一份 Canonical Skill。
- **manual**：共享契约有效，但宿主需要显式附加文件或工作区上下文；当前 WorkBuddy 属于这一类。
- **incomplete**：至少一个文件缺失、是符号链接，或仍指向过期/复制的工作流；`--strict` 会返回非零状态。

当前公开矩阵由 `pnpm agents:matrix` 从仓库文件生成，并由 `pnpm generated:check` 防止文档与实现漂移。它验证的是仓库集成契约，不代表 Codex、Claude Code、Qoder、TRAE 或 WorkBuddy 的闭源二进制已经在 CI 中实际执行。

所有宿主必须遵循同一写入边界：Agent 可以检查知识、创建 Intake 和 Proposal；review、reject 与 apply 仍然是明确的人类控制操作。
