import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const notes = readFileSync("docs/releases/0.1.0.md", "utf8");

if (manifest.version !== "0.1.0") throw new Error(`Release candidate version drifted: ${manifest.version}`);
if (!changelog.includes("## [0.1.0] - 2026-08-12")) throw new Error("CHANGELOG does not contain the frozen 0.1.0 section");
if (!changelog.includes("No unreleased changes")) throw new Error("CHANGELOG contains an unfrozen Unreleased section");
if (!notes.includes("frozen release candidate; not published")) throw new Error("0.1.0 release notes do not preserve the unpublished candidate boundary");
if (!notes.includes("never executes bundle SQL, Python, Skills, attesters, executors, or external commands")) throw new Error("0.1.0 release notes omit the OKF no-execution boundary");
console.log("Release metadata is frozen for unpublished 0.1.0");
