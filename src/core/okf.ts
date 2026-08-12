import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { parseMarkdown, type FrontmatterData } from "./frontmatter.js";
import { isIso8601Instant, isIsoCalendarDate } from "./trust.js";
import type {
  AttestedComputationContract,
  KnowledgeActorEvent,
  KnowledgeLifecycleStatus,
  KnowledgeSource,
  KnowledgeTrust,
  KnowledgeTrustTier,
} from "./types.js";

export interface OkfIssue {
  level: "error" | "warning";
  code:
    | "OKF_MISSING_FRONTMATTER"
    | "OKF_MISSING_TYPE"
    | "OKF_RESERVED_FRONTMATTER"
    | "OKF_INVALID_VERSION"
    | "OKF_INVALID_SOURCES"
    | "OKF_INVALID_GENERATED"
    | "OKF_INVALID_VERIFIED"
    | "OKF_INVALID_STATUS"
    | "OKF_INVALID_STALE_AFTER"
    | "OKF_INVALID_COMPUTATION"
    | "OKF_UNSAFE_FILE";
  path: string;
  message: string;
}

export interface OkfConformanceReport {
  schemaVersion: 1;
  rootName: string;
  declaredVersion?: string;
  targetVersion: "0.2";
  conformant: boolean;
  summary: { markdownFiles: number; conceptDocuments: number; errors: number; warnings: number };
  issues: OkfIssue[];
}

type Data = FrontmatterData;
const unix = (value: string) => value.split(path.sep).join("/");
const mapping = (value: unknown): Data | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Data : undefined;
const nonEmpty = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;


function usageWindow(value: unknown): { from?: string; to?: string } | undefined {
  const item = mapping(value);
  if (!item) return undefined;
  const from = isIsoCalendarDate(item.from) ? item.from : undefined;
  const to = isIsoCalendarDate(item.to) ? item.to : undefined;
  return from || to ? { from, to } : undefined;
}

export function parseOkfSources(value: unknown, sharedWindow?: unknown): KnowledgeSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = mapping(entry);
    const resource = nonEmpty(item?.resource);
    if (!item || !resource) return [];
    const count = typeof item.usage_count === "number" && Number.isFinite(item.usage_count) ? item.usage_count : undefined;
    return [{
      resource,
      id: nonEmpty(item.id),
      title: nonEmpty(item.title),
      author: nonEmpty(item.author),
      usageCount: count,
      lastModified: isIsoCalendarDate(item.last_modified) ? item.last_modified : undefined,
      usageWindow: usageWindow(item.usage_window) ?? usageWindow(sharedWindow),
    }];
  });
}

export function parseActorEvent(value: unknown): KnowledgeActorEvent | undefined {
  const item = mapping(value);
  const by = nonEmpty(item?.by);
  if (!item || !by) return undefined;
  return { by, at: isIso8601Instant(item.at) ? item.at : undefined };
}

export function parseVerified(value: unknown): KnowledgeActorEvent[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.flatMap((entry) => {
    const item = mapping(entry);
    const by = nonEmpty(item?.by);
    return by && isIso8601Instant(item?.at) ? [{ by, at: item.at }] : [];
  }).sort((left, right) => {
    const leftTime = left.at && isIso8601Instant(left.at) ? Date.parse(left.at) : Number.NEGATIVE_INFINITY;
    const rightTime = right.at && isIso8601Instant(right.at) ? Date.parse(right.at) : Number.NEGATIVE_INFINITY;
    return leftTime - rightTime || left.by.localeCompare(right.by);
  });
}

export function deriveTrustTier(verified: KnowledgeActorEvent[]): KnowledgeTrustTier {
  if (verified.some((event) => event.by.startsWith("human:"))) return "human-reviewed";
  return verified.length ? "machine-confirmed" : "unverified";
}

function lifecycleStatus(value: unknown): KnowledgeLifecycleStatus {
  return value === "draft" || value === "deprecated" ? value : "stable";
}

