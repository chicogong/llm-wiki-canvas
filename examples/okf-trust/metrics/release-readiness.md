---
type: Metric
title: Release readiness
description: A release is ready only when its public checks pass and a person accepts the candidate.
tags: [release, trust, local-first]
generated: { by: fixture-agent/reference, at: 2026-08-12T00:00:00Z }
verified: { by: human:maintainer, at: 2026-08-12T01:00:00Z }
status: stable
stale_after: 2026-12-31
sources:
  - id: release-policy
    resource: /references/release-policy.md
    title: Local release policy
    author: human:maintainer
    last_modified: 2026-08-12
---
# Definition

A release candidate needs reproducible source tests, packaged CLI checks, production browser tests, and explicit human acceptance.[^release-policy]

Use the [sanctioned release check](/computations/release-check.md) as evidence. Passing that check does not publish a package and does not replace the human decision.

[^release-policy]: Local release policy
