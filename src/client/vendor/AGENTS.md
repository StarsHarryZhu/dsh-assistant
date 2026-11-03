# AGENTS.md

## 1. Role

Third-party code the browser half bundles unchanged. It lives in the source tree instead of `node_modules` because the development toolchain is linked from the harness checkout, which does not carry it, and because `build.js` bundles only source files and the page's shared modules. Each vendored file keeps its original license header and is listed in the package's third-party notices.

## 2. Constraints

- Vendored files are never edited; an update replaces the file and its version in the notices.
- Each vendored file has a declaration file next to it with only the part this package uses.
- A vendored module must be CommonJS-compatible and must not evaluate code at runtime (the build rejects that).

## 3. Contents

- `qrcode-generator.js` — qrcode-generator 2.0.4 (MIT, Kazuhiko Arase), unchanged.
- `qrcode-generator.d.ts` — the declarations the QR card uses.

## 4. Progress

- Done (2026-11-01): qrcode-generator.
- Open: nothing.
- Goal later: nothing planned.
