import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const notes = readFileSync("docs/releases/0.1.0.md", "utf8");

if (manifest.version !== "0.1.0") throw new Error(`Release candidate version drifted: ${manifest.version}`);
if (!changelog.includes("## [0.1.0] - 2026-08-12")) throw new Error("CHANGELOG does not contain the frozen 0.1.0 section");
if (!changelog.includes("No unreleased changes")) throw new Error("CHANGELOG contains an unfrozen Unreleased section");
if (!notes.includes("published 2026-08-14")) throw new Error("0.1.0 release notes do not record the publication date");
if (!notes.includes("aed739e312e8800abbae350c80a3bc27cc820e4ec3544f1f25adbdb1ef37650f")) throw new Error("0.1.0 release notes omit the published tarball digest");
if (!notes.includes("never executes bundle SQL, Python, Skills, attesters, executors, or external commands")) throw new Error("0.1.0 release notes omit the OKF no-execution boundary");
console.log("Release metadata records published 0.1.0");
