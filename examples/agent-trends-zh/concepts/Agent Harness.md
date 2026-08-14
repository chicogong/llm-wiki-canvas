---
title: Agent Harness
type: concept
tags: [智能体, 运行时, 插件]
summary: 负责把模型、工具、权限、会话和插件组合成可运行智能体的工程层。
---

# Agent Harness

Agent Harness 不是模型本身。它把模型调用、工具执行、权限、会话、上下文和扩展机制组合成可运行系统。

[[../sources/DeepSeek Harness]] 以“Everything is a Plugin”为核心架构。对产品团队而言，Harness 的价值来自可组合性；风险则来自权限放大、插件生命周期和快速变化的接口。

可复用流程通常由 [[Agent Skills]] 提供，连接外部系统时再评估 [[MCP]]。
