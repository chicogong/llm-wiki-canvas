# Contributing

Thanks for helping improve LLM Wiki Canvas.

## Development

1. For source development, use Node.js 22.13 or newer and pnpm 11.10.0. The published CLI still supports Node.js 20; CI tests that consumer boundary with pnpm 10 because pnpm 11 itself requires Node.js 22.13.
2. Run `pnpm install`.
3. Run `pnpm demo:build` and `pnpm dev` for local development.
4. Run `pnpm verify` before opening a pull request.

`pnpm test:hosts` is deterministic and safe for normal CI. Real Codex or Claude Code execution is separately opt-in; see [Host runtime fixtures](docs/host-runtime.md). Do not enable live-host tests in pull-request CI or attach account/session data to a report.

## Product boundaries

- Keep Markdown and raw sources as truth.
- Keep generated graph and Canvas files replaceable.
- Do not add an embedded LLM, database, cloud dependency, or MCP requirement without an accepted design discussion.
- Make Agent-authored knowledge changes reviewable; avoid wholesale generated rewrites.
- Never include private vault content, credentials, or absolute personal paths in fixtures or issues.

## What belongs in Git

Commit files that let another contributor understand, build, test, and reproduce the project:

- source code, tests, configuration, lockfiles, and CI workflows;
- public documentation, example Markdown, and deliberately anonymized fixtures;
- stable generated fixtures used by tests or documentation, such as `public/graph.json`, `examples/atlas-wiki/Atlas.canvas`, `docs/agent-compatibility.md`, and curated screenshots;
- Agent Skills and repository instructions that define the public workflow;
- migrations or schema changes together with the code that consumes them.

Do not commit machine-specific or private state:

- `.env*`, credentials, tokens, private keys, cookies, browser profiles, or session files;
- real personal or company vaults, proprietary documents, user data, or unredacted logs;
- absolute paths, account identifiers, email addresses, or local hostnames in fixtures;
- `node_modules`, build output, coverage, caches, temporary files, editor state, or packed archives;
- `.lwc/` working data from a private vault unless a specific sanitized fixture is intentionally reviewed for inclusion;
- `.lwc/host-runtime/` attempt reports, host transcripts, model output, or proprietary CLI session state;
- screenshots that expose tabs, notifications, usernames, file paths, or unrelated applications.

Before staging, run `git status --short`, inspect `git diff`, and stage explicit paths. Before pushing, run `pnpm verify`. If a generated file is committed, document why it is a reproducible public artifact rather than disposable local state.

## Pull requests

Keep changes focused, add regression tests, and explain any graph schema, Canvas, or Agent-contract compatibility impact. Viewer changes should include desktop and mobile evidence. Rebuild the public Agent matrix with `pnpm agents:matrix` when rules or adapters change. Route feature requests to the smallest affected product surface in the issue template: Map, Health, Drafts/Intake, Changes, spatial exports, Agent compatibility, or CLI automation.
