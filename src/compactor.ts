/**
 * dsh-assisstant compactor, mounted inside the router preset's
 * compaction group (where the `compaction` service is isolated). After every
 * turn of an assistant conversation it compacts once the context reaches the
 * configured share of the window; the group's own compaction-basic stays as
 * the in-turn safety net at a higher ratio.
 *
 * The `compaction` service is not part of the row's own `inject`: a plugin that
 * takes over compaction (billion-context) switches the group's compaction-basic
 * off, and from DSH 0.2.2 the preset registry refuses a preset with a row still
 * waiting for a service, which would leave every assistant conversation unable
 * to start. The compactor reads the service at each turn's end instead, and
 * does nothing while there is none.
 * @module dsh-assisstant/compactor
 */

import type { Context } from '@deepseek-ai/cordis'
import { pressureOf } from './host/compat.ts'
import type { PressureLike } from './host/compat.ts'
import type { AssistantService } from './host/service.ts'
import type { AgentsLike, CompactionLike, SessionLike, SessionProjectionsLike, TokenMeterLike } from './host/types.ts'

export const name = 'dsh-assisstant-compactor'
export const inject = ['tokenMeter', 'agents', 'dshAssisstant']

/** The services this plugin reads. */
interface HostContext {
  readonly tokenMeter: TokenMeterLike
  readonly agents: AgentsLike
  readonly dshAssisstant: AssistantService
  get(name: 'sessionProjections'): SessionProjectionsLike | undefined
  get(name: 'compaction'): CompactionLike | undefined
  on(name: string, listener: (...args: never[]) => unknown): () => void
}

/**
 * Whether a session is due for compaction.
 * @param pressure - the token meter's reading.
 * @param ratio - the configured share of the window.
 * @returns true at or above the share.
 */
export function due(pressure: PressureLike, ratio: number): boolean {
  const { pressureTokens, contextWindow } = pressure
  return pressureTokens !== undefined && contextWindow !== undefined && contextWindow > 0 && pressureTokens / contextWindow >= ratio
}

/**
 * Compact after turns.
 * @param ctx - the plugin context inside the compaction group.
 */
export function apply(ctx: Context): void {
  const host = ctx as unknown as HostContext
  const running = new Set<string>()
  host.on('session/event', ((session: SessionLike, event: { type: string }) => {
    if (event.type !== 'turn/end' || session.header.parentSession !== undefined || running.has(session.id)) return
    // After the turn's own listeners: the token meter has seen the last step.
    setTimeout(() => {
      void (async () => {
        try {
          const compaction = host.get('compaction')
          if (compaction === undefined) return
          const pressure = pressureOf({ tokenMeter: host.tokenMeter, sessionProjections: host.get('sessionProjections') }, session)
          if (!due(pressure, host.dshAssisstant.settings().compactRatio)) return
          const agent = host.agents.get(session.id)
          if (agent === undefined) return
          running.add(session.id)
          await compaction.compactNow(agent, AbortSignal.timeout(120_000))
        } catch (error) {
          ctx.logger.warn(`compaction of ${session.id} failed: ${String(error)}`)
        } finally {
          running.delete(session.id)
        }
      })()
    }, 0)
  }) as never)
}
