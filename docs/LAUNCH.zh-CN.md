# 发布攻略（内部）—— engram 中文版

[English](./LAUNCH.md) | 简体中文

> 状态：**发布前清单已全部完成**（包已上线 npm v0.1.1、GIF、文案、反馈漏斗
> 全就绪）。本文档剩下的部分就是你的行动指南。

## 发布前清单 —— ✅ 全部完成

- ✅ GitHub 公开仓库 + topics，CI 绿
- ✅ npm 名称 `@jnmetacode/engram`（scope 已归属，包已发布 v0.1.1）
- ✅ 干净环境 `npx` 验证通过
- ✅ Hero GIF（`docs/demo.gif`，可用 `docs/demo.tape` 随时重录）
- ⬜ *(可选)* 给仓库配 `NPM_TOKEN` secret——以后推 tag 就能 CI 自动发布
  （现在没有它也不报错，发布步骤会优雅跳过）

## Show HN 发帖（你的主战场）

**什么时候发**：挑一个**周二或周三**，**太平洋时间早上 8 点**（北京时间
当天 23:00 或 24:00，夏令时为 23:00）。发完**前 3 小时守在评论区，每条
必回**——HN 的排名算法重度依赖早期互动。

**在哪发**：https://news.ycombinator.com/submit
- Title 栏粘贴下面的标题，URL 栏填 `https://github.com/jnMetaCode/engram`，
  text 正文部分发出后立即用第一条评论补充（HN 惯例：URL 帖把正文发成首评）。

**标题**（直接粘贴）：
> Show HN: Engram – a local, private memory layer for your notes (and your agents)

（中文意思：Engram——给你的笔记（和你的 agent）一个本地私有记忆层）

**正文**（直接粘贴，中文释义见下）：
> I wanted to ask questions of my own notes and PDFs without uploading my life to
> someone's cloud. Engram indexes your markdown, text, PDF and HTML files into a
> single local file and gives you ranked, cited recall — `engram recall "auth bug
> clock skew"` returns the passage with its `file:line` and date.
>
> Two things I cared about:
> - **Local & private.** Nothing leaves your machine. Optional semantic search and
>   answers run through a local Ollama; with no model at all it still works via a
>   built-in BM25 engine (plus phrase/proximity ranking).
> - **Time is first-class.** Every memory has a timestamp (file mtime + dates in
>   the text), recall is recency-aware, and you can do `--since week`. Most "AI
>   memory" tools are flat vector dumps with no sense of when.
>
> It also runs `engram watch` to stay live as you edit, and as an **MCP server** so
> Claude/any agent can recall and store memories locally. Zero dependencies (Node
> built-ins), MIT.
>
> Repo: https://github.com/jnMetaCode/engram — try it in 30s with the sample notes
> in `examples/`. Early MVP; would love feedback on recall ranking and PDF
> extraction quality.

**正文中文释义**：我想直接向自己的笔记和 PDF 提问，又不想把生活上传到别人的
云。engram 把你的 md/txt/PDF/HTML 索引成一个本地文件，给你带引用（文件:行号
+日期）的排序召回。我在意两点：①本地隐私——什么都不外传，语义检索走本地
Ollama，不装模型也有内置 BM25；②时间是一等公民——每条记忆带时间戳、按新近
度排序、支持 `--since week`，而多数"AI 记忆"工具只是没有时间概念的向量堆。
还有 watch 实时模式和 MCP server（Claude 可直接读写你的本地记忆）。召回还会
**自我进化**：用 `engram reinforce`（agent 用 `engram_reinforce` MCP 工具）确认
哪个出处答对了，相似查询就会把它排得更高——有界、可审计、绝不复活不相关结果。
零依赖、MIT。期待对召回排序和 PDF 提取质量的反馈。

**回评论要点**：
- 被问"和 XX 有什么区别"→ 答差异点（本地+时间维度+零依赖），不贬低对方
- 被问排序原理 → 甩博客链接（`blog-why-local-memory.md`，发帖当天先发到
  你的博客/dev.to）
- 有人报召回 bad case → 感谢 + 引导用 `recall-quality` issue 模板提交
  （会直接变成测试用例）
- 语气：诚实标注"early MVP"，别过度承诺

## 其他渠道（HN 后 1-2 天，文案在英文版里粘贴即用）

- **r/LocalLLaMA**：完整帖子已写好（见英文版 LAUNCH.md "Other channels"）
- **r/ObsidianMD / r/PKMS**：换角度——只讲"终端查询你的笔记库、带引用和
  日期、数据不出机器"，先别提 agent/MCP（笔记人群在意隐私和引用）
- **X 线程**：四条推已写好，第 1 条配 GIF，发完置顶
- **博客长文**：`blog-why-local-memory.md` 已成稿，发帖当天同步发布

## 三件套联动

tracelet 调试 agent、skillet 给 agent 装技能、engram 给 agent（和你）记忆
——每个 README 底部已互链 + 指向 umbrella 仓库。engram 先发，两周后 skillet，
再两周 tracelet，每次发布都给另外两个引流。

## 有起色之后

- 有了 star/issue 就开 GitHub Sponsors
- issue 里呼声最高的文件类型优先做（EPUB 可能性大）
- 第二波故事：MCP server 让 engram 成为 Claude/agent 的即插记忆
