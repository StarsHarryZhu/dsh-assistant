/**
 * dsh-assisstant compactor, mounted inside the router preset's
 * compaction group (where the `compaction` service is isolated). After every
 * turn of an assistant conversation it compacts once the context reaches the
 * configured share of the window; the group's own compaction-basic stays as
 * the in-turn safety net at a higher ratio.
 * @module dsh-assisstant/compactor
 */

import type { Context } from '@deepseek-ai/cordis'
import { pressureOf } from './host/compat.ts'
import type { PressureLike } from './host/compat.ts'
import type { AssistantService } from './host/service.ts'
import type { AgentsLike, CompactionLike, SessionLike, SessionProjectionsLike, TokenMeterLike } from './host/types.ts'

export const name = 'dsh-assisstant-compactor'
export const inject = ['compaction', 'tokenMeter', 'agents', 'dshAssisstant']

/** The services this plugin reads. */
interface HostContext {
  readonly compaction: CompactionLike
  readonly tokenMeter: TokenMeterLike
  readonly agents: AgentsLike
  readonly dshAssisstant: AssistantService
  get(name: 'sessionProjections'): SessionProjectionsLike | undefined
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
          const pressure = pressureOf({ tokenMeter: host.tokenMeter, sessionProjections: host.get('sessionProjections') }, session)
          if (!due(pressure, host.dshAssisstant.settings().compactRatio)) return
          const agent = host.agents.get(session.id)
          if (agent === undefined) return
          running.add(session.id)
          await host.compaction.compactNow(agent, AbortSignal.timeout(120_000))
        } catch (error) {
          ctx.logger.warn(`compaction of ${session.id} failed: ${String(error)}`)
        } finally {
          running.delete(session.id)
        }
      })()
    }, 0)
  }) as never)
}
