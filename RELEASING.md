# Releasing / 发布

Publishing is an explicit maintainer action. CI proves that a commit is a release candidate; it does not publish npm packages or GitHub releases.

发布必须由维护者明确执行。CI 只证明某个提交满足候选版本门槛，不会自动发布 npm 包或 GitHub Release。

## Candidate checklist / 候选版本检查

1. Start from a clean `main` that matches `origin/main`.
2. Review `CHANGELOG.md` and any compatibility impact in `docs/schema-compatibility.md`.
3. Choose the SemVer change and update `package.json`; before the first stable release, call out breaking changes explicitly.
4. Run `pnpm install --frozen-lockfile` and `pnpm release:check`.
5. Run `pnpm release:check` and inspect its pack manifest: only the CLI build, Viewer build, canonical Skill, `NOTICE`, `LICENSE`, generated `THIRD_PARTY_LICENSES.txt`, and package metadata should ship. The check also freezes the 0.1.0 changelog and unpublished release notes.
6. Confirm GitHub CI passed full verification plus package smoke on Linux/macOS and the supported Node.js 22/24 LTS matrix.
7. Inspect `git status --short`, the full diff, and the secret scan. Do not include `.lwc/`, host reports, logs, screenshots with private UI, credentials, or packed archives.
8. Use pnpm 10.34.5 as the canonical packer. Pack the same clean commit twice, require identical SHA-256 digests, inspect the extracted file allowlist, then install that exact tarball with the default npm and pnpm consumer commands. Do not compare digests produced by different package managers or rebuild between verification and publication.
9. Run the manual **Build release candidate** workflow. It verifies the selected commit, packs it twice, compares the bytes, and uploads the `.tgz`, an audit-only decompressed `.tar`, `SHA256SUMS`, and `TAR-SHA256SUMS` for 14 days. The first digest identifies the exact compressed artifact to publish; the second identifies the uncompressed tar payload across gzip implementations and can be checked directly against the included `.tar`. Only the `.tgz` is a publication candidate. The workflow cannot publish npm, create a tag, or create a GitHub Release.

## Publish / 正式发布

After the candidate commit and CI are accepted, a maintainer may create an annotated version tag, publish with the configured public access, and create matching GitHub release notes. Verify the installed package in a clean temporary directory after publication. Never publish from a dirty working tree, reuse an npm one-time password in logs, or describe an unpublished local pack as a released package.

For the first scoped publication, verify the real maintainer owns `@chicogong`, uses 2FA, and has a tested recovery path. Publish the exact uploaded tarball rather than rebuilding it. After the package exists, configure npm Trusted Publishing with a protected GitHub Environment and remove any bootstrap token. Normal defects should be handled by deprecation plus a fixed version; reserve unpublish for security or privacy incidents allowed by npm policy.

候选提交与 CI 通过后，维护者可以创建带注释的版本标签、按公开访问配置发布 npm 包，并创建对应 GitHub Release。发布后应在干净临时目录重新安装验证。不要从脏工作树发布，不要把 npm 一次性密码写入日志，也不要把本地 pack 误称为已经发布。
