# D0 unassisted validation package

This package prepares an internal, reversible validation protocol. It is not permission to invite a tester, and a completed template is not real-user evidence unless an independently authorized participant actually performed the recorded session.

## Canonical materials

Do not copy or edit these files for a session. They are the single sources of truth.

| Material | Canonical path | Purpose |
| --- | --- | --- |
| Public synthetic fixture | [`../../examples/host-fixture`](../../examples/host-fixture/) | Contains no private Vault or account data |
| Fixture hash manifest | [`../../examples/host-fixture/fixture.sha256`](../../examples/host-fixture/fixture.sha256) | Fixes the aggregate, source, task, and formal-baseline hashes |
| Only participant task | [`../../examples/host-fixture/task.md`](../../examples/host-fixture/task.md) | Ends at Proposal review; forbids review, reject, apply, commit, or formal-file edits |
| Technical D0/D+7 record | [`../adoption-validation.md`](../adoption-validation.md) | Keeps fixture and host-runtime evidence separate from user evidence |
| Blank observation record | [`d0-observation-record.md`](d0-observation-record.md) | Records one authorized session without personal identifiers |

The only bootstrap convention is: whenever the canonical task says `node "{{LWC_ENTRY}}"`, type `lwc` as the command prefix instead. Do not replace the token in the canonical task file because that would change the fixture hash.

## Five-minute installation

This first protocol is for an adult target user who already uses a coding Agent, can follow the canonical English task without translation, and has Node.js 22 or 24 plus npm available before the session. Record an ineligible or missing prerequisite as `blocked-prerequisite`; do not turn facilitator setup into a product pass.

The participant performs these steps without observer assistance. Start the installation timer immediately before the first command.

Prerequisite: Node.js 22 or 24 and npm are already available. If either is unavailable, record `blocked-prerequisite`; do not repair the machine during the timed session.

```bash
npm install --global llm-wiki-canvas@0.2.0
lwc --version
```

Expected version: `0.2.0`. Stop the timer when that exact version prints. At 5 minutes, record the actual state and continue only if the CLI is ready; do not hide an over-budget or failed installation.

Before any authorized session, the facilitator may create a disposable byte-for-byte copy of `examples/host-fixture` and verify it against the canonical manifest. The participant receives that copy and the sole instruction: **open `task.md`, treat `{{LWC_ENTRY}}` as `lwc`, and complete the task without help**.

## Observer rules

After the task timer starts, the observer must not:

- explain LWC concepts, translate the task, suggest commands, point at files, or interpret errors;
- type, click, approve permissions, repair installation, change configuration, or take control of the host;
- reveal expected hashes, Proposal content, target path, or pass criteria;
- prompt an accept/reject answer, propose the reason, or fill participant answers;
- ask the participant to bypass review, attempt apply, or mutate the formal baseline;
- expose, copy, or record credentials, account identifiers, private Markdown, session transcripts, or unrelated screen content.

The observer may stop the session for privacy, security, unexpected permissions, non-public data, or participant request. Record the stop verbatim without troubleshooting. Any other observer intervention makes `unassisted = no` and D0 cannot pass.

## What to time and record

Use the blank record for four timestamps:

1. installation start;
2. CLI ready;
3. task start;
4. Proposal first visible and participant decision stated.

`review_minutes` is the elapsed time from the Proposal first becoming visible until the participant states **accept** or **reject** and gives a reason. The decision is observational only: the participant must not run `proposal review`, `proposal reject`, or `proposal apply` in this D0 task.

Record the formal baseline SHA-256 before and after the session. If any formal Markdown changes before an approved review, mark `unapproved_write = yes`; never repair or conceal it inside the observation.

## D0 pass gate

D0 passes only when all are true:

- the pinned CLI becomes ready within 5 minutes;
- the fixture aggregate, source, task, and formal-baseline hashes match the canonical manifest before task start;
- the participant completes the sole task without observer help and reaches an inspectable Proposal diff;
- the participant independently states accept or reject and a reason;
- formal Markdown remains unchanged through the decision;
- an unreviewed apply is either not attempted or is blocked; an unexpected write or apply is a failure;
- no private data, extra permission, account connection, or non-public material enters the session record.

Report failure, blocked, and not-observed states as written. A synthetic session, compatibility fixture, CI run, static demo, or HTTP response must never be relabeled as independent user evidence.

## D+7 natural reuse decision

At seven elapsed days after D0, classify the participant using only behavior observed during the preceding seven-day window:

- **natural-reuse: yes** — the same participant independently selected LWC for a second eligible Markdown-change task, without a reminder, scheduled rerun, LWC-specific prompt, observer help, or extra incentive, and reached a human accept/reject decision;
- **natural-reuse: no** — an eligible second task occurred, but the participant did not choose LWC or abandoned it before the review decision;
- **natural-reuse: not-observed** — no eligible second task was observed, permission to observe was absent, or the only event was a prompted/scheduled rerun.

A scheduled D+7 fixture replay may prove technical repeatability, but it cannot satisfy `natural-reuse: yes`. External recruitment, outreach, incentives, and observation remain blocked until the CEO separately authorizes the exact user-validation scope.
