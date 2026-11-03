/**
 * The IM tab of an assistant conversation: the assistant's WeChat connection.
 * Unbound, it runs the QR binding; bound, it shows the account, the
 * conversation's model and effort (the same choice as its composer's), the
 * assistant's permission, send mode and commands, the fixed settings disabled,
 * the latest problem or diagnosis, and diagnose, reconnect, and remove. WeChat
 * actions are requests through the settings form, carried out by the host
 * against im-robot.
 * @module dsh-assisstant/client/im
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { SANDBOX_MODES, assistantSettings } from '../shared/settings.ts'
import type { Person, SandboxMode, WechatState } from '../shared/settings.ts'
import { assistantsView, requestWechat, setSandboxMode, useForm } from './assistants.ts'
import type { AssistantsView } from './assistants.ts'
import type { ConfigFormLike, ModelDirectoriesLike, ModelDirectoryLike, ModelSelectionLike, Translate } from './host.ts'
import { fallbackT } from './locales.ts'
import { QrCode } from './qr.tsx'

/** How often to ask again for a conversation's model directory. */
const DIRECTORY_RETRY_MS = 300

/** What the tab reads. */
export interface ImDeps {
  readonly form: ConfigFormLike
  /** The live `ctx.modelDirectories`, for the conversation's model. */
  directories(): ModelDirectoriesLike | undefined
}

/** Build the `conversation.view` component of the IM tab. */
export function createImView(deps: ImDeps) {
  return function ImView(props: { t?: Translate; sessionId?: string }): ReactNode {
    const t = props.t ?? fallbackT
    const view = assistantsView(useForm(deps.form))
    const person = view.people.find(entry => entry.sessionId !== undefined && entry.sessionId === props.sessionId)
    if (person === undefined) return <div className="dsa-view"><p className="dsa-note">{t('im.notAssistant')}</p></div>
    return (
      <div className="dsa-view">
        <ImPanel key={person.id} view={view} person={person} state={view.wechat[person.id]} deps={deps} t={t} />
      </div>
    )
  }
}

/** @returns the badge text and tone of a binding state. */
function badge(state: WechatState | undefined, enabled: boolean): { key: string; tone: 'ok' | 'warn' | 'idle' } {
  if (state?.status === 'bound' && !enabled) return { key: 'im.status.paused', tone: 'idle' }
  if (state?.status === 'bound') return state.connected === false ? { key: 'im.status.disconnected', tone: 'warn' } : { key: 'im.status.connected', tone: 'ok' }
  if (state?.status === 'qr' || state?.status === 'scanned') return { key: 'im.status.pending', tone: 'idle' }
  return { key: 'im.status.unbound', tone: 'idle' }
}

function ImPanel(props: { view: AssistantsView; person: Person; state: WechatState | undefined; deps: ImDeps; t: Translate }): ReactNode {
  const { view, person, state, deps, t } = props
  const bound = state?.status === 'bound'
  const status = badge(state, assistantSettings(person).wechatEnabled)
  return (
    <div className="dsa-im">
      <div className="dsa-im-head">
        <WechatMark />
        <div className="dsa-im-account">
          <div className="dsa-row">
            <strong className="dsa-im-name">{person.name}</strong>
            <span className={`dsa-badge dsa-badge-${status.tone}`}>{t(status.key)}</span>
          </div>
          <span className="dsa-note">{bound && state.user !== undefined ? state.user : t('im.account.none')}</span>
        </div>
      </div>
      {bound ? <BoundSettings view={view} person={person} state={state} deps={deps} t={t} /> : <Binding person={person} state={state} form={deps.form} t={t} />}
    </div>
  )
}

/** The QR binding flow while no account is bound. */
function Binding(props: { person: Person; state: WechatState | undefined; form: ConfigFormLike; t: Translate }): ReactNode {
  const { person, state, form, t } = props
  const bind = (): void => { void requestWechat(form, person.id, 'bind') }
  const cancel = (): void => { void requestWechat(form, person.id, 'cancel') }
  if (state?.status === 'qr' && state.qr !== undefined) {
    return (
      <div className="dsa-im-bind">
        <p>{person.address === undefined ? t('wechat.scan.you') : t('wechat.scan', { address: person.address })}</p>
        <QrCode text={state.qr} label={t('im.bind')} />
        <button type="button" className="dsa-button" onClick={cancel}>{t('form.cancel')}</button>
      </div>
    )
  }
  if (state?.status === 'scanned') {
    return (
      <div className="dsa-im-bind">
        <p>{t('wechat.scanned')}</p>
        <button type="button" className="dsa-button" onClick={cancel}>{t('form.cancel')}</button>
      </div>
    )
  }
  return (
    <div className="dsa-im-bind">
      {(state?.status === 'expired' || state?.status === 'failed') && state.reason !== undefined && <p className="dsa-error">{state.reason}</p>}
      <p className="dsa-note">{t('im.unbound.hint', { name: person.name })}</p>
      <button type="button" className="dsa-button dsa-primary" onClick={bind}>
        {state?.status === 'expired' || state?.status === 'failed' ? t('wechat.retry') : t('im.bind')}
      </button>
    </div>
  )
}

