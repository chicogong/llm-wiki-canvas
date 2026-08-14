---
title: LWC 与 DeepSeek Harness
type: note
tags: [LWC, DeepSeek Harness, 决策]
summary: 先复用 Harness 自动发现的 Agent Skill；原生插件保持只读、实验性并单独验证。
---

# LWC 与 DeepSeek Harness

当前决策：优先使用 [[../concepts/Agent Skills]] 接入 [[../sources/DeepSeek Harness]]。

Harness 会从项目的 `.agents/skills` 发现 LWC Skill。Agent 可以调用受限的 `lwc context . --format json` 和 `lwc proposal show <relative-path>` 来读取有限证据。

原生插件如果立项，只提供 `lwc_context` 与 `lwc_proposal_show` 两个只读工具；工作目录由 Harness 掌控，不接受任意绝对路径，不暴露 review、reject、apply、serve 或任意命令执行。

在 Harness 结束 Developer Preview、插件 API 有稳定发布并完成真实目录发现测试前，不把“契约兼容”表述成“生产可用”。
