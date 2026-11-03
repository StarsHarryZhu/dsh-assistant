/**
 * The settings pages, laid out alike: the settings every assistant shares on
 * the Plugins screen (worker models, compaction, the balance reminder, persona
 * and profile limits), and each assistant's own in its conversation's settings
 * tab (its name and form of address, schedule, watchdog, WeChat, and removing
 * it). Each saves through the host's settings form of the row.
 * @module dsh-assisstant/client/settings
 */

import { useEffect, useState, type ReactNode } from 'react'
import { ASSISTANT_DEFAULTS, COMPACT_RATIO_RANGE, DEFAULTS, MAX_BALANCE_CHECK_MINUTES, MIN_WATCHDOG_MINUTES, MIN_WECHAT_REPLY_CHARS, assistantSettings, readWorkerModels } from '../shared/settings.ts'
import type { AssistantSettings, Person, WorkerModel } from '../shared/settings.ts'
import { assistantsView, removePerson, updateAssistant, useForm } from './assistants.ts'
import type { AssistantsView } from './assistants.ts'
import type { CatalogGroup, ConfigFormLike, PathOp, RemoteSessionLike, Translate, UiWorkspaceLike } from './host.ts'
import { fallbackT } from './locales.ts'
import { Dropdown } from './menu.tsx'

/** How one field is edited. */
type FieldKind = 'text' | 'textarea' | 'number' | 'percent' | 'boolean' | 'time'

/** One editable setting. */
interface Field {
  readonly key: string
  readonly kind: FieldKind
  readonly group: string
  readonly min?: number
  readonly max?: number
  /** A number that may have decimals; the others are whole numbers, as the host's schema requires. */
  readonly decimal?: boolean
}

/** The settings every assistant shares, in display order. The worker models have their own picker. */
export const FIELDS: readonly Field[] = [
  { key: 'compactRatio', kind: 'percent', group: 'compact', min: COMPACT_RATIO_RANGE.min * 100, max: COMPACT_RATIO_RANGE.max * 100 },
  { key: 'balanceThreshold', kind: 'number', group: 'balance', min: 0, decimal: true },
  { key: 'balanceCheckMinutes', kind: 'number', group: 'balance', min: 1, max: MAX_BALANCE_CHECK_MINUTES },
  { key: 'balanceReminder', kind: 'textarea', group: 'balance' },
  { key: 'personaSelfCorrect', kind: 'boolean', group: 'persona' },
  { key: 'personaCooldownHours', kind: 'number', group: 'persona', min: 0 },
  { key: 'personaMaxChars', kind: 'number', group: 'persona', min: 200 },
  { key: 'profileMaxChars', kind: 'number', group: 'persona', min: 500 },
]

const GROUPS = ['model', 'compact', 'balance', 'persona']

/** The settings each assistant has for itself, in display order. */
export const ASSISTANT_FIELDS: readonly Field[] = [
  { key: 'reminderLeadMinutes', kind: 'number', group: 'schedule', min: 0 },
  { key: 'dailyBriefTime', kind: 'time', group: 'schedule' },
  { key: 'watchdogStallMinutes', kind: 'number', group: 'watchdog', min: MIN_WATCHDOG_MINUTES },
  { key: 'wechatEnabled', kind: 'boolean', group: 'wechat' },
  { key: 'wechatReplyMaxChars', kind: 'number', group: 'wechat', min: MIN_WECHAT_REPLY_CHARS },
]

const ASSISTANT_GROUPS = ['schedule', 'watchdog', 'wechat']

/** One field's value. */
type Value = string | number | boolean

/** The edited values of the shared settings. */
export type Values = Record<string, Value | readonly WorkerModel[]>

/**
 * Read the stored shared settings with defaults.
 * @param value - the form's accepted section.
 * @returns one value per field, plus the worker models.
 */
export function readValues(value: Record<string, unknown> | undefined): Values {
  const values: Values = { workerModels: readWorkerModels(value?.workerModels) }
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const stored = value?.[key]
    const fallback = DEFAULTS[key]
    values[key] = typeof stored === typeof fallback ? stored as Value : fallback
  }
  return values
}

/**
 * The edits that turn the stored values into the draft.
 * @param stored - the saved values.
 * @param draft - the edited values.
 * @returns one `set` per changed field.
 */
export function changes(stored: Values, draft: Values): PathOp[] {
  return Object.keys(draft)
    .filter(key => JSON.stringify(draft[key]) !== JSON.stringify(stored[key]))
    .map(key => ({ op: 'set', path: [key], value: draft[key] }))
}

