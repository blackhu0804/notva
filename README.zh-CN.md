# Notva

[English README](./README.md)

Notva 是一个 AI 维护的个人知识库。它遵循 LLM Wiki 模式：保存原始资料，维护可长期阅读和编辑的 Markdown Wiki，并在回答问题或执行任务前先从知识库检索上下文。

## 当前状态

Notva 仍处于早期阶段。当前里程碑是一个本地优先的 CLI/Core MVP，并带有本地 Web 工作台。

## 核心工作流

```text
捕获原始资料
-> 生成可审核的 Wiki 提案
-> 将接受的提案写入 Markdown 页面
-> 从已审核 Wiki 中检索证据
-> 在执行后续任务前构建上下文包
-> 根据薄弱或陈旧的上下文执行维护动作
-> 通过图谱、报告、解释和路径查询审计知识关系
```

Notva 将原始输入保存在 `raw/`，将已审核知识保存在 `wiki/`，并把运行状态写入 `.notva/state.db`。

默认知识库路径是 `~/Notva`。这意味着你可以在任意目录运行 `notva init`、`notva ingest`、`notva query`、`notva act` 和 `notva serve`。也可以用 `--vault /path/to/vault` 为单次命令指定路径，或通过 `NOTVA_VAULT=/path/to/vault` 修改默认知识库位置。

## 快速开始

```bash
pnpm install
pnpm notva init --vault ~/Notva
pnpm notva ingest --text "# 第一条笔记\n\nNotva 可以把资料整理成可审核的 Wiki。"
pnpm notva review --apply all
pnpm notva query "Notva 能做什么？"
pnpm notva serve --vault ~/Notva --port 4321
```

打开命令输出中的本地地址即可使用 Web 工作台。

## 资料摄取

Notva 支持文本、文件、目录和 URL 摄取：

```bash
notva ingest <file|directory|url>
notva ingest /path/to/notes
notva ingest --text "content"
```

URL 摄取会把原始 HTML 保存在 `raw/`，同时根据页面标题和可见正文生成可读的 Wiki 提案。

目录摄取会递归读取常见文本文件、代码笔记、日志、结构化文本和聊天记录。当前支持 Markdown、text、HTML、JSON chat logs、JSONL、CSV/TSV、YAML/TOML/INI/env、常见编程语言、shell 脚本、SQL、CSS/XML 和 `.log` 文件。

重复摄取相同内容时，Notva 会复用已有 source 和 proposal，避免已经审核过的内容重新回到待审核队列。

## 审核与 Wiki 页面

Notva 默认不会静默改写你的长期 Wiki。摄取、查询和执行任务产生的内容都会先进入提案队列：

```bash
notva review
notva review --apply all
notva page list
notva page show <path>
notva page save <path> --content-file file
```

审核时，CLI 和 Web review cards 会显示每个提案对应的 source evidence，包括 source ID、原始来源和 raw preview。

当新资料明确提到已有 Wiki 页面标题时，Notva 会在提案中加入 `Related Wiki Pages` 和 `[[Wiki Link]]`，帮助新笔记进入图谱关系，而不做模糊推断。

## 查询与上下文

```bash
notva query "question"
notva query "question" --propose
notva context "question or task"
notva context "question or task" --json
```

查询结果会展示 source provenance，包括每个已审核 Wiki 命中的支持 source ID 和原始来源。`notva query "question" --propose` 可以把一次有价值的查询结果重新变成可审核 Wiki 提案。

Notva 的查询和上下文包使用混合检索和重排。当前本地语义基线会组合词面匹配、轻量向量相似度以及 rerank 分数，并在 evidence 中暴露 lexical、vector 和 rerank scores。后续可以接入 provider-backed embeddings，而不改变 retrieve-then-act 的使用方式。

原始资料命中会作为二级证据出现。它们适合提示知识库还有哪些内容没有沉淀，但在作为长期知识使用前应该先审核或提升为 Wiki 页面。

## 执行任务

```bash
notva act "task"
notva act "task" --json
notva act "task" --run-actions --json
notva act "task" --propose
notva act list
notva act show <id>
notva act propose <id>
```

`notva act "task"` 会先检索上下文包，再输出执行计划和任务结果。执行计划状态可能是 `ready`、`needs_maintenance` 或 `missing_context`。

