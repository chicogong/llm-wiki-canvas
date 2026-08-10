import { readFileSync } from "node:fs";
import path from "node:path";

const skillRoot = path.resolve(".agents/skills/llm-wiki-canvas");
const skill = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
const metadata = readFileSync(path.join(skillRoot, "agents/openai.yaml"), "utf8");
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
const errors = [];

if (!frontmatter) errors.push("SKILL.md must start with YAML frontmatter");
const header = frontmatter?.[1] ?? "";
if (!/^name: llm-wiki-canvas$/m.test(header)) errors.push("skill name must be llm-wiki-canvas");
if (!/^description: .{40,}$/m.test(header)) errors.push("skill description is missing or too short");
if (/^\s*(?:TODO|FIXME)/m.test(skill)) errors.push("SKILL.md contains placeholder instructions");
if (!/display_name: "LLM Wiki Canvas"/.test(metadata)) errors.push("openai.yaml display_name is missing");
if (!/default_prompt: ".*\$llm-wiki-canvas/.test(metadata)) errors.push("openai.yaml default_prompt must mention $llm-wiki-canvas");

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Skill is valid and portable");