/** The save button and what became of the latest save. */
function SaveRow(props: { disabled: boolean; status: SaveStatus; onSave: () => void; t: Translate }): ReactNode {
  const { t, status } = props
  return (
    <div className="dsa-row">
      <button type="button" className="dsa-button dsa-primary" disabled={props.disabled || status === 'saving'} onClick={props.onSave}>{t('settings.save')}</button>
      {status === 'saved' && <span className="dsa-note">{t('settings.saved')}</span>}
      {status === 'failed' && <span className="dsa-note dsa-error">{t('settings.failed')}</span>}
    </div>
  )
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * Build the Plugins screen's settings component over the form and the model catalog.
 * @param form - the settings form of the row.
 * @param getSession - the live `ctx.remote.session`, for the model catalog.
 * @returns the `plugins.bundle.config` entry.
 */
export function createSettings(form: ConfigFormLike, getSession: () => RemoteSessionLike | undefined) {
  return function SharedSettings(props: { view?: 'summary' | 'page'; t?: Translate }): ReactNode {
    const t = props.t ?? fallbackT
    const snapshot = useForm(form)
    const stored = readValues(snapshot.value)
    if (props.view === 'summary') {
      return t('settings.summary', { ratio: Math.round(Number(stored.compactRatio) * 100) })
    }
    if (snapshot.status !== 'ready') return <p className="dsa-note">{t('settings.loading')}</p>
    return <SettingsPage form={form} stored={stored} writable={snapshot.writable !== false} revision={snapshot.revision} getSession={getSession} t={t} />
  }
}

function SettingsPage(props: {
  form: ConfigFormLike
  stored: Values
  writable: boolean
  revision: number | undefined
  getSession: () => RemoteSessionLike | undefined
  t: Translate
}): ReactNode {
  const { t } = props
  const storedKey = JSON.stringify(props.stored)
  const [draft, setDraft] = useState<Values>(props.stored)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [groups, setGroups] = useState<readonly CatalogGroup[] | undefined | null>(undefined)
  useEffect(() => { setDraft(props.stored) }, [storedKey])
  useEffect(() => {
    let alive = true
    const session = props.getSession()
    if (session === undefined) {
      setGroups(null)
      return
    }
    session.modelCatalog().then((result) => {
      if (alive) setGroups(result.ok && result.value !== undefined ? result.value.groups : null)
    }, () => { if (alive) setGroups(null) })
    return () => { alive = false }
  }, [])

  const ops = changes(props.stored, draft)
  const set = (key: string, value: Values[string]): void => {
    setStatus('idle')
    setDraft(current => ({ ...current, [key]: value }))
  }
  const save = async (): Promise<void> => {
    setStatus('saving')
    setStatus(await props.form.mutate(ops, props.revision) ? 'saved' : 'failed')
  }
  return (
    <div className="dsa-settings">
      {!props.writable && <p className="dsa-note dsa-error">{t('settings.readonly')}</p>}
      {GROUPS.map(group => (
        <section key={group} className="dsa-group">
          <h3>{t(`settings.group.${group}`)}</h3>
          {group === 'model' && (
            <WorkerModels label={t('settings.workerModels')} hint={groups === null ? t('settings.workerModels.catalogFailed') : t('settings.workerModels.hint')}
              selected={draft.workerModels as readonly WorkerModel[]} groups={groups ?? []}
              onChange={(models) => { set('workerModels', models) }} />
          )}
          {FIELDS.filter(field => field.group === group).map(field => (
            <FieldInput key={field.key} field={field} value={draft[field.key] as Value} label={t(`settings.${field.key}`)}
              onChange={(value) => { set(field.key, value) }} />
          ))}
        </section>
      ))}
      <SaveRow disabled={ops.length === 0 || !props.writable} status={status} onSave={() => { void save() }} t={t} />
    </div>
  )
}

/** What an assistant's settings tab reads and does. */
export interface AssistantSettingsDeps {
  readonly form: ConfigFormLike
  workspace(): UiWorkspaceLike | undefined
  /** Leave a deleted assistant's conversation for the next assistant or the form. */
  openPage(): void
}

/** Build the `conversation.view` component of the settings tab. */
export function createAssistantSettings(deps: AssistantSettingsDeps) {
  return function AssistantSettingsView(props: { t?: Translate; sessionId?: string }): ReactNode {
    const t = props.t ?? fallbackT
    const view = assistantsView(useForm(deps.form))
    const person = view.people.find(entry => entry.sessionId !== undefined && entry.sessionId === props.sessionId)
    if (person === undefined) return <div className="dsa-view"><p className="dsa-note">{t('im.notAssistant')}</p></div>
    return <div className="dsa-view"><AssistantPage key={person.id} view={view} person={person} deps={deps} t={t} /></div>
  }
}

/** @returns the stored name, form of address, and settings of one assistant, as the draft edits them. */
function assistantDraft(person: Person): Record<string, Value> {
  return { name: person.name, address: person.address ?? '', ...assistantSettings(person) }
}

function AssistantPage(props: { view: AssistantsView; person: Person; deps: AssistantSettingsDeps; t: Translate }): ReactNode {
  const { view, person, deps, t } = props
  const stored = assistantDraft(person)
  const storedKey = JSON.stringify(stored)
  const [draft, setDraft] = useState(stored)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { setDraft(stored) }, [storedKey])
  const set = (key: string, value: Value): void => {
    setStatus('idle')
    setDraft(current => ({ ...current, [key]: value }))
  }
  const save = async (): Promise<void> => {
    setStatus('saving')
    const settings = Object.fromEntries(Object.keys(ASSISTANT_DEFAULTS).map(key => [key, draft[key]])) as unknown as AssistantSettings
    setStatus(await updateAssistant(deps.form, view, person.id, { name: String(draft.name), address: String(draft.address) }, settings) ? 'saved' : 'failed')
  }
  const remove = async (): Promise<void> => {
    if (person.sessionId !== undefined) {
      try {
        await deps.workspace()?.archiveSession(person.sessionId)
      } catch {
        // A session outside every workspace cannot be archived; it stays ungrouped.
      }
    }
    await removePerson(deps.form, view, person.id)
    deps.openPage()
  }
  return (
    <div className="dsa-settings">
      {!view.writable && <p className="dsa-note dsa-error">{t('settings.readonly')}</p>}
      <section className="dsa-group">
        <h3>{t('settings.group.assistant')}</h3>
        <label className="dsa-field">
          <span>{t('form.name')}</span>
          <input className="dsa-text" value={String(draft.name)} onChange={(event) => { set('name', event.target.value) }} />
        </label>
        <label className="dsa-field">
          <span>{t('form.address')}</span>
          <input className="dsa-text" value={String(draft.address)} placeholder={t('form.address.placeholder')} onChange={(event) => { set('address', event.target.value) }} />
        </label>
        <label className="dsa-field">
          <span>{t('form.folder')}</span>
          <input className="dsa-text" value={person.cwd ?? ''} title={person.cwd} disabled />
        </label>
      </section>
      {ASSISTANT_GROUPS.map(group => (
        <section key={group} className="dsa-group">
          <h3>{t(`settings.group.${group}`)}</h3>
          {ASSISTANT_FIELDS.filter(field => field.group === group).map(field => (
            <FieldInput key={field.key} field={field} value={draft[field.key] as Value} label={t(`settings.${field.key}`)}
              onChange={(value) => { set(field.key, value) }} />
          ))}
        </section>
      ))}
      <SaveRow disabled={JSON.stringify(draft) === storedKey || String(draft.name).trim() === '' || !view.writable} status={status} onSave={() => { void save() }} t={t} />
      {confirming
        ? (
          <div className="dsa-row dsa-confirm">
            <p>{t('delete.confirm', { name: person.name })}</p>
            <button type="button" className="dsa-button dsa-danger" onClick={() => { void remove() }}>{t('settings.delete')}</button>
            <button type="button" className="dsa-button" onClick={() => { setConfirming(false) }}>{t('form.cancel')}</button>
          </div>
        )
        : <div className="dsa-row"><button type="button" className="dsa-button dsa-danger" onClick={() => { setConfirming(true) }}>{t('settings.delete.assistant')}</button></div>}
    </div>
  )
}

