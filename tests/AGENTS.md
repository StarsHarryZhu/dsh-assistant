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
- `calendar.test.ts` — the calendar and the time-zone projection.
- `ddl.test.ts` — the `ddl.md` fast path.
- `watchdog.test.ts` — the watchdog and the daily brief.
- `wechat-link.test.ts` — the WeChat link (binding, reconnect, diagnosis, options, status sync) and the host-note request ids (the real im-robot module through the development link).
- `policy.test.ts` — the policy for both roles, and the compactor.
- `plugin.test.ts` — the settings row.
- `records.test.ts` — the record tools over real files and a fake reminder service.
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
- Open: an end-to-end spec in a real host belongs to the scratchpad run, not here.
- Goal later: nothing planned.
