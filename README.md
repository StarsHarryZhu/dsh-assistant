# dsh-assistant

English | [中文](README-zh.md)

A general-purpose chat agent for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), built on a **parent agent + worker sub-agent** architecture.

The parent is the conversation: it plans, delegates, and approves. Workers do the work in the background. The design explores a more autonomous agent pattern, where the parent manages worker context, model and reasoning effort, workspace, and permission approval instead of the user operating every tool. Single-window self-management of the parent — its own context, model, and long-running work in one conversation — will be added progressively in later versions.

## Install

Install `@starsharryzhu/dsh-assistant` from the Plugins page of DSH Desktop or the web app, or from the command line:

```bash
dsh plugin --profile <profile> add @starsharryzhu/dsh-assistant
```

The two sub-plugins `@starsharryzhu/complete-subagent` and `@starsharryzhu/im-robot` are installed with it.

## Architecture

Two hidden agent presets, one visible conversation:

- **Parent (router)** — the chat. It talks to you, records simple facts with narrow tools over fixed files, and hands everything else to a worker with `delegate`. It has no general file writes, shell, web, or official subagent tool, so it never blocks on work and can take your next message at any time.
- **Workers** — background sub-agents on their own preset, with the working toolset. Each gets a `cwd` and may modify only that sub-workspace (plus temporary directories); anything else needs `request_write_access`, which the parent answers.
- **Parent as manager** — it chooses the worker's model and reasoning effort from the models you enable, passes your request in your own words, never polls for progress, and reports only results, decisions, or failures. Worker context stays out of the conversation; the parent's own context is compacted automatically at a configurable ratio (50% by default).
- **Permissions** — workspace write by default, with automatic refusal outside. The parent auto-approves in-workspace work that matches the task; a destructive or ambiguous change gets one plain-language question, never a modal. Each assistant can be set to read-only, workspace write, or full access.
- **Isolation** — the parent's record tools exist only inside the two hidden presets, and other plugins' global tools never enter them. This package's tools never appear in normal sessions.

## What you get

- A sidebar row that opens the last assistant's conversation; the conversation title switches between assistants or creates one (name, form of address, workspace).
- One long-running conversation per assistant, with automatic compaction.
- Model and reasoning effort per conversation, and a multi-select list of worker models.
- Records as plain files in the workspace: schedule (`ddl.md`), lists, memos, logs, profile, persona, projects. Passwords, card numbers, and ID numbers are never recorded.
- Schedule, reminders, a daily brief, a watchdog, and a `/ddl` week view.
- A balance reminder for the DeepSeek account, with configurable wording.
- WeChat through `im-robot`: scan to bind, then chat from WeChat in the same conversation. Text only, split into short messages.
- Tool isolation in both directions.

## Settings

- **Plugins page** (shared by every assistant): worker models, compaction ratio, balance threshold and check interval, reminder wording, persona and profile limits.
- **Each assistant's Settings tab**: name and form of address, reminder lead time, daily brief time, watchdog timeout, WeChat switch and message length.

Numbers can be cleared and retyped; values are corrected when the field is left.

## Sub-plugins

Pinned as exact versions in `dependencies` and mounted only inside the two hidden presets:

- `@starsharryzhu/complete-subagent` — the delegation tools, worker model choice, and write-access requests.
- `@starsharryzhu/im-robot` — the WeChat bridge.

Installing either one standalone switches the bundled copy off automatically.

## Status and roadmap

Working today: the parent/worker split, per-worker model and reasoning effort, workspace confinement with parent-approved access, automatic compaction, records, schedule and reminders, WeChat, and the watchdog.

Next: single-window self-management for the parent agent — its own context, model choice, and long-running work handled in the same conversation, with fewer handoffs and less supervision.

## Known limits

- Assistant conversations still appear under "Ungrouped" in the host's session list.
- Only tools are isolated; global prompt contexts injected by other plugins are not filtered.
- WeChat is text only; images and files are not supported yet.
- Workers cannot modify anything outside their workspace; on DSH 0.2.1-rc.5 an approved path only reaches the write/edit tools, not shell commands.
- Requires DSH 0.2.1-rc.5 or newer. Verified on macOS against the 0.2.2-alpha.2 and 0.2.1-rc.5 hosts, not yet the Desktop app end to end.

## Development

```bash
node scripts/link-dev.mjs
npm test
```

`lib/` is a committed build artifact; run `node build.js` after changing `src/`.

## Acknowledgements

- [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) (MIT) and DeepSeek's Super-agent article: the two-layer design, conversation norms, and report format.
- WeChat protocol: [`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 2.4.10 (MIT) and [`dsh-weixin-ilink`](https://www.npmjs.com/package/dsh-weixin-ilink) 0.9.1 (MIT); no code from the Apache-2.0 `dsh-im-connect`.
- QR code: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 (MIT).
- Sub-plugin layout inspired by dsh-mnemon.

## License

MIT. See [LICENSE](LICENSE). Copyright (c) 2026 Starfield.
