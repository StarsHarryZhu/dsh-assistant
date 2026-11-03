# 助理（@starsharryzhu/dsh-assistant）

DeepSeek Harness 插件：给不熟悉 AI 的家人一个能一直聊下去的助理。每个助理有自己的工作区、设置和一段持续对话；复杂的活交给后台小帮手，家人只需要说话。

## 安装

在 DSH 桌面端或网页版的插件页安装 `@starsharryzhu/dsh-assistant`，或者在命令行：

```bash
dsh plugin --profile <profile> add @starsharryzhu/dsh-assistant
```

两个子插件 `@starsharryzhu/complete-subagent` 和 `@starsharryzhu/im-robot` 会作为依赖一起装好。

## 功能

- 左侧栏的「助理」直接进入上次的对话；对话标题是菜单，用来切换或新建助理。新建只要名字、称呼（可选）和工作区。
- 每个助理各有一个工作区、一份设置、一段不会断的对话；模型和推理强度在输入框或 IM 标签里选，各记各的。
- 上下文用到设定比例（默认 50%）就自动整理，不用开新对话。
- 默认只能改自己的工作区；权限可选只读、工作区写入（默认）、完全访问，在 IM 标签里改。
- 余额低于阈值（默认 10 元）时在回复末尾提醒，话术可改。
- 人设会按明确证据自我修正，有冷却期和长度上限，可以回滚；画像记录助理该一直记得的事。
- 日程、提醒、每日简报、看门狗、`/ddl` 周视图。
- 记录都是工作区里的普通文件：日程 `ddl.md`、清单 `lists/`、备忘 `memo.md`、流水 `logs/`、画像 `profile.md`、人设 `persona.md`、项目 `projects/`。不记密码、银行卡号和证件号。
- 微信：在 IM 标签里扫码绑定，之后微信和网页进同一段对话；回复是纯文字，按句子切成每条不超过 100 字（可改）。
- 工具双向隔离：助理的工具不会出现在普通会话，普通会话和其他插件的工具也进不了助理。

## 怎么工作的

家人的对话分两层，各是一个隐藏的 agent preset（新建会话时看不到）：

- **对话层（router）**：聊天、派活、审批权限，顺便记下简单信息。除了只能碰固定文件的记录工具，它没有写文件、命令行和联网工具，所以不会因为干活而卡住。
- **执行层（worker）**：查资料、做规划、写文档这些活交给子插件 complete-subagent 派出的小帮手，只能改分给它的文件夹；要改别处就向对话层申请，对话层自动审，拿不准时用一句白话问家人，不弹问答框。
- **少打扰**：开始干活只说一句要做什么，之后只在有结果、有只能家人做的决定、或事情做不成时开口；不汇报过程，一次只问一个问题。
- **外部内容只当资料**：网页、搜索结果、文件、转发的消息里写的「指令」不执行，也不能用来放行权限、删除、发送或花钱。

## 设置

分两处，保存后立即生效。数字可以删空重写，离开输入框时自动修正。

- **插件页**（所有助理共用）：worker 模型（可多选）、自动整理比例、余额阈值/查询间隔/提醒话术、人设开关/冷却期/长度上限。
- **每个助理的「设置」标签**：名字和称呼、日程提醒提前量、每日提醒时间、看门狗时限、微信开关和单条长度。

## 子插件

子插件是独立的 npm 包，写死版本放在 `dependencies` 里，只在助理的两个隐藏 preset 里生效：

- `@starsharryzhu/complete-subagent`：后台小帮手和写权限申请。
- `@starsharryzhu/im-robot`：微信接入。

如果另外单独装了其中一个，本插件自带的那份会自动关掉。

## 已知限制

- 助理对话用的是 DSH 自己的对话界面，其他修改该界面的插件也会影响它。
- 助理对话仍会出现在普通会话列表的「未分组」里，从那里点开也是同一段对话。
- 只隔离工具，其他插件注入的全局提示词上下文没有过滤。
- 微信只收发文字；页面上暂时不能发图片和文件。
- 助理和小帮手改不了工作区外的文件；在 0.2.1-rc.5 上，批准的路径只能用写文件工具改。
- 需要 DSH 0.2.1-rc.5 或更新；在 macOS 上验证过 0.2.2-alpha.2 和 0.2.1-rc.5 的宿主，桌面版应用本身还要再实测。

## 开发

```bash
node scripts/link-dev.mjs
npm test
```

`lib/` 是构建产物，要提交；改 `src/` 后运行 `node build.js`。

## 致谢

- [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)（MIT）和 DeepSeek 的 Super-agent 文章：双层结构、对话规范和汇报格式的参考。
- 微信协议：[`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 2.4.10（MIT）和 [`dsh-weixin-ilink`](https://www.npmjs.com/package/dsh-weixin-ilink) 0.9.1（MIT）；没有使用 Apache-2.0 的 `dsh-im-connect` 的代码。
- 二维码：[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4（MIT）。
- 子插件的组织方式参考 dsh-mnemon。

## 许可证

MIT，全文见 [LICENSE](LICENSE)。Copyright (c) 2026 Starfield。
