import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputFile = path.join(root, "THIRD_PARTY_LICENSES.txt");
const grouped = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { cwd: root, encoding: "utf8" }));
const packages = Object.values(grouped).flat().flatMap((entry) => entry.versions.map((version) => ({ ...entry, version })));
const unique = [...new Map(packages.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()]
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

const sections = unique.map((entry) => {
  const packageRoot = entry.paths.find((candidate) => existsSync(path.join(candidate, "package.json")));
  if (!packageRoot) throw new Error(`Cannot locate installed package ${entry.name}@${entry.version}`);
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const licenseFiles = readdirSync(packageRoot)
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(name))
    .sort((left, right) => left.localeCompare(right));
  const author = typeof manifest.author === "string" ? manifest.author : manifest.author?.name;
  const metadata = [
    `Package: ${entry.name}@${entry.version}`,
    `License: ${entry.license}`,
    author ? `Author: ${author}` : undefined,
    entry.homepage ? `Homepage: ${entry.homepage}` : undefined,
  ].filter(Boolean);
  const texts = licenseFiles.map((name) => `--- ${name} ---\n${readFileSync(path.join(packageRoot, name), "utf8").trim()}`);
  if (!texts.length) texts.push("No standalone license file was present in the installed package; see the declared SPDX license above and package homepage.");
  return `${metadata.join("\n")}\n\n${texts.join("\n\n")}`;
});

const output = [
  "THIRD-PARTY SOFTWARE NOTICES AND LICENSES",
  "",
  "LLM Wiki Canvas 0.1.0 bundles the following production dependencies into its CLI and Viewer artifacts.",
  "This file is generated deterministically from pnpm-lock.yaml and installed package license files.",
  "It does not modify the license terms of LLM Wiki Canvas.",
  "",
  ...sections.flatMap((section, index) => [index ? "================================================================================" : "", section]).filter(Boolean),
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (!existsSync(outputFile) || readFileSync(outputFile, "utf8") !== output) {
    console.error("THIRD_PARTY_LICENSES.txt is missing or stale; regenerate it from the locked production dependencies");
    process.exit(1);
  }
  console.log(`Third-party notices are current for ${unique.length} production packages`);
} else {
  process.stdout.write(output);
}
