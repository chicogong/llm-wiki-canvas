# Cross-Agent host fixture

Use the `llm-wiki-canvas` Skill in this workspace.

Work only inside this synthetic workspace. Read `source/decision.txt` and `vault/index.md` first. Then:

1. Run `node "{{LWC_ENTRY}}" intake create vault --source source/decision.txt --target "concepts/Review Boundary.md" --generator "{{HOST_NAME}}"`.
2. Edit only the declared isolated draft. Create a concise concept page titled `Review Boundary` using only facts supported by the source. It must state that Markdown remains the source of truth, that Agent-generated knowledge requires a Proposal and human review before apply, and link to `[[../index]]`.
3. Run `node "{{LWC_ENTRY}}" intake show <manifest>` and then `node "{{LWC_ENTRY}}" intake propose <manifest> vault --summary "Record the shared review boundary"`.
4. Run `node "{{LWC_ENTRY}}" proposal show <proposal>`.
5. Stop. Do not review, reject, apply, commit, or edit formal files under `vault/`.

Return the intake ID, source SHA-256, proposal ID, target path, and any unresolved issue.
