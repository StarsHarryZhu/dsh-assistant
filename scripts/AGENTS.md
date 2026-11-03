# AGENTS.md

## 1. Role

Development scripts. The package installs no development dependency of its own: the compiler, the test runner, React, and the host packages are symlinked from the sibling harness checkout, and the two sub-plugins from their sibling folders until their pinned versions are published. The links also let a `link:` install of this package resolve its peers at runtime.

## 2. Constraints

- Scripts write only inside this package's `node_modules` and never touch the network.
- An existing real directory is never replaced; only stale symlinks are moved.

## 3. Contents

- `link-dev.mjs` — links the toolchain from the harness checkout and the sub-plugins from sibling folders.

## 4. Progress

- Done (2026-11-01): toolchain and sibling links.
- Open: drop the sibling links once both sub-plugins are on npm.
- Goal later: nothing planned.
