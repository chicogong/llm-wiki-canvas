import { createServer, type ServerResponse } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fg from "fast-glob";
import { buildGraph, readDraftInbox, readProposalInbox, type DraftInbox, type ProposalInbox, type WikiGraph } from "../core/index.js";

const IGNORED_MARKDOWN = [
  ".git/**", ".lwc/**", ".agents/**", ".claude/**", ".qoder/**", "node_modules/**",
  "**/AGENTS.md", "**/CLAUDE.md",
];

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface WikiServerOptions {
  root: string;
  host?: string;
  port?: number;
  watch?: boolean;
  pollInterval?: number;
  viewerDirectory?: string;
  log?: (message: string) => void;
}

export interface WikiServer {
  url: string;
  port: number;
  rebuild: () => Promise<WikiGraph>;
  refreshInbox: () => Promise<ProposalInbox>;
  refreshDrafts: () => Promise<DraftInbox>;
  close: () => Promise<void>;
}

async function resolveViewerDirectory(override?: string): Promise<string> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = override ? [path.resolve(override)] : [
    path.resolve(moduleDirectory, "../../viewer-dist"),
    path.resolve(moduleDirectory, "../viewer-dist"),
  ];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "index.html"));
      return candidate;
    } catch {
      // Try the next layout: source execution and packed CLI resolve differently.
    }
  }
  throw new Error("Workbench assets were not found. Run pnpm build or reinstall the package.");
}

async function markdownFingerprint(root: string): Promise<string> {
  const files = await fg(["**/*.md"], { cwd: root, onlyFiles: true, dot: false, ignore: IGNORED_MARKDOWN });
  const entries = await Promise.all(files.sort().map(async (relative) => {
    const info = await stat(path.join(root, relative));
    return `${relative}:${info.size}:${info.mtimeMs}`;
  }));
  return entries.join("|");
}

async function proposalFingerprint(root: string): Promise<string> {
  const files = await fg([".lwc/proposals/**/*.json"], { cwd: root, onlyFiles: true, dot: false, followSymbolicLinks: false });
  const entries = await Promise.all(files.sort().map(async (relative) => {
    const info = await stat(path.join(root, relative));
    return `${relative}:${info.size}:${info.mtimeMs}`;
  }));
  return entries.join("|");
}

async function draftFingerprint(root: string): Promise<string> {
  const files = await fg([".lwc/drafts/**/*"], { cwd: root, onlyFiles: true, dot: true, followSymbolicLinks: false });
  const entries = await Promise.all(files.sort().map(async (relative) => {
    const info = await stat(path.join(root, relative));
    return `${relative}:${info.size}:${info.mtimeMs}`;
  }));
  return entries.join("|");
}