/** The display name of a model, from the catalog when it lists it. */
function modelName(entry: WorkerModel, groups: readonly CatalogGroup[]): string {
  return groups.find(group => group.id === entry.provider)?.models.find(model => model.id === entry.model)?.name ?? entry.model
}

/**
 * The models workers may run, as a menu of checkboxes. A stored model the
 * catalog does not list stays listed, and the last one cannot be unchecked:
 * a worker must run something.
 */
function WorkerModels(props: {
  label: string
  hint: string
  selected: readonly WorkerModel[]
  groups: readonly CatalogGroup[]
  onChange: (models: readonly WorkerModel[]) => void
}): ReactNode {
  const { selected, groups } = props
  const isChosen = (provider: string, model: string): boolean => selected.some(entry => entry.provider === provider && entry.model === model)
  const row = (provider: string, model: string, name: string): ReactNode => {
    const chosen = isChosen(provider, model)
    return (
      <label key={`${provider}/${model}`} className="dsa-menu-item" role="menuitemcheckbox" aria-checked={chosen}>
        <input type="checkbox" checked={chosen} disabled={chosen && selected.length === 1} onChange={() => {
          props.onChange(chosen ? selected.filter(entry => entry.provider !== provider || entry.model !== model) : [...selected, { provider, model }])
        }} />
        <span className="dsa-menu-name">{name}</span>
      </label>
    )
  }
  const unlisted = selected.filter(entry => !groups.some(group => group.id === entry.provider && group.models.some(model => model.id === entry.model)))
  return (
    <div className="dsa-field">
      <span>{props.label}</span>
      <Dropdown className="dsa-text dsa-multi" ariaLabel={props.label} label={selected.map(entry => modelName(entry, groups)).join('、')}>
        {() => (
          <>
            {groups.map(group => (
              <div key={group.id} role="group" className="dsa-menu-group">
                <div className="dsa-menu-heading">{group.name ?? group.id}</div>
                {group.models.map(model => row(group.id, model.id, model.name ?? model.id))}
              </div>
            ))}
            {unlisted.map(entry => row(entry.provider, entry.model, `${entry.provider}/${entry.model}`))}
          </>
        )}
      </Dropdown>
      <span className="dsa-note">{props.hint}</span>
    </div>
  )
}

