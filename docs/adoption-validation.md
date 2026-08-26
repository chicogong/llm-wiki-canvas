# D0 / D+7 adoption validation

This record covers one product only: LLM Wiki Canvas. It uses only the redistributable synthetic files under [`examples/host-fixture`](../examples/host-fixture/). No private Vault, account data, session, or host transcript belongs in this record.

## Candidate identity

- Candidate branch at D0: `agent/agent-knowledge-review-positioning`
- Baseline parent before the adoption-validation commits: `0b2fa6553fb7e06ad03ffd5d9096d9bff5d2e18b`
- Candidate identity: capture the committed candidate at rerun time with `git rev-parse HEAD`.
- Fixed candidate SHA: record the captured value in the external handoff report. This tracked document deliberately does not hard-code its own final commit SHA.
- Required handoff state: the adoption-validation changes are committed and `git status --porcelain` is empty.
- Fixture ID: `host-fixture-v1`
- Fixture aggregate SHA-256: `22048691edf640ccbe8710eb8b3013b0cfe8738e39d37517c6d2ec52f1c46332`
- Hash manifest: [`examples/host-fixture/fixture.sha256`](../examples/host-fixture/fixture.sha256)
- Formal baseline: `vault/index.md` SHA-256 `4d370bbc80186ded0b7b42a9ac4d41f5b5d2f1d63938464580733d598a2680ba`
- Selected source: `source/decision.txt` SHA-256 `1e5aaca45daa31047bb96923374c69341ba71f2d96080c98a08e75ccf0f3d72f`

The aggregate covers exactly `source/decision.txt`, `task.md`, and `vault/index.md`. The manifest itself is not included in its own hash.

## Two-minute Quickstart

Prerequisite: dependencies and `dist/index.js` already exist. From the repository root:

```bash
npm run adoption:quickstart
```

The command copies the fixed fixture to a temporary workspace, creates bounded context for `Host Fixture`, creates one isolated draft and Proposal, renders the Proposal for review, proves that formal Markdown did not change, and confirms that apply fails before human review. It deletes the temporary workspace afterward.

Acceptance output must contain:

- `status: passed`
- `fixtureSha256: 22048691edf640ccbe8710eb8b3013b0cfe8738e39d37517c6d2ec52f1c46332`
- `contextHash: 4d370bbc80186ded0b7b42a9ac4d41f5b5d2f1d63938464580733d598a2680ba`
- `sourceHash: 1e5aaca45daa31047bb96923374c69341ba71f2d96080c98a08e75ccf0f3d72f`
- `proposalStatus: proposed`
- `applyWithoutReview: blocked`

`proposal show` is the review surface in this validation. Approval and apply are deliberately outside the Quickstart; no synthetic process may impersonate a human reviewer.

## D0 record — 2026-08-22

| Host | Evidence | Result | Elapsed | Comparable result |
| --- | --- | --- | ---: | --- |
| Codex | Current Codex session executed the local CLI flow | Passed to Proposal review gate | 22 s from Intake creation | Context hash, source hash, target, content hash, and unreviewed-apply blocker matched |
| Tencent WorkBuddy v5.3.14 | Signed-in desktop workspace, Default Permissions, explicitly attached `AGENTS.md` and canonical `SKILL.md` | Passed to Proposal review gate | 2 m 8 s host task; 0.31 s CLI work | Same fixture/context/source/target semantics; formal Markdown unchanged; apply deliberately not attempted |

Codex proposed content SHA-256: `8fa41a0bd47b323d413d34a63659e6ffc40d678c6508f864c28fc0aaa7b6aa87`. WorkBuddy proposed content SHA-256: `2e5e71cc2b5d74c2e1d1012c4425b0297a11f6e6d4b6f267ad723796918f8989`. The formal baseline remained unchanged in both runs. Proposal IDs and content hashes differ because generator identity and valid Markdown formatting differ; the required evidence semantics match.

Comparison rules are explicit: both hosts must preserve the exact fixture, context, and source hashes; the proposed text must retain all three source semantics (Markdown is truth, Agent content enters a Proposal, and apply waits for human review); and unreviewed apply must fail closed. Record the proposed content hash even when semantically valid formatting differs. D0 produced different content hashes with equivalent required semantics, so no byte-equality claim is made.

Failure and correction:

