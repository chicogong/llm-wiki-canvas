import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { realpath, stat } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const MAX_OUTPUT_BYTES = 200_000
const INTAKE_PATTERN = /^\.lwc\/drafts\/intake-[a-f0-9]{12}\/intake\.json$/
const PROPOSAL_PATTERN = /^\.lwc\/proposals\/proposal-[a-f0-9]{12}\.json$/

function resolveCliEntry() {
  const packagePath = require.resolve('llm-wiki-canvas/package.json')
  return resolve(dirname(packagePath), 'dist/index.js')
}

async function sessionRoot(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
    throw new Error('DeepSeek Harness session cwd must be an absolute path')
  }
  const root = await realpath(cwd)
  if (!(await stat(root)).isDirectory()) throw new Error('session cwd is not a directory')
  return root
}

function safeRelative(value, label, pattern) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty relative path`)
  }
  const normalized = value.replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label} must not contain empty, dot, or parent segments`)
  }
  if (pattern && !pattern.test(normalized)) throw new Error(`${label} is outside the governed LWC path`)
  return normalized
}

function safeSource(value) {
  const source = safeRelative(value, 'source')
  if (source === '.lwc' || source.startsWith('.lwc/')) throw new Error('source must be outside .lwc')
  return source
}

function safeTarget(value) {
  const target = safeRelative(value, 'target')
  if (!target.endsWith('.md') || target === 'index.md' || target === 'log.md') {
    throw new Error('target must be a relative Markdown page, not index.md or log.md')
  }
  if (target === '.lwc' || target.startsWith('.lwc/')) throw new Error('target must be outside .lwc')
  return target
}

function boundedText(value, label, max) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must not be empty`)
  if (Buffer.byteLength(value, 'utf8') > max) throw new Error(`${label} exceeds ${max} bytes`)
  if (value.includes('\0')) throw new Error(`${label} contains a NUL byte`)
  return value
}

function boundedInteger(value, fallback, min, max, label) {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`)
  }
  return resolved
}

function relativeToRoot(root, absolute) {
  const value = (isAbsolute(absolute) ? relative(root, absolute) : absolute).replaceAll('\\', '/')
  return safeRelative(value, 'LWC result path')
}

function intakeResult(root, value) {
  return {
    id: value.intake.id,
    status: value.intake.status,
    source: {
      name: value.intake.source.name,
      sha256: value.intake.source.sha256,
      bytes: value.intake.source.bytes,
    },
    target: value.intake.draft.path,
    intake: relativeToRoot(root, value.manifestPath),
    draft: relativeToRoot(root, value.draftPath),
  }
}

function runCli(cliEntry, cwd, args, { input, signal } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd,
      env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      signal,
      timeout: 30_000,
      shell: false,
    })
    const stdout = []
    const stderr = []
    let bytes = 0
    const collect = (target) => (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL')
        reject(new Error(`LWC output exceeded ${MAX_OUTPUT_BYTES} bytes`))
        return
      }
      target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.on('error', reject)
    child.on('close', (code, childSignal) => {
      const out = Buffer.concat(stdout).toString('utf8')
      const err = Buffer.concat(stderr).toString('utf8')
      if (code !== 0) return reject(new Error(`LWC command failed (${code ?? childSignal}): ${err || out}`))
      resolveResult(out)
    })
    child.stdin.end(input)
  })
}

