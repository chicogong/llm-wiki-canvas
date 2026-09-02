# D0 unassisted observation record

Copy this blank record only after a participant session is separately authorized. Use a non-identifying participant code; do not record names, email addresses, account IDs, private files, credentials, screenshots, or host transcripts.

## Session identity

| Field | Observed value |
| --- | --- |
| Participant code | |
| Observer code | |
| Session date and timezone | |
| Candidate commit (`git rev-parse HEAD`) | |
| Host and version | |
| CLI version | |
| Fixture path | disposable public synthetic copy only |
| Consent/authorization reference | |
| Adult target-user eligibility confirmed | yes / no |
| Independently uses a coding Agent | yes / no |
| Can follow the canonical English task without translation | yes / no |

## Canonical evidence preflight

| Evidence | Expected SHA-256 | Observed SHA-256 | Match |
| --- | --- | --- | --- |
| Fixture aggregate | `22048691edf640ccbe8710eb8b3013b0cfe8738e39d37517c6d2ec52f1c46332` | | yes / no |
| `source/decision.txt` | `1e5aaca45daa31047bb96923374c69341ba71f2d96080c98a08e75ccf0f3d72f` | | yes / no |
| `task.md` | `6201b5f95a8bfa0332f9d787109b69d03cf86c1a260b18fb5fc3a6253a1c95b3` | | yes / no |
| `vault/index.md` before | `4d370bbc80186ded0b7b42a9ac4d41f5b5d2f1d63938464580733d598a2680ba` | | yes / no |

## Timing

| Event | Timestamp |
| --- | --- |
| Installation start | |
| CLI ready | |
| Task start | |
| Proposal first visible | |
| Accept/reject decision stated | |

| Metric | Observed value |
| --- | --- |
| Installation seconds | |
| Task seconds to Proposal | |
| Review minutes: Proposal visible to stated decision | |

## Unassisted task outcome

| Field | Observed value |
| --- | --- |
| Status | passed / failed / blocked / abandoned |
| Intake ID | |
| Source SHA-256 reported by LWC | |
| Proposal ID | |
| Target path | |
| Proposal content SHA-256 | |
| Participant decision | accept / reject / no-decision |
| Participant reason, verbatim and sanitized | |
| Unreviewed apply attempted | no / yes |
| If attempted, result | blocked / unexpected-pass / not-applicable |
| Observer intervention after task start | none / describe below |
| Unexpected permission or account gate | none / describe below |
| Unresolved issue | |

Observer intervention or safety stop, factual description only:

```text

```

## Write-safety readback

| Field | Observed value |
| --- | --- |
| `vault/index.md` SHA-256 after decision | |
| Formal Markdown changed before approved review | no / yes / unknown |
| Unapproved write | no / yes / unknown |
| Other formal Markdown paths changed | none / list |

## D0 gate

Mark each item from observed evidence; do not infer missing values.

| Gate | Result |
| --- | --- |
| Installation completed within 5 minutes | pass / fail |
| All canonical hashes matched before task | pass / fail |
| Sole task reached inspectable Proposal | pass / fail |
| No observer assistance | pass / fail |
| Participant stated accept/reject and reason | pass / fail |
| Formal Markdown unchanged through decision | pass / fail / unknown |
| Unreviewed apply absent or blocked | pass / fail |
| No private data or expanded permission | pass / fail |
| **D0 overall** | **pass / fail / blocked** |

Evidence classification: `independent-user-session` only when separately authorized and actually observed. Otherwise use `internal-dry-run`, `synthetic-fixture`, or `not-observed`; those classifications are not real-user adoption.

## D+7 natural reuse

Complete at seven elapsed days using only independently initiated behavior observed since D0.

| Field | Observed value |
| --- | --- |
| D+7 evaluation date | |
| Eligible second Markdown-change task observed | yes / no / unknown |
| Participant independently selected LWC | yes / no / unknown |
| Reminder, scheduled rerun, LWC prompt, observer help, or extra incentive | none / describe |
| Second task reached accept/reject decision | yes / no / unknown |
| Second-task review minutes | |
| **Natural reuse** | **yes / no / not-observed** |
| Evidence and reason | |

Do not convert a scheduled fixture replay, CI result, compatibility check, static demo, HTTP response, or internal operator rerun into `natural-reuse: yes`.