- The first Codex edit assumed a generic draft placeholder. Intake actually generated provenance frontmatter. Codex read the generated draft, preserved `source` and `source_sha256`, and edited only the declared body and metadata.
- No `workbuddy` or `workbuddy-cli` executable was available. The installed `codebuddy` executable was not used because CodeBuddy is a different host and would not prove WorkBuddy adoption.
- The later real-host rerun used the installed WorkBuddy desktop app rather than substituting CodeBuddy. WorkBuddy created `intake-04b6f0004ced` and `proposal-f7f8909e212c`, preserved source SHA-256 `1e5aaca45daa31047bb96923374c69341ba71f2d96080c98a08e75ccf0f3d72f`, and left formal `vault/index.md` at SHA-256 `4d370bbc80186ded0b7b42a9ac4d41f5b5d2f1d63938464580733d598a2680ba`.
- An earlier isolated sandbox could not bind two loopback-server tests on `127.0.0.1`. The candidate was rerun in the normal repository environment on 2026-08-26: all 57 core tests, 20 production Viewer E2E tests, and 2 live Workbench E2E tests passed through `pnpm verify`.
- The sensitive-information scan initially found absolute paths inside ignored `.lwc/adoption-d0-*` workspaces. Those generated workspaces were moved out of the repository; the subsequent scan passed, and no local host transcript or `.lwc` state is part of the candidate.

Exact WorkBuddy human gate: a user must open a real signed-in WorkBuddy workspace, select a copy of this synthetic fixture as the working directory, attach `@AGENTS.md` and `@.agents/skills/llm-wiki-canvas/SKILL.md`, keep normal permission prompts enabled, and run `task.md`. Stop if it requests another login, plugin installation, account connection, broader filesystem access, or non-public data. This gate passed on 2026-08-22 with WorkBuddy v5.3.14; no login, installation, new connection, broader filesystem grant, or private data was required.

The machine-readable D0 rows are in [`docs/adoption-ledger.csv`](adoption-ledger.csv). They retain host version, evidence kind, known hashes, write-safety result, and attribution fields. `not-recorded` preserves an evidence gap instead of inventing a historical value; `not-observed` means no installation or Star was attributed, not zero demand.

## D+7 template — do not fill early

Target date: 2026-08-29 Asia/Singapore. Copy one row per host into `docs/adoption-ledger.csv` only after an observed rerun.

```text
observed_at:
day: D+7
host:
host_version:
evidence_kind: host-runtime | compatibility-fixture | host-attempt
status: passed | failed | blocked | unavailable | pending-real-host
candidate_commit:
fixture_id: host-fixture-v1
fixture_sha256: 22048691edf640ccbe8710eb8b3013b0cfe8738e39d37517c6d2ec52f1c46332
elapsed_seconds:
context_hash:
source_hash:
content_hash:
formal_markdown_changed: false | true
apply_without_review: blocked | not-attempted | unexpected-pass
failure:
correction:
cta_id: lwc-adoption-v1
cta_source:
install_source: npm | source-checkout | existing-install | not-observed
star_source: lwc-adoption-v1 | other | not-observed
```

Reproduction commands:

```bash
candidate_sha="$(git rev-parse HEAD)"
test -n "$candidate_sha"
test -z "$(git status --porcelain)"
printf '%s\n' "$candidate_sha"
pnpm build
npm run adoption:quickstart
npm run adoption:workbuddy-compat
LWC_RUN_HOST_FIXTURE=1 node scripts/host-runtime-fixture.mjs --host codex --output .lwc/host-runtime/codex.json
```

The last command is opt-in and may use an authenticated Codex host; run it only when the task owner authorizes that account/runtime use. A real WorkBuddy rerun has no repository CLI shortcut and must pass the human gate above. Never substitute the compatibility fixture for a real-host pass.

## One CTA and attribution fields

CTA ID `lwc-adoption-v1` has one canonical destination:

> [Install LLM Wiki Canvas from the README; star the repository only if this review workflow proves useful.](https://github.com/chicogong/llm-wiki-canvas?utm_source=lwc-adoption-fixture&utm_medium=host-validation&utm_campaign=d0-d7)

Record `cta_id`, `cta_source`, `install_source`, and `star_source` in the ledger. Do not publish the CTA from this task, solicit a Star, or infer attribution without an observed source.

## Independent verification handoff

Resolve the committed candidate without embedding a self-referential SHA in this file:

```bash
candidate_sha="$(git rev-parse HEAD)"
test -n "$candidate_sha"
test -z "$(git status --porcelain)"
git diff --check
npm run adoption:quickstart
npm run adoption:workbuddy-compat
printf 'candidate=%s\n' "$candidate_sha"
```

The verification report makes the printed SHA immutable for the recipient. Completion is a committed, clean worktree; the expected hashes and blocker above; and a real WorkBuddy pass to the Proposal review gate. The verifier must not review or apply a Proposal; repository publication remains a separate maintainer decision.
