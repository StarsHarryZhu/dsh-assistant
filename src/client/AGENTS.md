# AGENTS.md

## 1. Role

The browser half, bundled by `build.js` into one module-loader factory. It registers the Assistant row in the left sidebar, which leads straight to an assistant's conversation, with a page behind it that holds the form creating an assistant; and the settings every assistant shares on the Plugins screen. An assistant's conversation opens in the host's own conversation view (the user chose its look over a self-drawn one, accepting that plugins which change that view reach it too); while that view shows an assistant conversation, the browser half makes the title a menu that switches assistants or creates one, adds an IM tab (the WeChat connection) and the assistant's own settings tab to the view tabs, and marks the root so the composer's permission picker is hidden; its model and effort pickers stay usable.

## 2. Constraints

- Every class has the `dsa-` prefix. Rules on host markup: the title beside the header menu is hidden (`nav:has(+ * .dsa-switcher)`, so a split pane's other session keeps its title), and under the root attribute `data-dsh-assisstant-session` they hide `[data-slot='conversation.input.permission']` (workspace-write with automatic refusal matches no host preset and reads "Custom"), and show the plugin's Chinese name in place of the hidden preset's id in the header label; the IM tab is where the permission is picked. The host re-pins the permissions anyway; the model and effort are the composer's.
- Every settings page looks alike, after the user's `dsh-btw` page: a label above each control in one column at most 360px wide, plain group headings, an outlined save button.
- The Plugins screen holds what every assistant shares (worker models, compaction, balance reminder, persona and profile limits); the settings tab holds what each assistant has for itself (name, form of address, schedule, heartbeat, quiet hours, watchdog, WeChat). The user drew that line.
- An assistant cannot be created without a workspace folder, and not in another assistant's folder. There is no default location. Where the user is, in their own words, is optional; the assistant works out the time zone from it.
- Assistant conversations are left out of the host's session lists by answering `ctx.sessions.list` and `ctx.workspaces.list` with those ids removed and `byId` whole, so the conversation still opens and its workers panel stays. Not by setting `origin: 'subagent'` on a row: the conversation's own view reads it. The sidebar's content search can still find them.
- In an assistant conversation, `[data-chat-flow-kind='turn-trigger']` rows are hidden, and so is every row of a turn a host note started that ended with nothing said or done: heartbeats would otherwise draw two rows each. Anything else in such a turn, an error included, keeps it in view.
- Numbers and clock times show what is typed, an empty box included, and are corrected when the field is left (nearest bound, whole numbers except the balance threshold, the previous value when nothing readable was typed); the draft holds the corrected value meanwhile, so saving without leaving the field stores it too.
- Worker models are a multi-choice menu with no "same as the conversation": the last one cannot be unchecked.
- Menus portal to the body because the conversation header clips overflow.
- The IM and settings tabs follow the host's Chat (0) and Trajectory (10) tabs and come before plugin tabs, which start at 20 (`VIEW_ORDER`). The header menu comes before the preset label at -10 (`SWITCHER`).
- The tabs and the header menu exist only while the conversation view holds an assistant conversation: those lists are shared by every session, so they are registered and removed as the view changes.
- Imports outside the bundle are limited to `react`, `react/jsx-runtime`, and `react-dom`; host services are typed structurally in `host.ts`.
- Every control is inline: the desktop shell has no `window.prompt`.
- The assistant list and WeChat requests are written through the settings form of the settings row; the host writes its findings back the same way.

## 3. Contents

- `index.ts` — registrations, the watcher that adds the tabs, the header menu, and the root attribute.
- `host.ts` — structural types of the host props and client services.
- `page.tsx` — the page behind the sidebar row: opens the assistant last shown here, or the create form (name, what it calls you, required workspace), or lists assistants whose conversation is not ready.
- `switcher.tsx` — the assistant's name in the conversation header, as the menu that switches assistants or creates one.
- `menu.tsx` — the dropdown both menus use.
- `im.tsx` — the IM tab: QR binding, then the account, the conversation's model and effort, the assistant's permission, send mode, commands, the fixed settings disabled, diagnosis, reconnect, removal.
- `record-row.tsx` — the plain title a record tool's call shows in the conversation.
- `hidden-sessions.ts` — leaves assistant conversations out of the host's session lists.
- `silent-turns.ts` — marks the host-note turns that said nothing (only thinking, or the silent reply) and did nothing, for the stylesheet to hide.
- `assistants.ts` — assistant list and WeChat request helpers over the settings form, and the assistant last shown in this browser.
- `settings.tsx` — both settings pages: the shared one with the workers' models, and each assistant's own, which also renames and deletes it.
- `qr.tsx` — draws a QR code as SVG.
- `locales.ts` — copy, Chinese first.
- `styles.css` — the stylesheet, inlined by the build.
- `css.d.ts` — the type of the inlined stylesheet module.
- `vendor` — vendored third-party code.

## 4. Progress

- Done (2026-11-01, user request): the page creates an assistant with a name, an optional form of address, and a workspace.
- Done (2026-11-01, user request): the self-drawn conversation is gone; assistants open in the host's conversation view with the IM and settings tabs.
- Done (2026-11-02, user request): the IM and settings tabs sit right after Trajectory.
- Done (2026-11-02, user request): record tools' calls read in plain words in the conversation; the host's generic row ignores a tool's `presentCall`, so each has a keyed row.
- Done (2026-11-02, user request): the sidebar row opens a conversation directly and the title is the assistant menu, replacing the list page; the workspace folder is required; settings split into shared and per-assistant; worker models are a multi-choice menu; every settings page, the IM tab included, takes the `dsh-btw` look.
- Done (2026-11-03, reported by the user): the real desktop app and the bound IM tab with a real phone.
- Done (2026-11-05, user request): assistant conversations no longer appear under Ungrouped or a workspace; the settings tab has the heartbeat and quiet hours; the create form asks where the user is.
- Done (2026-11-06, user request): the settings tab sets how many days the WeChat inbox keeps files.
- Fixed (2026-11-06, found on Desktop 0.2.2-rc.1): every heartbeat turn was hidden, reminders included, because 0.2.2 marks no reply as the turn's answer; a turn now stays in view when a step's Markdown body says anything but the silent reply.
- Known limits: other plugins' changes to the conversation view also apply to assistant conversations; the sidebar's content search can still find assistant conversations.
