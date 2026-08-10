# Security Policy

## Supported versions

Until the first stable release, security fixes target the latest `main` branch and newest published package only.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not include credentials, private vault files, or exploitable details in a public issue.

Expect an initial acknowledgement within seven days. A fix timeline depends on severity and reproducibility.

## Local data model

LLM Wiki Canvas reads the explicitly selected local wiki root. Scan, lint, report, and build commands write only their requested generated outputs. `proposal apply` is the only workflow that writes knowledge Markdown: it requires a reviewed proposal, exact proposal-ID confirmation, an unchanged reviewed payload, and unchanged target-file hashes. Proposal targets cannot escape the selected root, cross symbolic-link directories, modify hidden paths, or replace repository instruction files.

Generated artifacts and proposal drafts should not be treated as authoritative source material. Review the rendered proposal diff, paths, hashes, and output locations before running the CLI against sensitive vaults. Keep `.lwc/` local unless a sanitized proposal is deliberately retained as a review record.
