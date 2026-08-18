import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const notes = readFileSync("docs/releases/0.2.0.md", "utf8");

if (manifest.version !== "0.2.0") throw new Error(`Release candidate version drifted: ${manifest.version}`);
if (!changelog.includes("## [0.2.0] - 2026-08-14")) throw new Error("CHANGELOG does not contain the frozen 0.2.0 section");
if (!changelog.includes("## [Unreleased]")) throw new Error("CHANGELOG is missing the Unreleased section");
if (!notes.includes("llm-wiki-canvas@0.2.0")) throw new Error("0.2.0 release notes omit the npm package identity");
if (!notes.includes("published 2026-08-14")) throw new Error("0.2.0 release notes do not record the publication date");
if (!notes.includes("4d5354d4a83b024059a78b33cf4e0c3c49699c62")) throw new Error("0.2.0 release notes omit the source commit");
if (!notes.includes("12e6683ca19a47f860614b5f3dd4fd6fd51b642cb2154bef5c95bf03d62daba2")) throw new Error("0.2.0 release notes omit the published tarball digest");
if (!notes.includes("Formal Markdown remains human-controlled")) throw new Error("0.2.0 release notes omit the human-control boundary");
if (!notes.includes("DeepSeek Harness remains a Developer Preview")) throw new Error("0.2.0 release notes omit the Harness stability boundary");
console.log("Release metadata is current for 0.2.0");
