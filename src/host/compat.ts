/**
 * Facts the host offers differently across the versions this plugin supports.
 * Before 0.2.2-alpha.2 they are read from session projections, as the host
 * itself does; later hosts add a method on the owning service and deprecate
 * that read, so the method comes first. The session controller's own
 * `presetForSession` is internal: its public service has none.
 * @module dsh-assisstant/host/compat
 */

import type { AgentPresetsLike, SessionLike, SessionProjectionsLike, TokenMeterLike } from './types.ts'

/** A session's context pressure; fields stay absent until the host has recorded them. */
export interface PressureLike {
  readonly pressureTokens?: number | undefined
  readonly contextWindow?: number | undefined
}

/**
 * @param services - the host services, either of which may be missing.
 * @param session - a live session.
 * @returns the session's preset id, or undefined when it has none or the host cannot say.
 */
export function presetOf(services: { agentPresets: AgentPresetsLike | undefined; sessionProjections: SessionProjectionsLike | undefined }, session: SessionLike): string | undefined {
  const { agentPresets, sessionProjections } = services
  const preset = typeof agentPresets?.presetForSession === 'function'
    ? agentPresets.presetForSession(session)
    : sessionProjections?.stateOf?.(session, 'agentPreset')
  return typeof preset === 'string' ? preset : undefined
}

/**
 * @param services - the host services.
 * @param session - a live session.
 * @returns the session's context pressure; empty when the host cannot say.
 */
export function pressureOf(services: { tokenMeter: TokenMeterLike; sessionProjections: SessionProjectionsLike | undefined }, session: SessionLike): PressureLike {
  const { tokenMeter, sessionProjections } = services
  if (typeof tokenMeter.contextPressure === 'function') return tokenMeter.contextPressure(session)
  return (sessionProjections?.stateOf?.(session, 'contextPressure') ?? {}) as PressureLike
}