export function parseAttestedComputation(data: Data): AttestedComputationContract | undefined {
  if (String(data.type ?? "").toLocaleLowerCase() !== "attested computation") return undefined;
  const parameters = Array.isArray(data.parameters) ? data.parameters.flatMap((entry) => {
    const item = mapping(entry);
    const name = nonEmpty(item?.name);
    const type = nonEmpty(item?.type);
    return item && name && type ? [{ name, type, required: typeof item.required === "boolean" ? item.required : undefined }] : [];
  }) : [];
  const executor = mapping(data.executor);
  const attester = mapping(data.attester);
  return {
    runtime: nonEmpty(data.runtime),
    parameters,
    computation: nonEmpty(data.computation),
    executor: executor ? {
      resource: nonEmpty(executor.resource),
      receipt: Array.isArray(executor.receipt) ? executor.receipt.map(String) : [],
    } : undefined,
    attester: attester ? { resource: nonEmpty(attester.resource) } : undefined,
  };
}

export function parseKnowledgeTrust(data: Data, now: Date, okfDocument = false): KnowledgeTrust | undefined {
  const hasSignals = okfDocument || ["sources", "generated", "verified", "status", "stale_after"].some((key) => data[key] !== undefined);
  if (!hasSignals) return undefined;
  const verified = parseVerified(data.verified);
  const staleAfter = isIsoCalendarDate(data.stale_after) ? data.stale_after : undefined;
  const today = now.toISOString().slice(0, 10);
  return {
    tier: deriveTrustTier(verified),
    generated: parseActorEvent(data.generated),
    verified,
    status: lifecycleStatus(data.status),
    staleAfter,
    stale: Boolean(staleAfter && isIsoCalendarDate(staleAfter) && today >= staleAfter),
    sources: parseOkfSources(data.sources, data.usage_window),
  };
}

function hasFrontmatter(raw: string): boolean {
  return /^---\r?\n/.test(raw);
}

function validInstant(value: unknown): boolean {
  return isIso8601Instant(value);
}

function validUsageWindow(value: unknown): boolean {
  const window = mapping(value);
  return Boolean(window && (window.from === undefined || isIsoCalendarDate(window.from)) && (window.to === undefined || isIsoCalendarDate(window.to)));
}

function validateTrust(pathname: string, data: Data, issues: OkfIssue[]): void {
  if (data.sources !== undefined) {
    if (!Array.isArray(data.sources) || data.sources.some((entry) => {
      const source = mapping(entry);
      return !nonEmpty(source?.resource)
        || (source?.last_modified !== undefined && !isIsoCalendarDate(source.last_modified))
        || (source?.usage_window !== undefined && !validUsageWindow(source.usage_window));
    })) {
      issues.push({ level: "error", code: "OKF_INVALID_SOURCES", path: pathname, message: "sources must be a list with resource and valid YYYY-MM-DD credibility dates when declared" });
    }
  }
  if (data.usage_window !== undefined && !validUsageWindow(data.usage_window)) {
    issues.push({ level: "error", code: "OKF_INVALID_SOURCES", path: pathname, message: "usage_window from/to values must use valid YYYY-MM-DD dates" });
  }
  if (data.generated !== undefined) {
    const generated = mapping(data.generated);
    if (!nonEmpty(generated?.by) || (generated?.at !== undefined && !validInstant(generated.at))) {
      issues.push({ level: "error", code: "OKF_INVALID_GENERATED", path: pathname, message: "generated requires by and an optional valid ISO 8601 at value" });
    }
  }
  if (data.verified !== undefined) {
    const values = Array.isArray(data.verified) ? data.verified : [data.verified];
    if (!values.length || values.some((entry) => {
      const event = mapping(entry);
      return !nonEmpty(event?.by) || !validInstant(event?.at);
    })) issues.push({ level: "error", code: "OKF_INVALID_VERIFIED", path: pathname, message: "verified must contain one or more events with by and a valid ISO 8601 at value" });
  }
  if (data.status !== undefined && !["draft", "stable", "deprecated"].includes(String(data.status))) {
    issues.push({ level: "error", code: "OKF_INVALID_STATUS", path: pathname, message: "status must be draft, stable, or deprecated" });
  }
  if (data.stale_after !== undefined && !isIsoCalendarDate(data.stale_after)) {
    issues.push({ level: "error", code: "OKF_INVALID_STALE_AFTER", path: pathname, message: "stale_after must use YYYY-MM-DD" });
  }
  if (String(data.type ?? "").toLocaleLowerCase() === "attested computation") {
    const parameters = data.parameters;
    const invalidParameters = parameters !== undefined && (!Array.isArray(parameters) || parameters.some((entry) => {
      const parameter = mapping(entry);
      return !nonEmpty(parameter?.name) || !nonEmpty(parameter?.type) || (parameter?.required !== undefined && typeof parameter.required !== "boolean");
    }));
    if (!nonEmpty(data.runtime) || invalidParameters) {
      issues.push({ level: "error", code: "OKF_INVALID_COMPUTATION", path: pathname, message: "Attested Computation requires runtime and valid typed parameters when parameters are present" });
    }
  }
}