/** @returns what a typed number becomes: nothing readable keeps the fallback, a whole-number field rounds, and anything out of range goes to the nearest bound. */
function correctedNumber(text: string, field: Field, fallback: string): string {
  const number = Number(text)
  if (text.trim() === '' || !Number.isFinite(number)) return fallback
  const rounded = field.decimal === true ? number : Math.round(number)
  return String(Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, rounded)))
}

/** @returns what a typed clock time becomes: empty stays empty (no brief), 8, 8:00, and 0800 read as 08:00, and anything else keeps the fallback. */
function correctedTime(text: string, fallback: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const match = /^(\d{1,2})(?:[:：.]?(\d{2}))?$/u.exec(trimmed)
  const hour = Number(match?.[1])
  const minute = Number(match?.[2] ?? 0)
  if (match === null || hour > 23 || minute > 59) return fallback
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * An input that shows what is typed, an empty box included, and corrects it
 * when the field is left. The draft already holds the corrected value while
 * typing, so the save button is right even before the field is left.
 */
function CorrectedInput(props: {
  label: string
  value: string
  type: 'number' | 'text'
  min?: number | undefined
  max?: number | undefined
  correct: (text: string, fallback: string) => string
  onChange: (value: string) => void
}): ReactNode {
  const [text, setText] = useState(props.value)
  const [before, setBefore] = useState<string | undefined>()
  useEffect(() => { if (before === undefined) setText(props.value) }, [props.value, before])
  const fallback = before ?? props.value
  const finish = (): void => {
    const corrected = props.correct(text, fallback)
    setBefore(undefined)
    setText(corrected)
    props.onChange(corrected)
  }
  return (
    <label className="dsa-field">
      <span>{props.label}</span>
      <input className="dsa-text" type={props.type} min={props.min} max={props.max} value={text}
        onFocus={() => { setBefore(props.value) }}
        onChange={(event) => {
          setText(event.target.value)
          props.onChange(props.correct(event.target.value, fallback))
        }}
        onBlur={finish}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    </label>
  )
}

function FieldInput(props: { field: Field; value: Value; label: string; onChange: (value: Value) => void }): ReactNode {
  const { field, value } = props
  if (field.kind === 'boolean') {
    return (
      <label className="dsa-check">
        <input type="checkbox" checked={value === true} onChange={(event) => { props.onChange(event.target.checked) }} />
        <span>{props.label}</span>
      </label>
    )
  }
  if (field.kind === 'textarea') {
    return (
      <label className="dsa-field">
        <span>{props.label}</span>
        <textarea className="dsa-text" rows={3} value={String(value)} onChange={(event) => { props.onChange(event.target.value) }} />
      </label>
    )
  }
  if (field.kind === 'text') {
    return (
      <label className="dsa-field">
        <span>{props.label}</span>
        <input className="dsa-text" value={String(value)} onChange={(event) => { props.onChange(event.target.value) }} />
      </label>
    )
  }
  if (field.kind === 'time') {
    return <CorrectedInput label={props.label} type="text" value={String(value)} correct={correctedTime} onChange={props.onChange} />
  }
  const percent = field.kind === 'percent'
  return (
    <CorrectedInput label={props.label} type="number" min={field.min} max={field.max}
      value={String(percent ? Math.round(Number(value) * 100) : Number(value))}
      correct={(text, fallback) => correctedNumber(text, field, fallback)}
      onChange={(text) => { props.onChange(percent ? Number(text) / 100 : Number(text)) }} />
  )
}
