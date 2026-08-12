# Open Knowledge Format v0.2

LLM Wiki Canvas can read and check a local [Open Knowledge Format (OKF) v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle. This adds portable trust signals to the same Markdown graph used by Obsidian and coding Agents; it does not add a server, model, database, or MCP layer.

## What is implemented

| OKF v0.2 surface | LLM Wiki Canvas behavior |
| --- | --- |
| Root `okf_version` | Detected and exposed in `graph.okf` |
| Arbitrary concept `type` | Preserved on each graph node; existing visual page kinds remain compatible |
| `sources` and usage metadata | Parsed, checked, shown in the Trust Inspector, and included in bounded Agent context |
| `generated` / `verified` | Parsed as actor events and mapped to factual tiers: unverified, machine confirmed, or human reviewed |
| `status` / `stale_after` | Parsed and shown as lifecycle and freshness; stale/deprecated nodes receive a visible graph treatment |
| Attested Computation | Runtime, parameters, computation, executor receipt, and attester references are represented as a contract |
| Reserved `index.md` / `log.md` | Checked according to the v0.2 bundle rules |
| Bundle-root Markdown links | `/path/to/page.md` resolves inside the local bundle |

There is intentionally no opaque trust score. The Viewer places origin, review, and freshness side by side so a person or Agent can inspect the underlying declarations.

## Check and view a bundle

```bash
lwc okf check /path/to/okf-bundle --strict
lwc okf check /path/to/okf-bundle --format json -o .lwc/okf-report.json
lwc serve /path/to/okf-bundle
```

The repository includes a synthetic, public-safe bundle:

```bash
pnpm okf:demo
pnpm okf:build
pnpm dev
```

Open <http://127.0.0.1:4173/?graph=/okf-graph.json>, choose **Release readiness**, and follow the relationship to **Release check**. The Trust Inspector shows its declared evidence and the Attested Computation boundary.

## Execution and compatibility boundary

`lwc okf check`, graph compilation, context export, and the Viewer are read-only with respect to the bundle. They never execute an Attested Computation, executor, attester, fenced SQL, fenced Python, or referenced Skill. This matches OKF's current role as a knowledge interchange format: computation sandboxing, ABI, and receipt verification require a separate execution policy and are not inferred here.

Unknown concept types and extra frontmatter fields are preserved/tolerated where possible. The checker rejects malformed trust fields, invalid lifecycle values, unsupported declared OKF versions, symlinked concept files, and reserved-file frontmatter violations. LLM Wiki Canvas remains a v0.2 consumer rather than claiming to be the canonical OKF validator.

Datetime fields use strict ISO 8601 forms with `T` and an explicit timezone; calendar signals use real `YYYY-MM-DD` dates. The latest verification is selected by timestamp, not YAML list order. Map and Health surface every checker warning/error, while the graph and bounded context preserve producer-defined frontmatter under node `metadata`.

Compatibility is pinned against Google Cloud's synthetic Acme Retail bundle at commit `374e0bc4c644310ff56cdf9c0fe81eccdec862b0`. The upstream fixture's `log.md` contains frontmatter even though the v0.2 reserved-file rule disallows it; the regression deliberately retains and reports that normative error instead of silently weakening the checker.

Background: Google Cloud's [OKF v0.2 trust-signals announcement](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals/) and the [reference repository](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf).
