<div align="center">

# 🧠 engram

### 你的本地私有记忆层

**索引你的笔记和文件，然后召回任何内容——带出处引用、有时间感。100% 在你的机器上。**
不上云、不注册、数据不出本机。一条 `npx @jnmetacode/engram` 就够了。

```bash
npx @jnmetacode/engram ingest ~/notes
npx @jnmetacode/engram recall "我们对定价做了什么决定"
```

[English](./README.md) | 简体中文

![engram 演示 — 索引、带引用的召回、时间过滤、自我进化强化](docs/demo.gif)

</div>

---

你的笔记、日志和文档是一个"查不动"的第二大脑。市面上的"AI 记忆"服务要你把
这一切上传到他们的云端。engram 反其道而行：它在**你的机器上**建一个可检索的
记忆库，永不外联。

```bash
npx @jnmetacode/engram ingest ~/notes ~/journal       # 索引 markdown、txt、PDF、HTML……
npx @jnmetacode/engram recall "auth bug clock skew"   # 排序后的段落，带出处引用
npx @jnmetacode/engram recall "hiring" --since week   # 时间感知：只看最近的记忆
npx @jnmetacode/engram ask "总结我的定价决策"          # （可选）本地 LLM 作答
```

每条结果都精确告诉你它来自哪里——`文件:行号` 加日期——可信、可跳回原文。

> **支持的文件**：Markdown、纯文本、`org`、`rst`、**PDF**、**HTML**、**EPUB**
> ——全部用零依赖提取器。PDF/EPUB 提取尽力而为：文本型文件效果很好；扫描件、
> 加密 PDF 或带 DRM 的 EPUB 可能提取不佳。

## 为什么选 engram

- **本地优先、隐私至上。** 记忆就是磁盘上的一个 JSON 文件。Embedding 和问答
  （可选）走**本地 Ollama**——任何数据都不会离开你的电脑。
- **真正的时间维度，不是扁平的向量堆。** 每条记忆都带时间戳（文件修改时间
  *加上*正文里识别出的日期）。召回按新近度加权，支持 `--since week`、
  `--since 2026-05-01` 等——"我最近在忙什么"这种问题真的可用。
- **带引用的召回。** 结果是 `来源:行号（日期）` 加摘要片段。
- **零配置即用。** 内置 BM25 词法引擎，不装任何模型也能离线召回。想要语义
  召回时再加本地 embedding 模型——它是增强项，永远不是必需品。
- **零依赖。** 纯 Node 内置模块，几百行可读的代码。
- **也是 agent 的记忆后端。** `engram serve` 暴露一个本地小 API
  （`/remember`、`/recall`），让你的 AI agent 拥有私有、持久的记忆。

## 安装与使用

```bash
# 索引一些笔记（markdown、txt、org、rst……）
npx @jnmetacode/engram ingest ~/Documents/notes

# ……或保持实时——边编辑边自动重建索引
npx @jnmetacode/engram watch ~/Documents/notes

# 召回——词法 + 时间，完全离线
npx @jnmetacode/engram recall "postgres migration plan"
npx @jnmetacode/engram recall "standup notes" --since 7d --limit 5

# 可选：通过本地 Ollama 获得语义召回与问答
npx @jnmetacode/engram ingest ~/notes --embed           # 一次性计算 embedding
npx @jnmetacode/engram recall "那个关于缓存的想法" --semantic
npx @jnmetacode/engram ask "我在 auth 上还有哪些待解决的问题？"

# 日常维护
npx @jnmetacode/engram status
npx @jnmetacode/engram forget old-project
```

> **第一次用？** [`examples/`](examples/) 里有三条示例笔记和一个 30 秒的
> 走查教程——索引 → 召回 → 时间过滤。

## 工作原理

```
  文件 ──切块──▶ 记忆库（本地单个 JSON 文件）
                    │  每块：文本 · 来源:行号 · 时间戳 · 词频 · [embedding]
  recall(query) ────┤
                    ├─ BM25 词法打分           （始终可用，离线）
                    ├─ 语义余弦相似度          （可选，本地 Ollama）
                    └─ 时间新近度加权 + 过滤   （多数工具缺的就是这个）
                        → 排序后的、带引用的段落
```

存储就是一个普通 JSON 文件（默认 `~/.engram/store.json`）。备份它、查看它、
删掉它——它完全属于你。

