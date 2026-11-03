# dsh-assistant

[English](README.md) | 中文

一个用于聊天的通用 agent，基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，采用 **母 agent + worker 子 agent** 架构。

母 agent 负责对话：规划、派活、审批；worker 在后台干活。它尝试一种更自主的新式 agent 范式——由母 agent 管理 worker 的上下文、模型与推理强度、工作区和权限确认，而不是让用户逐个操作工具。单窗口的母 agent 自管理（在同一个对话里管理自己的上下文、模型和长任务）会在未来版本中逐步实现。

## 版本要求

**DeepSeek Harness 桌面版 `>=0.2.1-rc.5 <0.3.0`。** 只支持桌面版，不支持网页版和其他宿主。

## 安装

在 DSH 桌面版的插件页安装 `@starsharryzhu/dsh-assistant`，或者在命令行：

```bash
dsh plugin --profile desktop add @starsharryzhu/dsh-assistant
```

两个子插件 `@starsharryzhu/complete-subagent` 和 `@starsharryzhu/im-robot` 会作为依赖一起装好。

## 架构

两个隐藏的 agent preset，一个可见的对话：

- **母 agent（router）**——对话本身。它和你聊天，用一组只碰固定文件的窄工具记录简单信息，其余全部用 `delegate` 交给 worker。它没有通用的写文件、shell、联网和官方 subagent 工具，所以不会因为干活而卡住，随时可以接收你的下一句话。
- **worker 子 agent**——跑在另一个隐藏 preset 上的后台执行者，拥有完整的工作工具。每个 worker 拿到一个 `cwd`，只能改这个子工作区（外加临时目录）；要改别处必须 `request_write_access`，由母 agent 审批。
- **母 agent 作为管理者**——从你勾选的模型里给 worker 选模型和推理强度，把你的原话转给 worker，不轮询进度，只汇报结果、需要你做的决定或失败。worker 的上下文不会进入对话；母 agent 自己的上下文按设定比例自动整理（默认 50%）。
- **权限**——默认工作区写入，工作区外自动拒绝。工作区内且和任务相符的改动由母 agent 自动放行；可能删改重要内容或含糊的，用一句白话问你，不弹模态框。每个助理可以设为只读、工作区写入或完全访问。
- **隔离**——母 agent 的记录工具只存在于两个隐藏 preset 里，其他插件的全局工具进不来；这个包的工具也不会出现在普通会话。

## 功能

- 左侧栏的「助理」直接进入上次的对话；对话标题是菜单，用来切换或新建助理（名字、称呼、工作区）。
- 每个助理一段持续的长对话，上下文用到设定比例就自动整理。
- 每个对话可以选模型和推理强度；worker 模型是一份可多选的列表。
- 记录都是工作区里的普通文件：日程（`ddl.md`）、清单、备忘、流水、画像、人设、项目。不记密码、银行卡号和证件号。
- 日程、提醒、每日简报、看门狗、`/ddl` 周视图。
- DeepSeek 账户余额提醒，话术可改。
- 微信：通过 `im-robot` 扫码绑定，之后微信和桌面版进同一段对话；只收发文字，按句子切成短消息。
- 工具双向隔离。

## 设置

- **插件页**（所有助理共用）：worker 模型、自动整理比例、余额阈值和查询间隔、提醒话术、人设和画像的长度上限。
- **每个助理的「设置」标签**：名字和称呼、日程提醒提前量、每日简报时间、看门狗时限、微信开关和单条长度。

数字可以删空重写，离开输入框时自动修正。

## 子插件

独立的 npm 包，写死版本放在 `dependencies` 里，只在两个隐藏 preset 内生效：

- `@starsharryzhu/complete-subagent`：`delegate` 等派活工具、worker 模型选择、写权限申请。
- `@starsharryzhu/im-robot`：微信接入。

如果另外单独装了其中一个，本插件自带的那份会自动关掉。

## 状态与路线图

现在可用：母 agent / worker 分层、每个 worker 的模型与推理强度、工作区限制和母 agent 审批、自动整理上下文、记录、日程与提醒、微信、看门狗。

下一步：单窗口的母 agent 自管理——在同一个对话里管理它自己的上下文、模型选择和长任务，减少交接和人工看管。

## 已知限制

- 助理对话仍会出现在宿主会话列表的「未分组」里。
- 只隔离工具，其他插件注入的全局提示词上下文没有过滤。
- 微信只收发文字；图片和文件还不支持。
- worker 改不了工作区外的文件；在 DSH 0.2.1-rc.5 上，批准的路径只能用写文件和编辑工具改，shell 命令不行。
- 在 macOS 上的桌面版 0.2.1-rc.5 验证过；其他系统还没测。

## 开发

```bash
node scripts/link-dev.mjs
npm test
```

`lib/` 是构建产物，要提交；改 `src/` 后运行 `node build.js`。

## 许可证

MIT，全文见 [LICENSE](LICENSE)。Copyright (c) 2026 Starfield。
