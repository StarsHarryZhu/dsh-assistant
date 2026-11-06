/**
 * The bridge between the page's WeChat requests and the im-robot service.
 *
 * The page writes a request into the settings row (`wechatRequest`, a new
 * nonce each time); this class runs it against `imRobot` and reports every
 * state back through `writeState`, which the page reads to draw the QR code
 * and the binding status. A person's binding id is their person id.
 * @module dsh-assisstant/host/wechat-link
 */


import type { Person, WechatOptions, WechatRequest, WechatState } from '../shared/settings.ts'
import type { ImBindingStatus, ImLoginState, ImRobotLike } from './types.ts'

/** What the link needs from the plugin. */
export interface WechatLinkDeps {
  /** The im-robot service, or undefined while the sub-plugin is off. */
  robot(): ImRobotLike | undefined
  /** The current assistant list. */
  people(): readonly Person[]
  /** Store one person's state; null removes it. */
  writeState(personId: string, state: WechatState | null): Promise<void>
  /** One person's stored state. */
  readState(personId: string): WechatState | undefined
  /** Report an unexpected failure. */
  warn(message: string): void
  /** An account has just been bound to this conversation, first or again. */
  bound?(personId: string, sessionId: string): void
  now?(): number
}

/** Plain-language reasons shown on the page. */
export const REASONS = {
  noRobot: '微信组件没有加载，请在插件页确认 im-robot 已启用。',
  noSession: '这个助理的对话还没建好，请稍等几秒再绑定。',
  unknown: '绑定没有成功，请再试一次。',
  outdated: '微信组件版本太旧，不支持这个操作，请更新 im-robot。',
  failed: '操作没有成功，请再试一次。',
} as const

/** @returns the connection fields of an im-robot status, for merging into a stored bound state. */
function connection(status: ImBindingStatus): Partial<WechatState> {
  return {
    ...(status.user === undefined ? {} : { user: status.user }),
    ...(status.connected === undefined ? {} : { connected: status.connected }),
    lastError: status.lastError,
    ...(status.sendMode === undefined ? {} : { sendMode: status.sendMode }),
    ...(status.commands === undefined ? {} : { commands: status.commands }),
  }
}

/** Map one im-robot login state to the stored state. */
function stored(state: ImLoginState, now: number): WechatState {
  switch (state.status) {
    case 'qr': return { status: 'qr', qr: state.qr, expiresAt: state.expiresAt, updatedAt: now }
    case 'scanned': return { status: 'scanned', updatedAt: now }
    case 'bound': return { status: 'bound', user: state.user, connected: true, updatedAt: now }
    default: return { status: state.status, reason: state.reason, updatedAt: now }
  }
}

/** Runs WeChat requests, one login at a time per person. */
export class WechatLink {
  private readonly logins = new Map<string, AbortController>()
  private lastNonce: string | undefined

