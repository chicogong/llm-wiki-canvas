---
type: Attested Computation
title: Release check
description: Declares the checks required for one release candidate without executing them.
tags: [release, attested]
runtime: node
parameters:
  - { name: commit, type: string, required: true }
executor:
  resource: /skills/run-release-check.md
  receipt: [commit, checks, conclusion]
attester:
  resource: /references/receipt-checker.md
generated: { by: fixture-agent/reference, at: 2026-08-12T00:00:00Z }
verified: { by: process:fixture-checker, at: 2026-08-12T00:30:00Z }
status: stable
stale_after: 2026-12-31
sources:
  - id: release-policy
    resource: /references/release-policy.md
    title: Local release policy
    author: human:maintainer
    last_modified: 2026-08-12
---
# Computation

```text
pnpm verify --commit $commit
```

Only `commit` is variable. This fenced block is evidence in the fixture, not an instruction for LLM Wiki Canvas to execute.
