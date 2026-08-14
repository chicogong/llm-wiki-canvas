import { defineTool } from '@deepseek-ai/dsh-tools'
import { createKnowledgeManagerTools } from './lib/manager.js'

export const name = 'lwc-knowledge-manager'
export const inject = ['tools']

export function apply(ctx) {
  for (const specification of createKnowledgeManagerTools()) {
    ctx.tools.register(defineTool(specification))
  }
}
