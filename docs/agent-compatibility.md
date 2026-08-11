# Agent compatibility — llm-wiki-canvas

This matrix verifies repository integration files and the shared review contract. It does not claim that a proprietary host binary was executed.

- Canonical rules: `AGENTS.md`
- Canonical Skill: `.agents/skills/llm-wiki-canvas/SKILL.md`
- Result: **4 ready · 1 manual · 0 incomplete**

| Host | Status | Integration | Evidence |
| --- | --- | --- | --- |
| Codex | **ready** | AGENTS.md + project Skill | `AGENTS.md` pass<br>`.agents/skills/llm-wiki-canvas/SKILL.md` pass |
| Claude Code | **ready** | CLAUDE.md + project Skill adapter | `AGENTS.md` pass<br>`.agents/skills/llm-wiki-canvas/SKILL.md` pass<br>`CLAUDE.md` pass<br>`.claude/skills/llm-wiki-canvas/SKILL.md` pass |
| Qoder | **ready** | AGENTS.md + project Skill adapter | `AGENTS.md` pass<br>`.agents/skills/llm-wiki-canvas/SKILL.md` pass<br>`.qoder/skills/llm-wiki-canvas/SKILL.md` pass |
| TRAE | **ready** | AGENTS.md + shared project Skill | `AGENTS.md` pass<br>`.agents/skills/llm-wiki-canvas/SKILL.md` pass |
| Tencent WorkBuddy | **manual** | Explicit workspace references | `AGENTS.md` pass<br>`.agents/skills/llm-wiki-canvas/SKILL.md` pass<br>`AGENTS.md + .agents/skills/llm-wiki-canvas/SKILL.md` manual |

## Interpretation

- **ready**: required repository rules and Skill entry points are present and internally consistent.
- **manual**: the shared contract is valid, but the host requires explicit file attachment or workspace context.
- **incomplete**: at least one required file is missing, unsafe, or stale.

All hosts must preserve the same boundary: Agents may inspect and create proposals; review and apply remain explicit human-controlled transitions.
