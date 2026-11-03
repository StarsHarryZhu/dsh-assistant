# AGENTS.md

## 1. Role

The identities, defaults, and data shapes both halves of the plugin read from the settings row: the package, preset, and panel ids, the defaults of the shared settings and of each assistant's own, the workers' models, and the assistant list (one entry per assistant: its name, the optional form of address for its user, its folder, conversation, and what it changed from the defaults), WeChat request, and WeChat state shapes with defensive readers. The settings row is the channel between the assistant page and the host, so every reader accepts any stored value and keeps only well-formed entries.

## 2. Constraints

- No runtime dependency and no environment-specific API: the module compiles into both the host emit and the browser bundle.
- Readers never throw on malformed input.

## 3. Contents

- `settings.ts` — ids, defaults, data shapes, readers, and the folder-name rule.
- `record-tools.ts` — the record tools' names and the plain titles of their calls.

## 4. Progress

- Done (2026-11-02, user request): each assistant's own settings and the list of worker models, which is never empty; no default workspace location.
- Done (2026-11-01): ids, defaults, shapes, readers; request actions with options, and the connection, options, and diagnosis in WeChat states.
- Open: nothing.
- Goal later: nothing planned.
