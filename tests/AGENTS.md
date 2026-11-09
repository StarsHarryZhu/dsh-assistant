# AGENTS.md

## 1. Role

The vitest specs. Host modules and entry plugins run against fake host services from `helpers.ts`; the browser half is loaded from the built `lib/client.js` exactly as the page loads it and rendered with real React under jsdom. `npm test` builds first, so the browser specs always see the current bundle.

## 2. Constraints

- No spec touches the network, the user's profiles, or files outside temporary directories.
- Fakes mirror only what the code under test calls; when the code starts using more of a service, the fake grows with it.
- The browser specs use the built bundle, never the source modules, for registration and rendering.

## 3. Contents

- `helpers.ts` — fake context, tool registry, sessions, agents, and `dshAssisstant` service.
- `shared.test.ts` — settings readers, each assistant's own settings, worker models, and assistant list planning.
- `balance.test.ts` — balance queries and the reminder.
- `fence.test.ts` — preset hiding and the tool fence.
- `calendar.test.ts` — the calendar and the clock line.
- `ddl.test.ts` — the `ddl.md` fast path.
- `watchdog.test.ts` — the watchdog.
- `heartbeat.test.ts` — the daily brief, reminders, wake-ups, heartbeats, quiet hours, the daily inbox clean-up, the ask to keep WeChat open, restarts, with a clock moved by hand.
- `quiet.test.ts` — daily and temporary quiet hours, and where a reminder goes.
- `assistant-tools.test.ts` — `im_route`, `wake_after`, `wake_cancel`, `quiet_set`, `brief_set`, `media_copy`, the inbox clean-up, and the tool titles.
- `hidden-sessions.test.ts` — assistant conversations left out of the session lists.
- `silent-turns.test.tsx` — which turns are marked to be hidden, retried requests, the oldest turn on screen, and text-only updates included.
- `wechat-link.test.ts` — the WeChat link (binding, reconnect, diagnosis, options, status sync) and the host-note request ids (the real im-robot module through the development link).
- `policy.test.ts` — the policy for both roles, and the compactor.
- `plugin.test.ts` — the settings row.
- `records.test.ts` — the record tools over real files.
- `writer.test.ts` — the settings writer and its way out of open settings transactions.
- `bundle.test.ts` — the sub-plugin group.
- `patch.test.ts` — the bundle patch, the manifest, and the locale titles.
- `workflow.test.ts` — the prompts: the rules the design depends on.
- `client.test.tsx` — the built browser half under jsdom: opening from the sidebar row, the create form, the header menu, the view tabs and the hidden permission picker, the IM tab, both settings pages.
- `agents-md.test.ts` — this documentation set.

## 4. Progress

- Done (2026-11-01): specs for every module and entry.
- Done (2026-11-01): specs for the borrowed prompt rules.
- Done (2026-11-02): specs for the conversation title and the view tabs' place.
- Done (2026-11-02): specs for the record tools, repeating items, and time-zone conversion; the shell-command specs went with the commands.
- Done (2026-11-02): specs for the required folder, the header menu, per-assistant settings, and the multi-choice worker models.
- Done (2026-11-05): specs for the heartbeat, quiet hours, the router's new tools, the time zone, and the hidden session rows.
- Done (2026-11-06): specs for `im_route`, `media_copy`, the inbox clean-up, and the WeChat inbox folder.
- Open: an end-to-end spec in a real host belongs to the scratchpad run, not here.
- Goal later: nothing planned.
