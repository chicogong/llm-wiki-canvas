import matter from "gray-matter";
import { parse as parseYaml } from "yaml";

export type FrontmatterData = Record<string, unknown>;

function parseYamlStrings(source: string): FrontmatterData {
  const value = parseYaml(source, { schema: "core" });
  return value && typeof value === "object" && !Array.isArray(value) ? value as FrontmatterData : {};
}

export function parseMarkdown(raw: string): { content: string; data: FrontmatterData } {
  const parsed = matter(raw, { engines: { yaml: parseYamlStrings } });
  return { content: parsed.content, data: parsed.data as FrontmatterData };
}

export function jsonSafeMetadata(value: FrontmatterData): FrontmatterData {
  return JSON.parse(JSON.stringify(value)) as FrontmatterData;
}
