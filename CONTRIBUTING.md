# Contributing

Thanks for helping improve LLM Wiki Canvas.

## Development

1. Use Node.js 20 or newer and pnpm 11.10.0.
2. Run `pnpm install`.
3. Run `pnpm demo:build` and `pnpm dev` for local development.
4. Run `pnpm verify` before opening a pull request.

## Product boundaries

- Keep Markdown and raw sources as truth.
- Keep generated graph and Canvas files replaceable.
- Do not add an embedded LLM, database, cloud dependency, or MCP requirement without an accepted design discussion.
- Make Agent-authored knowledge changes reviewable; avoid wholesale generated rewrites.
- Never include private vault content, credentials, or absolute personal paths in fixtures or issues.

## Pull requests

Keep changes focused, add regression tests, and explain any graph schema or Canvas compatibility impact. Viewer changes should include desktop and mobile evidence.
