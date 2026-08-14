import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const scratch = mkdtempSync(path.join(tmpdir(), "lwc-release-candidate-"));
const output = path.join(root, "release-candidate");
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

try {
  const packs = ["first", "second"].map((name) => {
    const directory = path.join(scratch, name);
    mkdirSync(directory, { recursive: true });
    const stdout = execFileSync("pnpm", ["pack", "--pack-destination", directory], { cwd: root, encoding: "utf8" });
    const result = stdout.trim().split("\n").at(-1);
    if (!result) throw new Error(`pnpm pack did not return the ${name} tarball`);
    return path.resolve(root, result);
  });
  const hashes = packs.map(digest);
  if (hashes[0] !== hashes[1]) throw new Error(`candidate pack is not deterministic: ${hashes.join(" != ")}`);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const target = path.join(output, path.basename(packs[0]));
  cpSync(packs[0], target);
  writeFileSync(path.join(output, "SHA256SUMS"), `${hashes[0]}  ${path.basename(target)}\n`);
  console.log(`Release candidate ready: ${path.relative(root, target)}\nSHA-256: ${hashes[0]}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
