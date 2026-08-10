import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startWikiServer, type WikiServer } from "../src/cli/serve.js";
import type { WikiGraph } from "../src/core/index.js";

const scratchDirectories: string[] = [];
const servers: WikiServer[] = [];

async function fixture(): Promise<{ root: string; viewer: string }> {
  const scratch = await mkdtemp(path.join(tmpdir(), "lwc-serve-"));
  scratchDirectories.push(scratch);
  const root = path.join(scratch, "wiki");
  const viewer = path.join(scratch, "viewer");
  await Promise.all([mkdir(root), mkdir(path.join(viewer, "assets"), { recursive: true })]);
  await writeFile(path.join(root, "index.md"), "# Local Atlas\n", "utf8");
  await writeFile(path.join(viewer, "index.html"), "<!doctype html><title>Workbench</title><script src=\"/assets/app.js\"></script>", "utf8");
  await writeFile(path.join(viewer, "assets", "app.js"), "globalThis.viewerLoaded = true;\n", "utf8");
  return { root, viewer };
}

async function graphAt(url: string): Promise<WikiGraph> {
  const response = await fetch(`${url}/graph.json`);
  expect(response.status).toBe(200);
  return response.json() as Promise<WikiGraph>;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(scratchDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local Workbench server", () => {
  it("serves the Viewer and current graph with local security defaults", async () => {
    const { root, viewer } = await fixture();
    const server = await startWikiServer({ root, viewerDirectory: viewer, host: "127.0.0.1", port: 0, watch: false });
    servers.push(server);

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const redirect = await fetch(server.url, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/?live=1");

    const page = await fetch(`${server.url}/?live=1`);
    expect(await page.text()).toContain("Workbench");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("x-frame-options")).toBe("DENY");

    const asset = await fetch(`${server.url}/assets/app.js`);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");

    const graph = await graphAt(server.url);
    expect(graph.rootName).toBe("wiki");
    expect(graph.stats.files).toBe(1);

    const status = await fetch(`${server.url}/__lwc/status`).then((response) => response.json()) as { live: boolean; watching: boolean };
    expect(status).toMatchObject({ live: true, watching: false });

    const post = await fetch(`${server.url}/graph.json`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });

  it("atomically replaces the graph after a Markdown change", async () => {
    const { root, viewer } = await fixture();
    const messages: string[] = [];
    const server = await startWikiServer({ root, viewerDirectory: viewer, port: 0, pollInterval: 30, log: (message) => messages.push(message) });
    servers.push(server);
    expect((await graphAt(server.url)).stats.files).toBe(1);

    const eventsController = new AbortController();
    const events = await fetch(`${server.url}/__lwc/events`, { signal: eventsController.signal });
    const eventsReader = events.body?.getReader();
    expect(events.headers.get("content-type")).toContain("text/event-stream");

    await writeFile(path.join(root, "Concept.md"), "# Concept\n[[index]]\n", "utf8");
    const deadline = Date.now() + 3000;
    let graph = await graphAt(server.url);
    while (graph.stats.files !== 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      graph = await graphAt(server.url);
    }

    expect(graph.stats).toMatchObject({ files: 2, links: 1, brokenLinks: 0 });
    expect(messages).toContain("Rebuilt 2 files · 1 links · 0 broken");
    let eventText = "";
    const eventDeadline = Date.now() + 1000;
    while (!eventText.includes("event: graph") && Date.now() < eventDeadline && eventsReader) {
      const chunk = await Promise.race([
        eventsReader.read(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 100)),
      ]);
      if (chunk?.value) eventText += new TextDecoder().decode(chunk.value);
    }
    expect(eventText).toContain("event: graph");
    eventsController.abort();
  });

  it("rejects invalid runtime configuration before listening", async () => {
    const { root, viewer } = await fixture();
    await expect(startWikiServer({ root, viewerDirectory: viewer, port: -1 })).rejects.toThrow("Invalid port");
    await expect(startWikiServer({ root, viewerDirectory: viewer, port: 0, pollInterval: 1 })).rejects.toThrow("Invalid poll interval");
  });
});
