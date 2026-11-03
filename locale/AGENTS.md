# AGENTS.md

## 1. Role

Plugin metadata the host's Plugins page reads through the package export `./locale/*.json`: the title and one-sentence description of the plugin in each supported language. The assistant page's and settings page's own copy is not here; it ships inside the browser half and is registered with the page's locale service when the browser half loads.

## 2. Constraints

- Each file holds only `meta.title` and `meta.description`.
- The titles are pinned by `tests/patch.test.ts`.
- Both languages say the same thing.

## 3. Contents

- `zh.json` — Chinese title and description.
- `en.json` — English title and description.

## 4. Progress

- Done: both languages.
- Open: nothing.
- Goal later: nothing planned.
