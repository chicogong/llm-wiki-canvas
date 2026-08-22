# Host runtime fixtures

[English](#english) · [简体中文](#简体中文)

## English

Repository compatibility and host execution are different claims. `lwc agents . --strict` verifies checked-in rules and Skill adapters. The host fixture asks an installed CLI to complete one synthetic intake-to-proposal task, then independently validates the files it produced.

### Safe default

```bash
pnpm build
pnpm test:hosts
```

This deterministic reference driver runs in normal CI. It copies [`examples/host-fixture`](../examples/host-fixture/) to a temporary directory, creates one isolated draft and proposal, checks provenance and proposal semantics, proves that formal Markdown stayed unchanged, and deletes the temporary directory.

### Opt-in live hosts

Review the fixture and account impact first. Live commands are disabled unless the explicit environment flag is present:

```bash
LWC_RUN_HOST_FIXTURE=1 pnpm test:host:codex
LWC_RUN_HOST_FIXTURE=1 pnpm test:host:claude
```

The runner uses a synthetic workspace and tells each host to stop before `review`, `reject`, `apply`, or commit. Codex runs ephemerally, without user configuration, in its workspace-write sandbox; Claude Code receives only local Read/Write/Edit/Bash tools and explicitly has WebSearch/WebFetch disabled. The runner does not log in, repair credentials, or bypass the host's own permissions. Output reports are machine-local under `.lwc/host-runtime/` and must not be committed.

### Evidence states

| Status | Evidence kind | Meaning |
| --- | --- | --- |
| `passed` | `deterministic-reference` | The local harness and expected semantics passed without a model. |
| `passed` | `host-runtime` | The named installed host produced a valid proposal from the public fixture. |
| `pending` | `compatibility-fixture` | The local WorkBuddy-compatible contract passed, but a real WorkBuddy workspace has not run it. |
| `blocked` | `host-attempt` | Execution reached a prerequisite such as authentication but could not continue. |
| `unavailable` | `host-attempt` | The requested executable was not installed. |
| `failed` | `host-attempt` | The host ran or was invoked but did not satisfy the command or semantic contract. |

Only `host-runtime` is evidence that a proprietary host actually completed the task. A `ready` static adapter, blocked login, or unavailable binary is not a runtime pass.

For D0/D+7 adoption checks, the same fixture also covers bounded context, Proposal rendering, and the unreviewed-apply blocker:

```bash
npm run adoption:quickstart
npm run adoption:workbuddy-compat
```

The second command deliberately returns `pending / compatibility-fixture`; it must never be relabeled as a WorkBuddy runtime pass. See [D0 / D+7 adoption validation](adoption-validation.md).

Maintainer observation on 2026-08-11: the deterministic reference passed; Codex CLI `0.147.0` passed a live run; Claude Code `2.1.223` was attempted but blocked because local authentication was unavailable; Qoder, TRAE, and WorkBuddy CLIs were not available in that environment. These observations are not CI guarantees and will drift with local installations and accounts.

## 简体中文

仓库兼容与真实宿主执行是两种不同结论。`lwc agents . --strict` 只验证已提交的规则与 Skill 适配；Host fixture 则让已安装 CLI 完成一项合成的 Intake-to-Proposal 任务，再由独立脚本检查生成文件。

### 安全默认项

```bash
pnpm build
pnpm test:hosts
```

确定性 reference driver 会进入普通 CI。它把 [`examples/host-fixture`](../examples/host-fixture/) 复制到临时目录，只创建一份隔离草稿和 Proposal，验证来源、生命周期和正式 Markdown 未变，然后删除临时目录。

### 显式启用真实宿主

先检查 fixture 和账号消耗；没有显式环境变量时，真实宿主命令会拒绝运行：

```bash
LWC_RUN_HOST_FIXTURE=1 pnpm test:host:codex
LWC_RUN_HOST_FIXTURE=1 pnpm test:host:claude
```

Runner 使用合成工作区，并要求所有宿主在 `review`、`reject`、`apply` 或 commit 前停止。Codex 以临时会话、忽略用户配置并在 workspace-write sandbox 内运行；Claude Code 只得到本地 Read/Write/Edit/Bash 工具，并明确禁用 WebSearch/WebFetch。Runner 不会代替用户登录、修复凭据或绕过宿主权限。报告只保留在本机 `.lwc/host-runtime/`，不得提交。

证据状态与上表一致：只有 `passed / host-runtime` 能证明闭源宿主真实完成了任务；`pending / compatibility-fixture` 只证明本地 WorkBuddy 兼容契约，静态 `ready`、登录阻塞和未安装也都不是运行通过。D0/D+7 复跑命令和记录字段见 [采用验证记录](adoption-validation.md)。

维护者在 2026-08-11 的一次环境观测是：确定性基准通过；Codex CLI `0.147.0` 真实运行通过；Claude Code `2.1.223` 已发起但因本地认证不可用而阻塞；该环境没有 Qoder、TRAE 与 WorkBuddy CLI。它们不是 CI 承诺，会随本机安装与账号状态变化。