export async function checkOkfBundle(root: string): Promise<OkfConformanceReport> {
  const absoluteRoot = await realpath(path.resolve(root)).catch(() => undefined);
  if (!absoluteRoot) throw new Error(`OKF root is not a directory: ${path.resolve(root)}`);
  const rootInfo = await lstat(absoluteRoot);
  if (!rootInfo.isDirectory()) throw new Error(`OKF root is not a directory: ${absoluteRoot}`);
  const files = (await fg("**/*.md", { cwd: absoluteRoot, onlyFiles: false, dot: false, ignore: [".git/**", ".lwc/**", "node_modules/**"] })).sort();
  const issues: OkfIssue[] = [];
  let declaredVersion: string | undefined;
  let concepts = 0;
  for (const relative of files) {
    const pathname = unix(relative);
    const absolute = path.join(absoluteRoot, relative);
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) {
      issues.push({ level: "error", code: "OKF_UNSAFE_FILE", path: pathname, message: "Markdown concepts must be regular files, not directories or symbolic links" });
      continue;
    }
    const raw = await readFile(absolute, "utf8");
    const frontmatter = hasFrontmatter(raw);
    const parsed = parseMarkdown(raw);
    const data = parsed.data;
    const base = path.basename(pathname).toLocaleLowerCase();
    const reserved = base === "index.md" || base === "log.md";
    const rootIndex = pathname.toLocaleLowerCase() === "index.md";
    if (rootIndex && data.okf_version !== undefined) declaredVersion = String(data.okf_version);
    if (reserved) {
      const allowedRootIndex = rootIndex && frontmatter && Object.keys(data).every((key) => key === "okf_version");
      if (frontmatter && !allowedRootIndex) issues.push({ level: "error", code: "OKF_RESERVED_FRONTMATTER", path: pathname, message: "Reserved index.md/log.md files cannot have frontmatter except root index.md with only okf_version" });
      continue;
    }
    concepts += 1;
    if (!frontmatter) {
      issues.push({ level: "error", code: "OKF_MISSING_FRONTMATTER", path: pathname, message: "Concept documents require YAML frontmatter" });
      continue;
    }
    if (!nonEmpty(data.type)) issues.push({ level: "error", code: "OKF_MISSING_TYPE", path: pathname, message: "Concept documents require a non-empty type" });
    validateTrust(pathname, data, issues);
  }
  if (declaredVersion !== undefined && declaredVersion !== "0.2") {
    issues.push({ level: "warning", code: "OKF_INVALID_VERSION", path: "index.md", message: `Bundle declares OKF ${declaredVersion}; this checker targets 0.2` });
  }
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warnings = issues.length - errors;
  return {
    schemaVersion: 1,
    rootName: path.basename(absoluteRoot),
    declaredVersion,
    targetVersion: "0.2",
    conformant: errors === 0,
    summary: { markdownFiles: files.length, conceptDocuments: concepts, errors, warnings },
    issues,
  };
}

export function okfReportToMarkdown(report: OkfConformanceReport): string {
  const lines = [
    `# OKF v0.2 conformance — ${report.rootName}`,
    "",
    `- Result: **${report.conformant ? "conformant" : "not conformant"}**`,
    `- Declared version: ${report.declaredVersion ? `\`${report.declaredVersion}\`` : "not declared"}`,
    `- Files: ${report.summary.markdownFiles}; concepts: ${report.summary.conceptDocuments}; errors: ${report.summary.errors}; warnings: ${report.summary.warnings}`,
    "",
  ];
  if (!report.issues.length) lines.push("No OKF v0.2 conformance issues were found.", "");
  else lines.push("## Issues", "", ...report.issues.map((issue) => `- **${issue.level.toUpperCase()} ${issue.code}** \`${issue.path}\`: ${issue.message}`), "");
  lines.push("> This command validates files and contracts only. It never executes an Attested Computation, executor, attester, SQL, Python, or Skill.", "");
  return lines.join("\n");
}
