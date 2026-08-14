---
title: Agent Skills
type: concept
tags: [智能体, 工作流, 开放格式]
summary: 用 SKILL.md、脚本和参考资料封装可复用工作流的轻量开放格式。
---

# Agent Skills

Agent Skills 用一个包含 `SKILL.md` 的目录封装专门知识和工作流，也可以携带脚本、参考资料与模板。

Skills 采用渐进披露：宿主先读取名称和描述，任务匹配后再加载完整说明。它适合表达“如何可靠完成工作”，并能被多个智能体宿主复用。

参见 [[../sources/Agent Skills 规范]]。在 [[../decisions/LWC 与 DeepSeek Harness]] 中，Skill 是 LWC 当前的稳定接入层。