function jsonOutput() {
  return {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

function textOutput() {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  }
}

export function createKnowledgeManagerTools(options = {}) {
  const cliEntry = options.cliEntry ?? resolveCliEntry()
  const runJson = async (exec, args, input) => {
    const root = await sessionRoot(exec)
    return { root, value: JSON.parse(await runCli(cliEntry, root, args, { input, signal: exec.signal })) }
  }
  const runText = async (exec, args) => {
    const root = await sessionRoot(exec)
    return (await runCli(cliEntry, root, args, { signal: exec.signal })).trimEnd()
  }

  return [
    {
      name: 'lwc_knowledge_status',
      description: 'Inspect the current session wiki structure and provenance without modifying files.',
      parameters: {}, output: jsonOutput(),
      execute: async (_args, exec) => (await runJson(exec, ['report', '.', '--format', 'json', '--top', '5'])).value,
    },
    {
      name: 'lwc_knowledge_context',
      description: 'Read a bounded, provenance-bearing context slice from the current session wiki.',
      parameters: {
        focus: { type: 'string', required: true, description: 'Wiki title or relative page path.' },
        depth: { type: 'integer', description: 'Relationship depth from 0 to 2.' },
        direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'] },
        maxPages: { type: 'integer', description: 'Page limit from 1 to 12.' },
        maxWords: { type: 'integer', description: 'Word limit from 100 to 4000.' },
      }, output: jsonOutput(),
      execute: async (args, exec) => (await runJson(exec, [
        'context', '.', '--focus', boundedText(args.focus, 'focus', 500),
        '--depth', String(boundedInteger(args.depth, 1, 0, 2, 'depth')), '--direction', args.direction ?? 'both',
        '--max-pages', String(boundedInteger(args.maxPages, 8, 1, 12, 'maxPages')),
        '--max-words', String(boundedInteger(args.maxWords, 2000, 100, 4000, 'maxWords')),
        '--format', 'json',
      ])).value,
    },
    {
      name: 'lwc_intake_create',
      description: 'Snapshot one explicit source into an isolated LWC intake; this does not edit formal wiki pages.',
      parameters: {
        source: { type: 'string', required: true, description: 'Relative source path outside .lwc.' },
        target: { type: 'string', required: true, description: 'Proposed relative Markdown target.' },
      }, output: jsonOutput(),
      execute: async (args, exec) => {
        const result = await runJson(exec, [
        'intake', 'create', '.', '--source', safeSource(args.source), '--target', safeTarget(args.target),
        '--generator', 'deepseek-harness', '--format', 'json',
        ])
        return intakeResult(result.root, result.value)
      },
    },
    {
      name: 'lwc_intake_draft',
      description: 'Write Markdown only to the one isolated draft declared by an existing LWC intake.',
      parameters: {
        intake: { type: 'string', required: true, description: 'Governed .lwc intake manifest path.' },
        markdown: { type: 'string', required: true, description: 'Complete proposed Markdown, at most 512 KB.' },
      }, output: jsonOutput(),
      execute: async (args, exec) => {
        const result = await runJson(exec, [
        'intake', 'draft', safeRelative(args.intake, 'intake', INTAKE_PATTERN), '.', '--stdin', '--format', 'json',
        ], boundedText(args.markdown, 'markdown', 512_000))
        return {
          id: result.value.intake.id,
          status: result.value.intake.status,
          target: result.value.intake.draft.path,
          draft: relativeToRoot(result.root, result.value.draftPath),
          contentHash: result.value.contentHash,
          bytes: result.value.bytes,
        }
      },
    },
    {
      name: 'lwc_intake_propose',
      description: 'Validate an isolated intake draft and create a reviewable proposal; this does not approve or apply it.',
      parameters: {
        intake: { type: 'string', required: true, description: 'Governed .lwc intake manifest path.' },
        summary: { type: 'string', required: true, description: 'Short factual reason for the proposal.' },
      }, output: jsonOutput(),
      execute: async (args, exec) => {
        const result = await runJson(exec, [
        'intake', 'propose', safeRelative(args.intake, 'intake', INTAKE_PATTERN), '.',
        '--summary', boundedText(args.summary, 'summary', 500), '--format', 'json',
        ])
        return {
          intakeId: result.value.intake.id,
          intakeStatus: result.value.intake.status,
          proposalId: result.value.proposal.id,
          proposalStatus: result.value.proposal.status,
          summary: result.value.proposal.summary,
          proposal: relativeToRoot(result.root, result.value.proposalFile),
          changes: result.value.proposal.changes.map((change) => ({
            path: change.path,
            operation: change.operation,
            baseHash: change.baseHash,
            contentHash: change.contentHash,
          })),
        }
      },
    },
    {
      name: 'lwc_proposal_show',
      description: 'Show one governed LWC proposal and diff for human review without changing its state.',
      parameters: {
        proposal: { type: 'string', required: true, description: 'Governed .lwc proposal path.' },
      }, output: textOutput(),
      execute: async (args, exec) => runText(exec, [
        'proposal', 'show', safeRelative(args.proposal, 'proposal', PROPOSAL_PATTERN), '--format', 'markdown',
      ]),
    },
  ]
}
