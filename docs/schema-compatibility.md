# Schema compatibility / Schema 兼容策略

LLM Wiki Canvas treats generated files as public interfaces even though they are rebuildable. Every JSON reader must inspect the declared schema or format version and reject unsupported future versions rather than silently guessing.

LLM Wiki Canvas 把可重建的生成文件仍然视为公开接口。所有 JSON 读取端都必须检查声明的 schema 或格式版本；遇到未来未知版本时应明确拒绝，不能静默猜测。

| Artifact | Current contract | Compatibility promise |
| --- | --- | --- |
| Graph and structural report | `schemaVersion: 1` | Existing fields retain their meaning; additive optional fields are allowed in minor releases. |
| Intake manifest | `schemaVersion: 1` | Source hash, snapshot, declared target, generator, and lifecycle state remain required evidence. |
| Proposal | `schemaVersion: 1` | Exact changes, hashes, lifecycle state, and optional intake provenance keep their semantics. |
| Agent compatibility and scaffold plans | `schemaVersion: 1` | Repository-relative evidence remains portable and host status meanings remain stable. |
| Host runtime report | `schemaVersion: 1` | `status` and `evidenceKind` distinguish pass, block, unavailable, and failure. |
| Bounded context bundle | `schemaVersion: 1` | Focus, limits, relative paths, hashes, distances, truncation, and omission retain their meanings. |
| Obsidian Canvas | JSON Canvas `1.0` | Generated nodes/edges use the open format; known manual positions are preserved. |
| Excalidraw | file format `version: 2` | Scene elements stay editable; stable generated IDs preserve positions when possible. |
| Mermaid | text export | Output targets broadly supported flowchart syntax; it is a derived view, not persisted truth. |

Within a schema version, patch and minor releases may add optional fields but must not reinterpret or remove existing ones. A required-field removal, lifecycle reinterpretation, hash change, or incompatible ID rule requires a new schema version, migration notes, fixture updates, and a changelog entry. Markdown remains the source of truth; generated artifacts may always be rebuilt after migration.

在同一 schema version 内，补丁版和次版本可以增加可选字段，但不能重新解释或删除已有字段。删除必填字段、改变生命周期含义、更换哈希规则或采用不兼容 ID 规则时，必须提升 schema version，同时提供迁移说明、fixture 更新和 Changelog 记录。Markdown 始终是事实源，迁移后可以重新生成全部投影。