每次 act run 都会保存在 `.notva/state.db`，并在 `.notva/logs/` 中写入 Markdown 日志。你可以稍后用 `notva act show <id>` 复查上下文、执行计划和输出，也可以用 `notva act propose <id>` 将有价值的执行结果转成可审核 Wiki 提案。

Notva 的维护动作 runner 是 allowlisted 的，不执行任意 shell 命令：

```bash
notva action run --command "notva source propose --uncovered --vault /path/to/vault"
```

## 图谱层

Notva 会从已审核页面、引用、source 和 Wiki links 派生本地图谱。图谱层用于帮助用户和 agent 在阅读大量原始文件前，先看到知识关系。

```bash
notva graph export --vault /path/to/vault
notva graph html --vault /path/to/vault
notva explain <page-or-concept> --vault /path/to/vault
notva path <from> <to> --vault /path/to/vault
notva report --vault /path/to/vault
notva concepts propose --vault /path/to/vault
```

已解析的 Wiki links 会成为页面到页面的关系。未解析的显式链接，例如 `[[Loose Concept]]`，会成为 open concept node，用来提示未来应该创建哪些页面。

`notva graph html` 会写出 `.notva/graph.html`，这是一个可离线打开的图谱查看器，包含节点列表、关系列表、轻量 SVG 图、搜索、筛选和聚焦控件。

`notva report` 会写出 `.notva/graph-report.md`，包含连接页面、孤立页面、开放概念、没有 Wiki 覆盖的 source、跨页面链接、不确定关系和建议问题。

## Source 与维护

```bash
notva source list
notva source show <id>
notva source propose <id>
notva source propose --uncovered
notva links propose
notva concepts propose
notva lint
notva reindex
notva status
notva doctor
```

`notva source propose <id>` 可以把已保存的 raw source 重新放回审核队列。`notva source propose --uncovered` 会把还没有 accepted Wiki coverage 的 raw source 全部提升为提案。

`notva links propose` 会扫描已审核页面中提到但还没有显式 Wiki link 的页面标题，并生成可审核更新提案。

`notva status` 会展示 source、page、pending proposal、lint issue 和 act run 数量。`notva doctor` 适合做 onboarding 和 release smoke checks：它会检查知识库是否初始化、汇总健康状态和图谱产物，并给出下一步 Notva 命令。

## Vault Rules

```bash
notva rules show
notva rules save --content-file file
```

Vault Rules 默认保存在 `schema/notva.md`。这些规则会进入每个 context pack，让后续 agent 按你的引用、命名和维护偏好工作。

## Provider 适配器

`@notva/providers` 定义了 LLM、embedding、parser、search 和 storage 的 Provider 适配器边界。当前 MVP 提供本地默认实现，避免 core 直接绑定某个远程模型供应商：

```text
local-rule-based
local-noop-embedding
local-substring-search
```

## Agent 指令安装

Notva 可以安装 context-first 的 Codex 指令，让未来 agent session 在大范围读文件前先查询 Notva：

```bash
notva install --platform codex
notva install --platform codex --project
```

用户级安装会写入 Codex 配置目录下的 Notva skill。项目级安装会写入 `AGENTS.md` 片段，并输出 `git add AGENTS.md` 提示。

## 本地 Web 工作台

```bash
pnpm notva serve --vault /path/to/vault --port 4321
```

Web 工作台支持中文界面，包含资料摄取、审核、查询、执行、上下文、规则编辑、图谱、报告和维护动作。

其中 act 面板提供 `运行并沉淀`，可以执行任务并立刻生成可审核 Wiki 提案；`整理后运行` 会先执行建议维护动作，再返回更新后的执行计划；执行历史面板可以通过 `生成提案` 将某次 run 变成提案。

## Vault 布局

```text
.notva/
  config.json
  state.db
  queue/
  logs/
raw/
wiki/
schema/
index/
```

## 发布边界

仓库根目录保持 `private`，它是 monorepo 的开发入口，不是用户安装的 npm artifact。

可发布 CLI package 位于 `packages/cli`，包名是 `notva`，并暴露 `notva` bin。`@notva/core`、`@notva/server` 和 `@notva/providers` 是带 `dist` exports 的 typed workspace packages。`@notva/web` 在拥有独立分发方案前保持 private。

Notva 使用 MIT 许可证。发布公开仓库或 npm package 前，请保持 `LICENSE` 和各 package 的 `license` 字段一致。

## 开发

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```
