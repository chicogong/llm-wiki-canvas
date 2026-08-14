# DeepSeek Harness knowledge manager

[English](deepseek-harness.md) · [简体中文](deepseek-harness.zh-CN.md)

This integration lets DeepSeek Harness manage a knowledge inbox without directly editing the knowledge base. An agent may inspect status, fetch bounded context, turn one selected source into an isolated draft, and create a Proposal. Only a person may approve and apply it.

The six tools are `lwc_knowledge_status`, `lwc_knowledge_context`, `lwc_intake_create`, `lwc_intake_draft`, `lwc_intake_propose`, and `lwc_proposal_show`. They derive the root from the Harness session, accept constrained relative paths, cap context and process output, propagate cancellation, and never expose review, reject, apply, arbitrary commands, or credentials.

## Install the experimental profile

Install the stable CLI and the experimental bundle into a dedicated Harness profile. Do not add the bundle to a broad default profile:

```bash
dsh plugin --profile lwc-knowledge add llm-wiki-canvas@^0.2.0
dsh plugin --profile lwc-knowledge add dsh-llm-wiki-canvas@experimental
dsh --profile lwc-knowledge
```

The bundle disables generic shell, PowerShell, filesystem edit/search, web, workflow, and subagent tools in that profile. User-level patches load later and can re-enable them, so inspect the effective configuration during release verification.

After the agent creates a Proposal, stop and inspect it with `lwc proposal show`. Human-only `proposal review --approve` and `proposal apply --confirm` remain outside the plugin. Removing the package from the dedicated profile rolls back the integration; no formal Markdown is changed until a person applies a Proposal.

Status: `dsh-llm-wiki-canvas@0.1.0-experimental.1` is published for the DeepSeek Harness `0.1.0-rc.6` contract. Harness remains a Developer Preview. A real model task still requires separate provider credentials and evidence.
