# AGENTS.md

## 1. Role

Host-side modules the entry plugins share, and the two prompts. Each module owns one concern and takes its services as arguments, so the specs drive it with fakes: the calendar and the time-zone projection, the `ddl.md` fast path, the workspace context, the balance, preset hiding, the tool fence, the assistant list planning, the record tools, the assistant conversation's own tools, the WeChat link, the conversation title, the watchdog, the heartbeat, and quiet hours. The prompts are copied next to the emitted modules by the build.

## 2. Constraints

- No module reads cordis context directly; the entries wire services in.
- Every host call must exist on the oldest host in `engines.dsh`, 0.2.1-rc.5: a spec's fake proves nothing about that. Methods added later go through a fallback (`compat.ts`), and a missing one is reported, not ignored.
- Nothing this package hangs on a host event, timer, or microtask may let an error escape (`guarded` in `service.ts`): many fire for every session of the host, and one escaping once made every conversation unusable.
- The fast path never calls a model: anything that can be decided by parsing files is decided here. A heartbeat with nothing due reaches the model only because the user chose that (`heartbeatIdleWake`, on by default).
- Nothing here uses the host's automation tasks (`ctx.schedule`) any more, except to remove what earlier versions left there. Everything timed comes from the heartbeat, which reads `ddl.md` afresh each minute, so an item has no second record to keep in step.
- Times follow the profile's `Time zone`, never the browser's or the device's; this computer's zone is only a stand-in until one is recorded, and the context says so. That is why the presets do not mount `dsh-time-context`, whose clock knows only those two.
- Quiet hours hold back everything proactive: heartbeats, the brief, reminders (moved by `remindAt`), wake-ups, and what `im_send` sends, unless the turn holds a message from the user, comes from a wake-up the user asked for, or follows their own new binding. `quiet_set`, `brief_set`, and `through_quiet` are refused in a turn without a message from the user, on top of the prompt's rule.
- A turn no WeChat message started reaches WeChat only through `im_send`: im-robot's `autoPush` is off in this package's patch, or everything would go out twice.
- System notes the host sends into an assistant conversation start with the shared prefix in `watchdog.ts` and go through `sendHostNote` under the message source `host-note`, never as a `user` prompt: the host's conversation view draws a `user` message as the user's own words. im-robot counts a turn this source starts as a follow-up, so its answer reaches WeChat.
- The prompts are complete: the router prompt is the assistant conversation's whole system prompt, the worker prompt a worker's. `tests/workflow.test.ts` pins the rules the design depends on (conversation norms, outside content as data, the report format).
- The worker's report (in English: the status line, the result, at most one question for the user) and the router's handling of it change together.
- The router writes only through the record tools in `records/`; it has no general file write, shell, or web.
- The access rules in `router.md` promise only what works: the router cannot grant outside the workspace on any host, and on 0.2.1-rc.5 a grant does not reach a worker's shell. End-to-end checks of file access need a workspace outside `/tmp`, which is always writable.

## 3. Contents

- `types.ts` — structural mirrors of the host services, and the allowlist of complete-subagent tools.
- `service.ts` — the `dshAssisstant` service interface, the shared settings' shape, the serialized settings writer, the listener guard, and the host-note sender.
- `calendar.ts` — the calendar context, the clock line, and the week window (ported from assistant-mode).
- `ddl.ts` — parses `ddl.md`, including repeating items, renders the week view and today's items in a zone, and converts local time to UTC.
- `workspace.ts` — the workspace context: the assistant's name and form of address, profile, persona with its cooldown, project list.
- `balance.ts` — the RMB balance for each provider and the reminder text.
- `hide-preset.ts` — hides preset ids from the registry's `list()`.
- `tool-fence.ts` — denies every global tool except an allowlist, following registry changes; reads them through `schemas()`, which every supported host has.
- `compat.ts` — reads what the supported hosts offer differently: a session's preset and its context pressure.
- `records` — the record tools and the file formats behind them.
- `people.ts` — which assistants need a conversation, merges of the host's write-back, a new assistant's greeting, and its introduction on WeChat.
- `wechat-link.ts` — runs the page's WeChat requests against the im-robot service (bind, unbind, cancel, reconnect, diagnose, options) and mirrors its status events into the stored state.
- `title.ts` — keeps each assistant conversation titled with its assistant's name.
- `watchdog.ts` — stops stalled turns and reports quiet workers, by each assistant's own limit.
- `heartbeat.ts` — wakes each assistant for its daily brief, reminders, its own wake-ups, and its heartbeat; holds chat messages through quiet hours.
- `quiet.ts` — the daily and temporary quiet hours, and where a reminder goes when it falls inside them.
- `assistant-tools.ts` — the router's own tools: `im_send`, `wake_after`, `wake_cancel`, `quiet_set`, `brief_set`, `temp_move`.
- `router.md` — the assistant conversation's prompt: records versus delegation, what goes where, when to speak, worker reports, access review, outside content as data, heartbeats, quiet hours, the time zone, files from WeChat, and reaching the user.
- `worker.md` — the workers' prompt: outside content as data, the fixed report, the record tools.

## 4. Progress

- Done (2026-11-01): every module, with specs.
- Done (2026-11-01, after `dsh-superagent-prototype`): conversation norms, outside content as data, the structured worker report.
- Done (2026-11-01): the WeChat link's reconnect, diagnosis, options, and status mirroring for the IM tab; im-robot added the matching calls (`setBindingOptions`, `reconnect`, `diagnose`); they stay optional in `ImRobotLike` so an older im-robot is reported as outdated.
- Done (2026-11-02, user request): the conversation title is the assistant's name, set as a user title (which stops the host's automatic titling) and set again after a rename on either side.
- Done (2026-11-02, user request): the router records, changes, and looks up simple information itself with the record tools, in the same turn; the workers' file formats and `date` commands moved into the host; repeating items; reminders follow the calendar.
- Done (2026-11-02, user request): system notes go in under their own message source, so the conversation view shows a folded notice instead of a message from the user.
- Done (2026-11-02, after a report that the package made every session unusable on Desktop 0.2.1-rc.5): the host calls that host lacks (`presetForSession`, `tokenMeter.contextPressure`, `tools.definitions`, `agent.model`, `list_agents`) are replaced or have fallbacks, and listeners, timers, and deferred work are guarded.
- Done (2026-11-02, user request): the reminder lead, daily brief, watchdog limit, and WeChat options are per assistant; the host no longer chooses a folder; workers are no longer pinned, since complete-subagent starts them on the model `delegate` chose from the list.
- Done (2026-11-05, user request): the heartbeat replaces the host's automation tasks and the daily brief's own timer; quiet hours, daily and temporary; `im_send`, wake-ups, `temp_move`; the time zone in the profile, worked out by the model, in place of the browser's; the introduction after each WeChat binding.
- Open: tune both prompts after more real conversations; the heartbeat, time zone, and quiet-hours rules met the real model on Desktop 0.2.2-rc.1, while `im_send` and media have not.
- Goal later: nothing planned.
