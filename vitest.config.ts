import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    // The plugin keeps its state under $DSH_HOME; a spec must never reach the user's own.
    env: { DSH_HOME: mkdtempSync(join(tmpdir(), 'dsa-home-')) },
  },
})
