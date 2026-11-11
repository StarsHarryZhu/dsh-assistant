# dsh-assistant

English | [中文](README-zh.md)

A general-purpose chat agent for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), built on a **parent agent + worker sub-agent** architecture.

The parent is the conversation: it plans, delegates, and approves. Workers do the work in the background. The design explores a more autonomous agent pattern, where the parent manages worker context, model and reasoning effort, workspace, and permission approval instead of the user operating every tool. Single-window self-management of the parent — its own context, model, and long-running work in one conversation — will be added progressively in later versions.

## Requirements

**DeepSeek Harness Desktop `>=0.2.1-rc.5 <0.3.0`.** Only the Desktop app is supported; the web app and other hosts are not.

## Install

Install `@starsharryzhu/dsh-assistant` from the Plugins page of DSH Desktop, or from the command line:

```bash
dsh plugin --profile desktop add @starsharryzhu/dsh-assistant
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
- A schedule with reminders and a `/ddl` week view, a daily brief every morning, and a watchdog.
- A heartbeat instead of automation tasks: the assistant wakes on its own every hour, and to the minute for what is due, and it can set its own wake-ups. Whether a heartbeat with nothing due calls the model is a setting.
- Quiet hours, daily and temporary. Reminders inside them move to the evening before or the next morning; other WeChat messages wait for their end. The assistant changes them only when you ask.
- Your own time zone in the profile, worked out from where you say you are and from your schedule, never from the device.
- A balance reminder for the DeepSeek account, with configurable wording.
- WeChat through `im-robot`: scan to bind, and the assistant introduces itself; then chat from WeChat in the same conversation. The assistant decides for each reply whether it also goes to WeChat, so what you need to see reaches you there wherever you last wrote. Images, files, voice, and video you send are shown in the conversation and saved in the workspace's `IM/WeChat/` for 30 days (adjustable; 0 keeps them); the assistant copies a file out before working on it. Replies are text split into short messages; the assistant can also send pictures, videos, and files from its workspace, which show in WeChat as pictures, videos (MP4 and MOV), or files to open.
- Tool isolation in both directions.

## Settings

- **Plugins page** (shared by every assistant): worker models, compaction ratio, balance threshold and check interval, reminder wording, persona and profile limits.
- **Each assistant's Settings tab**: name and form of address, reminder lead time, daily brief time, heartbeat interval and idle wake, quiet hours, watchdog timeout, WeChat switch and message length. Its **Shared settings** button opens the Plugins page settings.

Numbers can be cleared and retyped; values are corrected when the field is left.

## Sub-plugins

Pinned as exact versions in `dependencies` and mounted only inside the two hidden presets:

- `@starsharryzhu/complete-subagent` — the delegation tools, worker model choice, and write-access requests.
- `@starsharryzhu/im-robot` — the WeChat bridge.

Installing either one standalone switches the bundled copy off automatically.

## Status and roadmap

Working today: the parent/worker split, per-worker model and reasoning effort, workspace confinement with parent-approved access, automatic compaction, records, schedule and reminders, heartbeats and quiet hours, WeChat in and out, and the watchdog.

Next: single-window self-management for the parent agent — its own context, model choice, and long-running work handled in the same conversation, with fewer handoffs and less supervision.

## Known limits

- The sidebar's content search can still find assistant conversations.
- WeChat lets the assistant write first only for about a day after your last WeChat message (more precisely, third-party reports say so; Tencent documents no rule). Shortly before that — and before quiet hours if it would close in them or soon after — the assistant asks you on WeChat to reply once. If the day has passed anyway, what could not be sent waits and goes out as soon as you write on WeChat again (up to a day old), and the IM tab says so.
- Heartbeats stop while the app is closed or the computer sleeps; what is still ahead is given on waking.
- The app keeps its own copy of every image and file shown in a conversation, even after `IM/WeChat/` has removed the original.
- Only tools are isolated; global prompt contexts injected by other plugins are not filtered.
- The assistant cannot send voice messages; an audio file goes as a file. Only files inside the assistant's workspace can be sent, up to 100 MB each. Voice you send stays as raw SILK audio, with WeChat's transcript as its text.
- Workers cannot modify anything outside their workspace; on DSH 0.2.1-rc.5 an approved path only reaches the write/edit tools, not shell commands.
- Verified on macOS with Desktop 0.2.1-rc.5 and 0.2.2-rc.1; other systems are untested.

## Development

```bash
node scripts/link-dev.mjs
npm test
```

`lib/` is a committed build artifact; run `node build.js` after changing `src/`.

## License

MIT. See [LICENSE](LICENSE). Copyright (c) 2026 Starfield.
