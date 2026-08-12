# Open Knowledge Format v0.2

LLM Wiki Canvas 可以读取和检查本地 [Open Knowledge Format（OKF）v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) Bundle。这样，Obsidian 与编码 Agent 使用的同一份 Markdown 图谱可以携带可移植的信任信号；项目仍不需要服务端、模型、数据库或 MCP。

## 已实现范围

| OKF v0.2 能力 | LLM Wiki Canvas 的行为 |
| --- | --- |
| 根目录 `okf_version` | 自动识别并写入 `graph.okf` |
| 任意概念 `type` | 保留在图节点中，同时兼容现有可视化页面分类 |
| `sources` 与使用元数据 | 解析、检查、展示在 Trust Inspector，并透传到有限 Agent 上下文 |
| `generated` / `verified` | 解析为 Actor 事件，形成“未验证 / 机器确认 / 人工复核”事实层级 |
| `status` / `stale_after` | 展示生命周期与时效；过期或废弃节点在图谱中有明确样式 |
| Attested Computation | 将 runtime、parameters、computation、executor receipt、attester 表示为契约 |
| 保留的 `index.md` / `log.md` | 按 v0.2 Bundle 规则检查 |
| Bundle 根路径链接 | `/path/to/page.md` 在本地 Bundle 内解析 |

这里没有不透明的“可信度分数”。Viewer 把来源、复核、时效并排展示，让人或 Agent 直接检查声明依据。

## 检查与查看 Bundle

```bash
lwc okf check /path/to/okf-bundle --strict
lwc okf check /path/to/okf-bundle --format json -o .lwc/okf-report.json
lwc serve /path/to/okf-bundle
```

仓库提供了一份不含真实身份和私有数据的合成示例：

```bash
pnpm okf:demo
pnpm okf:build
pnpm dev
```

打开 <http://127.0.0.1:4173/?graph=/okf-graph.json>，选择 **Release readiness**，再沿关系进入 **Release check**。Trust Inspector 会展示它的证据声明与 Attested Computation 安全边界。

## 执行与兼容边界

`lwc okf check`、图谱编译、上下文导出和 Viewer 对 Bundle 都是只读的。它们绝不执行 Attested Computation、executor、attester、代码块中的 SQL/Python 或引用的 Skill。OKF 当前承担知识交换格式的职责；计算沙箱、ABI 与 receipt 验证需要单独的执行策略，本项目不会自行推断。

未知概念类型和额外 frontmatter 字段会尽量保留或容忍。检查器会拒绝格式错误的信任字段、无效生命周期、项目不支持的 OKF 版本、符号链接概念文件以及保留文件的 frontmatter 违规。LLM Wiki Canvas 是 OKF v0.2 消费者，不宣称替代官方规范或成为唯一验证器。

Datetime 字段必须使用带 `T` 和明确时区的严格 ISO 8601 形式；日历信号必须是真实存在的 `YYYY-MM-DD` 日期。最新 verification 按时间戳选择，不依赖 YAML 数组顺序。Map 和 Health 会展示全部 checker warning/error；图谱与有限上下文通过节点 `metadata` 保留生产者自定义 frontmatter。

兼容回归固定使用 Google Cloud 在提交 `374e0bc4c644310ff56cdf9c0fe81eccdec862b0` 中的合成 Acme Retail Bundle。该上游 fixture 的 `log.md` 带有 frontmatter，与 v0.2 保留文件规则不符；回归会保留并明确报告这一规范错误，而不是静默放宽检查器。

背景资料：Google Cloud 的 [OKF v0.2 信任信号介绍](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals/)与[参考仓库](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)。