## 给 agent 用的记忆

```bash
npx @jnmetacode/engram serve            # http://127.0.0.1:7077（仅本机）
```

```bash
curl -s localhost:7077/remember -d '{"text":"发布日期定为 2026-07-01"}'
curl -s localhost:7077/recall   -d '{"query":"发布日期"}'
```

这是托管式 agent 记忆服务的开放本地替代品。把你的 agent 指向它，记忆留在
你的机器上，同样享受时间感知排序。

### 作为 MCP server 使用（Claude 等）

engram 通过 stdio 实现 [Model Context Protocol](https://modelcontextprotocol.io)，
Claude Desktop / Claude Code 可以把你的记忆当工具调用——`engram_recall`、
`engram_remember`、`engram_reinforce`、`engram_status`。加入 `claude_desktop_config.json`（或项目
的 `.mcp.json`）：

```json
{
  "mcpServers": {
    "engram": {
      "command": "npx",
      "args": ["-y", "@jnmetacode/engram", "mcp"]
    }
  }
}
```

模型就能在对话中召回你的笔记、写入新记忆——全部在本地。零依赖、无 SDK：
就是几百行纯 Node 实现的 stdio JSON-RPC（规范版本 2025-06-18）。

## 自我进化的召回（`reinforce`）

召回会越用越准。当某次召回命中了正确答案，告诉它：

```bash
npx @jnmetacode/engram recall "staging 部署失败"
npx @jnmetacode/engram reinforce "staging 部署失败" deploy-notes.md
```

engram 会记下"这类查询的答案在那个出处"（普通的、可直接查看的数据，就在你的
存储文件里），之后相似查询会给该出处一个**有界**加成。它只会重排相关结果，
绝不会把不相关的内容拉回来；`forget` 删除来源时反馈记录一并清除。
Agent 也能自己做这件事——通过 `engram_reinforce` MCP 工具：验证答案、强化它，
共享记忆随每个任务变得更锋利（参见
[`self-evolve` 技能](https://github.com/jnMetaCode/skillet/tree/main/skills/self-evolve)）。

## 可选：本地 embedding（Ollama）

engram 永远不会把你的数据发到任何地方。语义召回走的是**本地**
[Ollama](https://ollama.com)：

```bash
ollama pull nomic-embed-text     # embedding 模型
ollama pull llama3.2             # 供 `engram ask` 使用
```

不装 Ollama，engram 的词法 + 时间模式照样好用。

## 命令一览

| | |
| --- | --- |
| `engram ingest <路径...>` | 索引文件/文件夹（`--embed` 开启语义） |
| `engram watch <路径...>` | 索引后监听变更自动重建（实时记忆） |
| `engram recall <查询>` | 带引用的段落（`--since`、`--until`、`--limit`、`--semantic`） |
| `engram ask <问题>` | 基于记忆作答（需要 Ollama） |
| `engram reinforce "<查询>" <出处>` | 自我进化召回：确认哪个出处答对了 |
| `engram status` | 查看存储状态 |
| `engram forget <子串>` | 按来源删除记忆 |
| `engram serve` | 给 agent 用的本地记忆 API（HTTP） |
| `engram mcp` | 作为 MCP server 运行（stdio），供 Claude/agent 使用 |

## 状态

早期 MVP。词法 + 时间召回、引用、索引/遗忘、增量重建、**实时 `watch` 模式**、
本地 agent API、**MCP server**、**PDF + HTML + EPUB 摄取**（零依赖提取器）、可选的
Ollama embedding/问答——以上今天全部可用。召回质量有 26 条查询的基准测试
守护（hit@1 92%）。路线图：面向大型笔记库的 SQLite 存储。
欢迎 Star/Watch 关注进展。

## 姊妹项目

同属一个小巧、本地优先、零依赖的 AI agent 工具套件——见
[套件总览与端到端示例](https://github.com/jnMetaCode/local-agent-toolkit)：

- 🧠 **engram** —— agent（和你）的本地私有记忆层 *(本仓库)*
- 🍳 **[skillet](https://github.com/jnMetaCode/skillet)** —— agent 技能包管理器
- 🔭 **[tracelet](https://github.com/jnMetaCode/tracelet)** —— 调试 agent 运行的本地 DevTools

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
