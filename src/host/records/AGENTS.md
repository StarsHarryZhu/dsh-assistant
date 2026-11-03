# AGENTS.md

## 1. Role

The record tools and the file formats behind them: quick reads and writes of fixed files in one family member's workspace, so the assistant conversation can record, change, and look up simple information in the same turn instead of starting a worker. Workers use the same tools, so each format has one owner.

## 2. Constraints

- The tools register in the hidden presets' scope only (`src/policy.ts`), never as global tools, so no other session sees them, and they appear in no fence's allowlist because a preset's own tools need none.
- Every path stays inside the workspace: fixed file names, or a name passed through `namedFile`.
- Format modules are pure, text in and text out; only `store.ts` touches files and only `reminders.ts` touches reminders. A format edits line by line, so hand-written lines survive.
- A tool call reads, edits, and writes without yielding, so calls in this process cannot overwrite each other; writes go through a temporary file.
- Tool results are `{ ok, message }` in English, since only the model reads them; a refusal is a normal result the model can act on, not a thrown error.
- What the model keeps for itself is in English: `profile.md`, `persona.md`, and project goals, status, to-dos, and notes. Schedule titles, list items, memos, and log entries stay in the family member's own words, because they are shown or read back to them; the formats of `ddl.md` and of list lines are unchanged for the same reason, and so is a reminder's prompt, which the automation page shows.
- The profile has no family members field. Its form of address holds only what the family member asked for in chat: the assistant's settings are the starting point, and this overrides them.
- Times in tool arguments and results are the family member's own; the host converts them. Repeating items stay in local time in the file, one-off items in UTC.
- A reminder belongs to the assistant conversation, whichever role made the call, because the host refuses reminders on a worker's session. It is found again by its title and its prompt's prefix, with no table beside it; a reminder set by hand with `schedule_create` is never touched.
- The persona's fixed core has no way in: its fields are a closed list and its values one line. The host, not the prompt, enforces the setting, the cooldown, and the length limit; a change the family member asked for passes the cooldown.
- Passwords, PINs, card numbers, and ID numbers are kept out by the router prompt's rule; no format detects them.

## 3. Contents

- `tools.ts` — the nine tool definitions: `calendar_add`, `calendar_update`, `list_update`, `memo_set`, `log_add`, `project_update`, `recall` for both roles, `profile_set`, `persona_set` for the router.
- `store.ts` — one family member's files: reads, atomic writes, name-safe paths.
- `text.ts` — shared line edits: sections, insertion, one-line text, matching by name.
- `calendar.ts` — edits of `ddl.md`: add, change, finish, reopen, remove, prune (its line formats belong to `ddl.ts` in the parent folder).
- `reminders.ts` — keeps the host's reminders in step with the calendar.
- `lists.ts` — `lists/<name>.md`: groups of things ticked off.
- `memos.ts` — `memo.md`: named facts, a new value replacing the old.
- `logs.ts` — `logs/<name>.md`: dated entries that keep their history.
- `projects.ts` — `projects/<name>.md`: goal, status, to-dos, notes.
- `profile.ts` — `profile.md`: lasting facts, one line per field.
- `persona.ts` — `persona.md`: the adjustable lines and their change log.
- `recall.ts` — looks up all of the above by kind, name, dates, or keywords.

## 4. Progress

- Done (2026-11-02, user request): all nine tools and repeating items, with specs in `tests/records.test.ts` and `tests/ddl.test.ts`.
- Open: try the tools with the real model and measure what their schemas add to each request.
- Goal later: a page or tab that shows these records to the family member.