  constructor(private readonly deps: WechatLinkDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /**
   * Treat a request as already handled: the one stored before a restart must
   * not start a new login when the plugin loads.
   * @param request - the stored request, if any.
   */
  seen(request: WechatRequest | undefined): void {
    if (request !== undefined) this.lastNonce = request.nonce
  }

  /**
   * Act on a request once; a repeated nonce is ignored.
   * @param request - the stored request.
   * @returns a promise for tests; callers need not await it.
   */
  handle(request: WechatRequest | undefined): Promise<void> {
    if (request === undefined || request.nonce === this.lastNonce) return Promise.resolve()
    this.lastNonce = request.nonce
    switch (request.action) {
      case 'bind': return this.bind(request.personId)
      case 'unbind': return this.unbind(request.personId)
      case 'reconnect': return this.reconnect(request.personId)
      case 'diagnose': return this.diagnose(request.personId)
      case 'options': return this.setOptions(request.personId, request.options ?? {})
      default:
        this.stopLogin(request.personId)
        return this.deps.writeState(request.personId, null)
    }
  }

  /**
   * Mirror an `im-robot/status` event into a bound person's stored state;
   * other states (a login in progress, unbound) are left alone.
   */
  syncStatus(personId: string, status: ImBindingStatus): Promise<void> {
    const current = this.deps.readState(personId)
    if (current?.status !== 'bound' || !status.bound) return Promise.resolve()
    return this.merge(personId, connection(status))
  }

  /** Merge fields into a bound person's state, keeping what the page already shows. */
  private merge(personId: string, patch: Partial<WechatState>): Promise<void> {
    const current = this.deps.readState(personId)
    if (current?.status !== 'bound') return Promise.resolve()
    const next: Record<string, unknown> = { ...current, ...patch, updatedAt: this.now() }
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
    return this.deps.writeState(personId, next as unknown as WechatState)
  }

  /**
   * Run one of im-robot's newer per-binding operations and merge its result.
   * @param personId - the binding.
   * @param run - the operation, or undefined when im-robot does not offer it.
   * @param label - for the warning when it throws.
   */
  private async operate(personId: string, run: ((robot: ImRobotLike) => Promise<Partial<WechatState>>) | undefined, label: string): Promise<void> {
    const robot = this.deps.robot()
    if (robot === undefined || run === undefined) {
      await this.merge(personId, { notice: robot === undefined ? REASONS.noRobot : REASONS.outdated })
      return
    }
    try {
      await this.merge(personId, { ...await run(robot), notice: undefined })
    } catch (error) {
      this.deps.warn(`WeChat ${label} for ${personId} failed: ${String(error)}`)
      await this.merge(personId, { notice: REASONS.failed })
    }
  }

  /** Restart a binding's connection now. */
  private reconnect(personId: string): Promise<void> {
    const reconnect = this.deps.robot()?.reconnect
    return this.operate(personId, reconnect === undefined ? undefined : async robot => connection(await (robot.reconnect as NonNullable<ImRobotLike['reconnect']>)(personId)), 'reconnect')
  }

  /** Check a binding's connection and store the outcome. */
  private diagnose(personId: string): Promise<void> {
    const diagnose = this.deps.robot()?.diagnose
    return this.operate(personId, diagnose === undefined ? undefined : async (robot) => {
      const result = await (robot.diagnose as NonNullable<ImRobotLike['diagnose']>)(personId)
      return { diagnosis: { ok: result.ok, checks: result.checks.map(check => ({ ...check })), at: this.now() } }
    }, 'diagnosis')
  }

  /** Change a binding's send mode or command handling. */
  private setOptions(personId: string, options: WechatOptions): Promise<void> {
    const setBindingOptions = this.deps.robot()?.setBindingOptions
    return this.operate(personId, setBindingOptions === undefined ? undefined : async (robot) => {
      await (robot.setBindingOptions as NonNullable<ImRobotLike['setBindingOptions']>)(personId, options)
      return { ...connection(await robot.status(personId)), ...options }
    }, 'option change')
  }

  /** Abort a running login for one person. */
  private stopLogin(personId: string): void {
    this.logins.get(personId)?.abort()
    this.logins.delete(personId)
  }

  /** Run a QR login and bind the person's conversation when it succeeds. */
  private async bind(personId: string): Promise<void> {
    this.stopLogin(personId)
    const robot = this.deps.robot()
    if (robot === undefined) {
      await this.deps.writeState(personId, { status: 'failed', reason: REASONS.noRobot, updatedAt: this.now() })
      return
    }
    const controller = new AbortController()
    this.logins.set(personId, controller)
    try {
      for await (const state of robot.login(personId, 'wechat', controller.signal)) {
        if (controller.signal.aborted) return
        if (state.status === 'bound') {
          const sessionId = this.deps.people().find(person => person.id === personId)?.sessionId
          if (sessionId === undefined) {
            await robot.unbind(personId)
            await this.deps.writeState(personId, { status: 'failed', reason: REASONS.noSession, updatedAt: this.now() })
            return
          }
          await robot.bind(personId, { sessionId })
          await this.deps.writeState(personId, stored(state, this.now()))
          this.deps.bound?.(personId, sessionId)
          continue
        }
        await this.deps.writeState(personId, stored(state, this.now()))
      }
    } catch (error) {
      if (controller.signal.aborted) return
      this.deps.warn(`WeChat binding for ${personId} failed: ${String(error)}`)
      await this.deps.writeState(personId, { status: 'failed', reason: REASONS.unknown, updatedAt: this.now() })
    } finally {
      if (this.logins.get(personId) === controller) this.logins.delete(personId)
    }
  }

  /** Remove a person's binding. */
  async unbind(personId: string): Promise<void> {
    this.stopLogin(personId)
    const robot = this.deps.robot()
    try {
      await robot?.unbind(personId)
    } catch (error) {
      this.deps.warn(`WeChat unbinding for ${personId} failed: ${String(error)}`)
    }
    await this.deps.writeState(personId, { status: 'unbound', updatedAt: this.now() })
  }

  /** Forget a removed person entirely: binding, credentials, and stored state. */
  async forget(personId: string): Promise<void> {
    this.stopLogin(personId)
    try {
      await this.deps.robot()?.unbind(personId)
    } catch (error) {
      this.deps.warn(`WeChat unbinding for ${personId} failed: ${String(error)}`)
    }
    await this.deps.writeState(personId, null)
  }

  /** Abort every running login. */
  dispose(): void {
    for (const controller of this.logins.values()) controller.abort()
    this.logins.clear()
  }
}