function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export async function startWikiServer(options: WikiServerOptions): Promise<WikiServer> {
  const root = path.resolve(options.root);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const watch = options.watch ?? true;
  const pollInterval = options.pollInterval ?? 500;
  const log = options.log ?? console.log;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${port}`);
  if (!Number.isFinite(pollInterval) || pollInterval < 25) throw new Error(`Invalid poll interval: ${pollInterval}`);

  const viewerDirectory = await resolveViewerDirectory(options.viewerDirectory);
  let currentGraph = await buildGraph(root);
  let currentInbox = await readProposalInbox(root);
  let currentDrafts = await readDraftInbox(root);
  let fingerprint = await markdownFingerprint(root);
  let inboxFingerprint = await proposalFingerprint(root);
  let draftsFingerprint = await draftFingerprint(root);
  let rebuilding = false;
  let closed = false;
  const eventClients = new Set<ServerResponse>();

  const rebuild = async (): Promise<WikiGraph> => {
    const next = await buildGraph(root);
    currentGraph = next;
    for (const client of eventClients) client.write(`event: graph\ndata: ${next.generatedAt}\n\n`);
    return next;
  };

  const refreshInbox = async (): Promise<ProposalInbox> => {
    const next = await readProposalInbox(root);
    currentInbox = next;
    for (const client of eventClients) client.write(`event: proposals\ndata: ${new Date().toISOString()}\n\n`);
    return next;
  };

  const refreshDrafts = async (): Promise<DraftInbox> => {
    const next = await readDraftInbox(root);
    currentDrafts = next;
    for (const client of eventClients) client.write(`event: drafts\ndata: ${new Date().toISOString()}\n\n`);
    return next;
  };

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      if (method !== "GET" && method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD", ...securityHeaders() }).end();
        return;
      }
      const requestUrl = new URL(request.url ?? "/", `http://${host}`);
      if (requestUrl.pathname === "/" && !requestUrl.searchParams.has("live")) {
        response.writeHead(302, { Location: "/?live=1", "Cache-Control": "no-store", ...securityHeaders() }).end();
        return;
      }
      if (requestUrl.pathname === "/graph.json") {
        const body = `${JSON.stringify(currentGraph)}\n`;
        response.writeHead(200, { "Content-Type": CONTENT_TYPES[".json"], "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), ...securityHeaders() });
        response.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (requestUrl.pathname === "/__lwc/proposals") {
        const body = `${JSON.stringify(currentInbox)}\n`;
        response.writeHead(200, { "Content-Type": CONTENT_TYPES[".json"], "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), ...securityHeaders() });
        response.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (requestUrl.pathname === "/__lwc/drafts") {
        const body = `${JSON.stringify(currentDrafts)}\n`;
        response.writeHead(200, { "Content-Type": CONTENT_TYPES[".json"], "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), ...securityHeaders() });
        response.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (requestUrl.pathname === "/__lwc/status") {
        const body = `${JSON.stringify({ live: true, watching: watch, generatedAt: currentGraph.generatedAt, stats: currentGraph.stats, proposals: currentInbox.proposals.length, proposalIssues: currentInbox.issues.length, drafts: currentDrafts.drafts.length, draftIssues: currentDrafts.issues.length })}\n`;
        response.writeHead(200, { "Content-Type": CONTENT_TYPES[".json"], "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), ...securityHeaders() });
        response.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (requestUrl.pathname === "/__lwc/events") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", ...securityHeaders() });
        if (method === "HEAD") {
          response.end();
          return;
        }
        response.write(": connected\n\n");
        eventClients.add(response);
        request.on("close", () => eventClients.delete(response));
        return;
      }

      let relative: string;
      try {
        relative = decodeURIComponent(requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1));
      } catch {
        response.writeHead(400, securityHeaders()).end("Bad request");
        return;
      }
      const target = path.resolve(viewerDirectory, relative);
      if (target !== viewerDirectory && !target.startsWith(`${viewerDirectory}${path.sep}`)) {
        response.writeHead(404, securityHeaders()).end("Not found");
        return;
      }
      const body = await readFile(target).catch(() => undefined);
      if (!body) {
        response.writeHead(404, securityHeaders()).end("Not found");
        return;
      }
      const extension = path.extname(target).toLowerCase();
      const cache = extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable";
      response.writeHead(200, { "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream", "Content-Length": body.byteLength, "Cache-Control": cache, ...securityHeaders() });
      response.end(method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(500, securityHeaders()).end("Internal server error");
      log(`Request failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to determine the local server address");

  const timer = watch ? setInterval(async () => {
    if (rebuilding || closed) return;
    rebuilding = true;
    try {
      const nextFingerprint = await markdownFingerprint(root);
      const nextInboxFingerprint = await proposalFingerprint(root);
      const nextDraftsFingerprint = await draftFingerprint(root);
      if (nextFingerprint !== fingerprint) {
        fingerprint = nextFingerprint;
        try {
          const graph = await rebuild();
          log(`Rebuilt ${graph.stats.files} files · ${graph.stats.links} links · ${graph.stats.brokenLinks} broken`);
        } catch (error) {
          log(`Rebuild failed; keeping the last valid graph: ${error instanceof Error ? error.message : error}`);
        }
      }
      if (nextInboxFingerprint !== inboxFingerprint) {
        inboxFingerprint = nextInboxFingerprint;
        const inbox = await refreshInbox();
        log(`Proposal inbox refreshed: ${inbox.proposals.length} proposal(s) · ${inbox.issues.length} issue(s)`);
      }
      if (nextDraftsFingerprint !== draftsFingerprint) {
        draftsFingerprint = nextDraftsFingerprint;
        const drafts = await refreshDrafts();
        log(`Draft inbox refreshed: ${drafts.drafts.length} intake(s) · ${drafts.issues.length} issue(s)`);
      }
    } catch (error) {
      log(`Watch scan failed; keeping the last valid graph: ${error instanceof Error ? error.message : error}`);
    } finally {
      rebuilding = false;
    }
  }, pollInterval) : undefined;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    for (const client of eventClients) client.end();
    eventClients.clear();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  };

  return { url: `http://${host}:${address.port}`, port: address.port, rebuild, refreshInbox, refreshDrafts, close };
}
