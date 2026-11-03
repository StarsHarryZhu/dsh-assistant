# AGENTS.md

## 1. Role

Host-side modules the entry plugins share, and the two prompts. Each module owns one concern and takes its services as arguments, so the specs drive it with fakes: the calendar and the time-zone projection, the `ddl.md` fast path, the workspace context, the balance, preset hiding, the tool fence, the model pin, the assistant list planning, the record tools, the WeChat link, the conversation title, the watchdog, and the daily brief. The prompts are copied next to the emitted modules by the build.

## 2. Constraints

- No module reads cordis context directly; the entries wire services in.
- Every host call must exist on the oldest host in `engines.dsh`, 0.2.1-rc.5: a spec's fake proves nothing about that. Methods added later go through a fallback (`compat.ts`), and a missing one is reported, not ignored.
- Nothing this package hangs on a host event, timer, or microtask may let an error escape (`guarded` in `service.ts`): many fire for every session of the host, and one escaping once made every conversation unusable.
- The fast path never calls a model: anything that can be decided by parsing files is decided here.
- System notes the host sends into an assistant conversation start with the shared prefix in `watchdog.ts` and go through `sendHostNote` under the message source `host-note`, never as a `user` prompt: the host's conversation view draws a `user` message as the family member's own words. im-robot counts a turn this source starts as a follow-up, so its answer reaches WeChat.
- The prompts are complete: the router prompt is the assistant conversation's whole system prompt, the worker prompt a worker's. `tests/workflow.test.ts` pins the rules the design depends on (conversation norms, outside content as data, the report format).
- The worker's report (in English: the status line, the result, at most one question for the family) and the router's handling of it change together.
- The router writes only through the record tools in `records/`; it has no general file write, shell, or web.
- The access rules in `router.md` promise only what works: the router cannot grant outside the workspace on any host, and on 0.2.1-rc.5 a grant does not reach a worker's shell. End-to-end checks of file access need a workspace outside `/tmp`, which is always writable.

## 3. Contents

- `types.ts` — structural mirrors of the host services, and the allowlist of complete-subagent tools.
- `service.ts` — the `dshAssisstant` service interface, the shared settings' shape, the serialized settings writer, the listener guard, and the host-note sender.
- `calendar.ts` — the calendar context, the week window, and the time-zone projection (ported from assistant-mode).
- `ddl.ts` — parses `ddl.md`, including repeating items, renders the week view and today's items in a zone, and converts local time to UTC.
- `workspace.ts` — the workspace context: the assistant's name and form of address, profile, persona with its cooldown, project list.
- `balance.ts` — the RMB balance for each provider and the reminder text.
- `hide-preset.ts` — hides preset ids from the registry's `list()`.
- `tool-fence.ts` — denies every global tool except an allowlist, following registry changes; reads them through `schemas()`, which every supported host has.
- `compat.ts` — reads what the supported hosts offer differently: a session's preset and its context pressure.
- `records` — the record tools and the file formats behind them.
- `people.ts` — which assistants need a conversation, merges of the host's write-back, and a new assistant's greeting.
- `wechat-link.ts` — runs the page's WeChat requests against the im-robot service (bind, unbind, cancel, reconnect, diagnose, options) and mirrors its status events into the stored state.
- `title.ts` — keeps each assistant conversation titled with its assistant's name.
- `watchdog.ts` — stops stalled turns and reports quiet workers, by each assistant's own limit.
- `brief.ts` — the daily brief at each assistant's own time, sent only on days with items.
- `router.md` — the assistant conversation's prompt: records versus delegation, what goes where, when to speak, worker reports, access review, outside content as data.
- `worker.md` — the workers' prompt: outside content as data, the fixed report, the record tools.

## 4. Progress

- Done (2026-11-01): every module, with specs.
- Done (2026-11-01, after `dsh-superagent-prototype`): conversation norms, outside content as data, the structured worker report.
- Done (2026-11-01): the WeChat link's reconnect, diagnosis, options, and status mirroring for the IM tab; im-robot added the matching calls (`setBindingOptions`, `reconnect`, `diagnose`); they stay optional in `ImRobotLike` so an older im-robot is reported as outdated.
- Done (2026-11-02, user request): the conversation title is the assistant's name, set as a user title (which stops the host's automatic titling) and set again after a rename on either side.
- Done (2026-11-02, user request): the router records, changes, and looks up simple information itself with the record tools, in the same turn; the workers' file formats and `date` commands moved into the host; repeating items; reminders follow the calendar.
- Done (2026-11-02, user request): system notes go in under their own message source, so the conversation view shows a folded notice instead of a message from the family member.
- Done (2026-11-02, after a report that the package made every session unusable on Desktop 0.2.1-rc.5): the host calls that host lacks (`presetForSession`, `tokenMeter.contextPressure`, `tools.definitions`, `agent.model`, `list_agents`) are replaced or have fallbacks, and listeners, timers, and deferred work are guarded.
- Done (2026-11-02, user request): the reminder lead, daily brief, watchdog limit, and WeChat options are per assistant; the host no longer chooses a folder; workers are no longer pinned, since complete-subagent starts them on the model `delegate` chose from the list.
- Open: tune both prompts after real conversations; the new rules have not met the real model yet.
- Goal later: nothing planned.
