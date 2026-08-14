import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createKnowledgeManagerTools } from '../lib/manager.js'

const cliEntry = resolve(import.meta.dirname, '../../../dist/index.js')
const byName = () => new Map(createKnowledgeManagerTools({ cliEntry }).map((tool) => [tool.name, tool]))
const execFor = (cwd) => ({ agent: { session: { header: { cwd } } }, signal: new AbortController().signal })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lwc-dsh-'))
  await writeFile(join(root, 'index.md'), '# Knowledge\n\n[[Existing]]\n')
  await writeFile(join(root, 'Existing.md'), '# Existing\n\nA governed fact.\n')
  await writeFile(join(root, 'source.md'), '# Source\n\nA new fact.\n')
  return root
}

test('exposes only the six governed knowledge-manager tools', () => {
  assert.deepEqual([...byName().keys()], [
    'lwc_knowledge_status', 'lwc_knowledge_context', 'lwc_intake_create',
    'lwc_intake_draft', 'lwc_intake_propose', 'lwc_proposal_show',
  ])
})

test('runs source to isolated draft to proposal without editing formal Markdown', async () => {
  const root = await fixture()
  try {
    const tools = byName()
    const exec = execFor(root)
    const status = await tools.get('lwc_knowledge_status').execute({}, exec)
    assert.equal(status.summary.pages, 3)
    const context = await tools.get('lwc_knowledge_context').execute({ focus: 'Existing' }, exec)
    assert.equal(context.pages[0].path, 'Existing.md')
    const created = await tools.get('lwc_intake_create').execute({ source: 'source.md', target: 'Research/New.md' }, exec)
    assert.match(created.intake, /^\.lwc\/drafts\/intake-[a-f0-9]{12}\/intake\.json$/)
    assert.equal(created.source.path, undefined)
    const markdown = '# New\n\nSource-grounded knowledge.\n'
    const drafted = await tools.get('lwc_intake_draft').execute({ intake: created.intake, markdown }, exec)
    assert.equal(drafted.target, 'Research/New.md')
    await assert.rejects(readFile(join(root, 'Research/New.md'), 'utf8'))
    const proposed = await tools.get('lwc_intake_propose').execute({ intake: created.intake, summary: 'Add reviewed research' }, exec)
    assert.equal(proposed.proposalStatus, 'proposed')
    assert.match(proposed.proposal, /^\.lwc\/proposals\/proposal-[a-f0-9]{12}\.json$/)
    assert.equal(proposed.changes[0].content, undefined)
    assert.equal(proposed.changes[0].path, 'Research/New.md')
    const shown = await tools.get('lwc_proposal_show').execute({ proposal: proposed.proposal }, exec)
    assert.match(shown, /Source-grounded knowledge/)
    await assert.rejects(readFile(join(root, 'Research/New.md'), 'utf8'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails closed on traversal, reserved targets, broad budgets, and missing session cwd', async () => {
  const root = await fixture()
  try {
    const tools = byName()
    const exec = execFor(root)
    await assert.rejects(() => tools.get('lwc_intake_create').execute({ source: '../secret.md', target: 'New.md' }, exec), /parent segments/)
    await assert.rejects(() => tools.get('lwc_intake_create').execute({ source: 'source.md', target: 'index.md' }, exec), /not index\.md/)
    await assert.rejects(() => tools.get('lwc_knowledge_context').execute({ focus: 'Existing', depth: 3 }, exec), /0 to 2/)
    await assert.rejects(() => tools.get('lwc_proposal_show').execute({ proposal: '/tmp/proposal.json' }, exec), /relative path/)
    await assert.rejects(tools.get('lwc_knowledge_status').execute({}, {}), /absolute path/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
