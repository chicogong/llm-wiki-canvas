# DeepSeek Harness knowledge manager

[English](deepseek-harness.md) · [简体中文](deepseek-harness.zh-CN.md)

This integration lets DeepSeek Harness manage a knowledge inbox without directly editing the knowledge base. An agent may inspect status, fetch bounded context, turn one selected source into an isolated draft, and create a Proposal. Only a person may approve and apply it.

The six tools are `lwc_knowledge_status`, `lwc_knowledge_context`, `lwc_intake_create`, `lwc_intake_draft`, `lwc_intake_propose`, and `lwc_proposal_show`. They derive the root from the Harness session, accept constrained relative paths, cap context and process output, propagate cancellation, and never expose review, reject, apply, arbitrary commands, or credentials.

## Local evaluation

Build both tarballs and install them into a dedicated Harness profile before publication:

```bash
pnpm build
pnpm --dir integrations/deepseek-harness test
npm pack
npm pack --prefix integrations/deepseek-harness
dsh plugin --profile lwc-knowledge add <llm-wiki-canvas.tgz>
dsh plugin --profile lwc-knowledge add <dsh-llm-wiki-canvas.tgz>
dsh --profile lwc-knowledge
```

The bundle disables generic shell, PowerShell, filesystem edit/search, web, workflow, and subagent tools in that profile. User-level patches load later and can re-enable them, so inspect the effective configuration during release verification.

After the agent creates a Proposal, stop and inspect it with `lwc proposal show`. Human-only `proposal review --approve` and `proposal apply --confirm` remain outside the plugin. Removing the package from the dedicated profile rolls back the integration; no formal Markdown is changed until a person applies a Proposal.

Status: experimental contract for DeepSeek Harness `0.1.0-rc.6`. Harness remains a Developer Preview. npm publication and a real model task require separate evidence and approval.
