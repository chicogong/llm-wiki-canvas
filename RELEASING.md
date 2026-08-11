# Releasing / 发布

Publishing is an explicit maintainer action. CI proves that a commit is a release candidate; it does not publish npm packages or GitHub releases.

发布必须由维护者明确执行。CI 只证明某个提交满足候选版本门槛，不会自动发布 npm 包或 GitHub Release。

## Candidate checklist / 候选版本检查

1. Start from a clean `main` that matches `origin/main`.
2. Review `CHANGELOG.md` and any compatibility impact in `docs/schema-compatibility.md`.
3. Choose the SemVer change and update `package.json`; before the first stable release, call out breaking changes explicitly.
4. Run `pnpm install --frozen-lockfile` and `pnpm release:check`.
5. Inspect `pnpm pack --dry-run`: only the CLI build, Viewer build, canonical Skill, `NOTICE`, license, and package metadata should ship.
6. Confirm GitHub CI passed full verification plus package smoke on Linux/macOS and Node.js 20/22.
7. Inspect `git status --short`, the full diff, and the secret scan. Do not include `.lwc/`, host reports, logs, screenshots with private UI, credentials, or packed archives.

## Publish / 正式发布

After the candidate commit and CI are accepted, a maintainer may create an annotated version tag, publish with the configured public access, and create matching GitHub release notes. Verify the installed package in a clean temporary directory after publication. Never publish from a dirty working tree, reuse an npm one-time password in logs, or describe an unpublished local pack as a released package.

候选提交与 CI 通过后，维护者可以创建带注释的版本标签、按公开访问配置发布 npm 包，并创建对应 GitHub Release。发布后应在干净临时目录重新安装验证。不要从脏工作树发布，不要把 npm 一次性密码写入日志，也不要把本地 pack 误称为已经发布。
