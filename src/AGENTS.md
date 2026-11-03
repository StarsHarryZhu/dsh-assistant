# AGENTS.md

## 1. Role

All source of the package. The four entry modules at this level are the plugins the bundle patch mounts: the settings row (the package root), the sub-plugin group, the policy that both hidden presets mount with a role, and the compactor inside the router preset's compaction group. `host` holds the host modules and prompts they share, `shared` the identities and data shapes both halves read, and `client` the browser half. Build output goes to `lib/` with the same layout.

## 2. Constraints

- Entry modules export `name`, `inject`, optional `Config`, and `apply` (or, for the group, a default class with the cordis group and init symbols), as the loader expects.
- Host code imports only `@deepseek-ai/cordis`, `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`, Node built-ins, and `./host` or `./shared`; host types are structural mirrors in `host/types.ts`.
- `client` never imports `host`, and `host` never imports `client`; both may import `shared`.
- Relative imports carry their `.ts` extension; the build rewrites them.

## 3. Contents

- `index.ts` — the settings row: settings, assistant list, `dshAssisstant` service, preset hiding, the conversation's model re-pin, the workers' model list, conversation titles, balance polling, WeChat link, watchdog, daily brief.
- `bundle.ts` — the sub-plugin group: makes the pinned sub-plugins resolvable, then mounts them with the Loader group.
- `policy.ts` — the policy for the router and worker presets: prompts, contexts, the router's permission pin, tool fence, balance tool, `/ddl`.
- `compactor.ts` — compacts an assistant conversation after a turn that reached the configured ratio.
- `host` — host modules and the two prompts.
- `shared` — identities, defaults, and data shapes shared by both halves.
- `client` — the browser half: the sidebar row and create form, the header menu, the IM tab, and the settings pages.

## 4. Progress

- Done (2026-11-01): all four entries, with specs.
- Done (2026-11-01): the router policy undoes permission changes made in the conversation view; the settings row mirrors im-robot's status events for the IM tab.
- Done (2026-11-02): the settings row titles each assistant conversation with its assistant's name.
- Done (2026-11-02): the policy registers the record tools for both roles, in the preset's scope.
- Done (2026-11-02): the settings row, policy, and compactor run on 0.2.1-rc.5, and failures in their listeners and timers stay inside the plugin.
- Done (2026-11-02, user request): each assistant keeps its own schedule, watchdog, and WeChat settings; workers run a model the router picks from a list the settings row hands complete-subagent, and only the conversation is pinned.
- Open: nothing here beyond the root file's list.
- Goal later: nothing planned.