/** One labelled setting; `fixed` ones are shown but cannot be changed here. */
function Setting(props: { label: string; value: string; options?: readonly { value: string; label: string }[]; onChange?: (value: string) => void }): ReactNode {
  const options = props.options ?? [{ value: props.value, label: props.value }]
  return (
    <label className="dsa-field">
      <span>{props.label}</span>
      <select className="dsa-text" value={props.value} disabled={props.onChange === undefined}
        onChange={(event) => { props.onChange?.(event.target.value) }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

/**
 * The conversation's model directory. Right after switching assistants the
 * conversation may not be bound yet and `directoryFor` throws, so keep asking.
 */
function useDirectory(deps: ImDeps, sessionId: string | undefined): ModelDirectoryLike | undefined {
  const [directory, setDirectory] = useState<ModelDirectoryLike | undefined>()
  useEffect(() => {
    if (sessionId === undefined) return
    const attempt = (): boolean => {
      try {
        const found = deps.directories()?.directoryFor(sessionId)
        if (found !== undefined) setDirectory(found)
        return found !== undefined
      } catch {
        return false
      }
    }
    if (attempt()) return
    const timer = setInterval(() => { if (attempt()) clearInterval(timer) }, DIRECTORY_RETRY_MS)
    return () => { clearInterval(timer) }
  }, [sessionId])
  return directory
}

/**
 * The conversation's model and effort, through the directory its composer uses,
 * so a choice here shows there and the other way round.
 */
function ModelSettings(props: { directory: ModelDirectoryLike; t: Translate }): ReactNode {
  const { directory, t } = props
  const { current, groups } = useSyncExternalStore(listener => directory.store.subscribe(listener), () => directory.store.getSnapshot())
  const [failed, setFailed] = useState(false)
  useEffect(() => { directory.load().catch(() => undefined) }, [directory])
  const select = (selection: ModelSelectionLike): void => {
    setFailed(false)
    directory.select(selection).then((result) => { setFailed(!result.ok) }, () => { setFailed(true) })
  }
  const route = current === null ? '' : `${current.provider}/${current.model}`
  const chosen = groups.find(group => group.id === current?.provider)?.models.find(model => model.id === current?.model)
  const reasoning = chosen?.reasoning
  const chooseModel = (value: string): void => {
    const [provider = '', ...rest] = value.split('/')
    const model = rest.join('/')
    const effort = groups.find(group => group.id === provider)?.models.find(entry => entry.id === model)?.reasoning?.defaultEffort
    select({ provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) })
  }
  return (
    <>
      <label className="dsa-field">
        <span>{t('im.model')}</span>
        <select className="dsa-text" value={route} disabled={groups.length === 0} onChange={(event) => { chooseModel(event.target.value) }}>
          {current === null && <option value="">{t('im.model.none')}</option>}
          {current !== null && chosen === undefined && <option value={route}>{current.model}</option>}
          {groups.map(group => (
            <optgroup key={group.id} label={group.name ?? group.id}>
              {group.models.map(model => <option key={model.id} value={`${group.id}/${model.id}`}>{model.name ?? model.id}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {reasoning === undefined || current === null
        ? <Setting label={t('im.effort')} value={t('im.effort.none')} />
        : (
          <Setting label={t('im.effort')} value={current.reasoningEffort ?? reasoning.defaultEffort ?? ''}
            options={[
              ...(reasoning.defaultEffort === undefined ? [{ value: '', label: t('im.effort.default') }] : []),
              ...reasoning.efforts.map(effort => ({ value: effort.id, label: effort.name })),
            ]}
            onChange={(value) => { select({ provider: current.provider, model: current.model, ...(value === '' ? {} : { reasoningEffort: value }) }) }} />
        )}
      {failed && <p className="dsa-error">{t('im.failed')}</p>}
    </>
  )
}

/** What the assistant's workers may change; full access asks first. */
function PermissionSetting(props: { view: AssistantsView; person: Person; form: ConfigFormLike; t: Translate }): ReactNode {
  const { view, person, form, t } = props
  const mode = assistantSettings(person).sandboxMode
  const [confirming, setConfirming] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = (next: SandboxMode): void => {
    setConfirming(false)
    setFailed(false)
    setSandboxMode(form, view, person.id, next).then((ok) => { setFailed(!ok) }, () => { setFailed(true) })
  }
  return (
    <>
      <Setting label={t('im.permission')} value={mode}
        options={SANDBOX_MODES.map(value => ({ value, label: t(`im.permission.${value}`) }))}
        onChange={(value) => {
          if (value === 'danger-full-access') setConfirming(true)
          else save(value as SandboxMode)
        }} />
      {confirming
        ? (
          <div className="dsa-row dsa-confirm">
            <p>{t('im.permission.confirm')}</p>
            <button type="button" className="dsa-button dsa-danger" onClick={() => { save('danger-full-access') }}>{t('im.permission.enable')}</button>
            <button type="button" className="dsa-button" onClick={() => { setConfirming(false) }}>{t('form.cancel')}</button>
          </div>
        )
        : <p className="dsa-note">{t(`im.permission.${mode}.hint`)}</p>}
      {failed && <p className="dsa-error">{t('im.failed')}</p>}
    </>
  )
}

/** The settings of a bound account. */
function BoundSettings(props: { view: AssistantsView; person: Person; state: WechatState; deps: ImDeps; t: Translate }): ReactNode {
  const { view, person, state, deps, t } = props
  const [confirmRemove, setConfirmRemove] = useState(false)
  const directory = useDirectory(deps, person.sessionId)
  const sendMode = state.sendMode ?? 'queue'
  const commands = state.commands ?? true
  return (
    <>
      <div className="dsa-group">
        {directory === undefined
          ? (
            <>
              <Setting label={t('im.model')} value={t('im.followComposer')} />
              <Setting label={t('im.effort')} value={t('im.followComposer')} />
            </>
          )
          : <ModelSettings directory={directory} t={t} />}
        <PermissionSetting view={view} person={person} form={deps.form} t={t} />
        <Setting label={t('im.sendMode')} value={sendMode}
          options={[{ value: 'queue', label: t('im.sendMode.queue') }, { value: 'steer', label: t('im.sendMode.steer') }]}
          onChange={(value) => { void requestWechat(deps.form, person.id, 'options', { sendMode: value === 'steer' ? 'steer' : 'queue' }) }} />
        <Setting label={t('im.idleNew')} value={t('im.idleNew.value')} />
      </div>
      <p className="dsa-note">{sendMode === 'steer' ? t('im.sendMode.steer.hint') : t('im.sendMode.queue.hint')}</p>
      <div className="dsa-group">
        <Setting label={t('im.commands')} value={commands ? 'on' : 'off'}
          options={[{ value: 'on', label: t('im.commands.on') }, { value: 'off', label: t('im.commands.off') }]}
          onChange={(value) => { void requestWechat(deps.form, person.id, 'options', { commands: value === 'on' }) }} />
        <Setting label={t('im.groupCommands')} value={t('im.groupCommands.value')} />
      </div>
      <p className="dsa-note">{t('im.fixed.hint')}</p>
      {state.lastError !== undefined && <p className="dsa-error">{state.lastError}</p>}
      {state.notice !== undefined && <p className="dsa-error">{state.notice}</p>}
      {state.diagnosis !== undefined && (
        <div className="dsa-diagnosis">
          <strong>{state.diagnosis.ok ? t('im.diagnosis.ok') : t('im.diagnosis.problem')}</strong>
          <ul>
            {state.diagnosis.checks.map(check => (
              <li key={check.label} className={check.ok ? 'dsa-check-ok' : 'dsa-check-bad'}>
                {check.ok ? '✓' : '✕'} {check.label}{check.detail === undefined ? '' : `：${check.detail}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirmRemove
        ? (
          <div className="dsa-row dsa-confirm">
            <p>{t('im.remove.confirm', { name: person.name })}</p>
            <button type="button" className="dsa-button dsa-danger" onClick={() => { void requestWechat(deps.form, person.id, 'unbind') }}>{t('im.remove')}</button>
            <button type="button" className="dsa-button" onClick={() => { setConfirmRemove(false) }}>{t('form.cancel')}</button>
          </div>
        )
        : (
          <div className="dsa-im-actions">
            <button type="button" className="dsa-button" onClick={() => { void requestWechat(deps.form, person.id, 'diagnose') }}>{t('im.diagnose')}</button>
            <button type="button" className="dsa-button" onClick={() => { void requestWechat(deps.form, person.id, 'reconnect') }}>{t('im.reconnect')}</button>
            <button type="button" className="dsa-button dsa-danger dsa-outline" onClick={() => { setConfirmRemove(true) }}>{t('im.remove')}</button>
          </div>
        )}
    </>
  )
}

/** A small WeChat-green chat mark, drawn without the brand's logo. */
function WechatMark(): ReactNode {
  return (
    <svg className="dsa-im-mark" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <ellipse cx="14" cy="15" rx="11" ry="9" fill="#07c160" />
      <ellipse cx="23" cy="21" rx="9" ry="7.5" fill="#07c160" stroke="var(--dsw-alias-bg-layer-1, #222)" strokeWidth="1.5" />
      <circle cx="10.5" cy="13.5" r="1.4" fill="#fff" />
      <circle cx="17.5" cy="13.5" r="1.4" fill="#fff" />
      <circle cx="20.5" cy="20" r="1.1" fill="#fff" />
      <circle cx="25.5" cy="20" r="1.1" fill="#fff" />
    </svg>
  )
}
