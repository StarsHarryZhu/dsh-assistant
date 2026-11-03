/**
 * The main-area page behind the sidebar row. It is only a way into a
 * conversation: the row opens the assistant last shown here, in the host's
 * own conversation view. The page itself shows the form that creates an
 * assistant (when none exists, or when the header's menu asked for it) and any
 * assistant whose conversation is not ready yet. The form requires a workspace
 * folder. Every control is inline: the desktop shell has no `window.prompt`.
 * @module dsh-assisstant/client/page
 */

import { useEffect, useState, type ReactNode } from 'react'
import { addPerson, assistantToOpen, assistantsView, removePerson, useForm } from './assistants.ts'
import type { AssistantsView } from './assistants.ts'
import type { ConfigFormLike, Translate, UiWorkspaceLike } from './host.ts'
import { fallbackT } from './locales.ts'

/** What the page reads, injected once at registration. */
export interface PageDeps {
  readonly form: ConfigFormLike
  workspace(): UiWorkspaceLike | undefined
  /** Whether this opening of the page should show the form; reading it clears the request. */
  takeCreateRequest(): boolean
}

/** The local desktop shell's folder chooser, which the host prefers over its own when present. */
interface DesktopPicker {
  pick(): Promise<string | null>
}

/** @returns the folder the user chose, or null when they cancelled. */
function pickFolder(workspace: UiWorkspaceLike | undefined): Promise<string | null> {
  const desktop = (globalThis as { __DSH_DIRECTORY_PICKER__?: DesktopPicker }).__DSH_DIRECTORY_PICKER__
  if (desktop !== undefined) return desktop.pick()
  return workspace === undefined ? Promise.reject(new Error('no folder chooser')) : workspace.pickDirectory()
}

/** Build the `main` entry component. */
export function createMainPage(deps: PageDeps) {
  return function MainPage(props: { t?: Translate }): ReactNode {
    const t = props.t ?? fallbackT
    const view = assistantsView(useForm(deps.form))
    const [adding, setAdding] = useState(() => deps.takeCreateRequest())
    // A new assistant opens as soon as the host has created its conversation.
    const [opening, setOpening] = useState<string | undefined>()
    const created = view.people.find(person => person.id === opening)?.sessionId
    useEffect(() => {
      if (opening === undefined || created === undefined) return
      setOpening(undefined)
      deps.workspace()?.openSession(created)
    }, [opening, created])

    const pending = view.people.filter(person => person.sessionId === undefined)
    const showForm = adding || view.people.length === 0
    const target = view.ready && !showForm && opening === undefined && pending.length === 0 ? assistantToOpen(view.people)?.sessionId : undefined
    useEffect(() => {
      if (target !== undefined) deps.workspace()?.openSession(target)
    }, [target])

    if (!view.ready) return <div className="dsa-page"><p className="dsa-note">{t('page.loading')}</p></div>
    if (showForm) {
      return (
        <div className="dsa-page">
          <CreateForm view={view} deps={deps} t={t} cancellable={view.people.length > 0}
            onDone={(id) => { setAdding(false); setOpening(id) }} />
        </div>
      )
    }
    return (
      <div className="dsa-page">
        {pending.length === 0 && <p className="dsa-note">{t('page.opening')}</p>}
        {pending.map(person => (
          <div key={person.id} className="dsa-row">
            <strong>{person.name}</strong>
            <span className="dsa-note">{t('page.preparing')}</span>
            <button type="button" className="dsa-button dsa-danger" onClick={() => { void removePerson(deps.form, view, person.id) }}>{t('settings.delete')}</button>
          </div>
        ))}
      </div>
    )
  }
}

/** The form that creates an assistant; it cannot be sent without a workspace folder. */
function CreateForm(props: { view: AssistantsView; deps: PageDeps; t: Translate; cancellable: boolean; onDone: (id?: string) => void }): ReactNode {
  const { t, view } = props
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [folder, setFolder] = useState<string | undefined>()
  const [pickFailed, setPickFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const owner = view.people.find(person => person.cwd !== undefined && person.cwd === folder)
  const ready = name.trim() !== '' && folder !== undefined && owner === undefined && !busy && view.writable
  const submit = async (): Promise<void> => {
    if (!ready) return
    setBusy(true)
    setFailed(false)
    const id = await addPerson(props.deps.form, view, { name, address }, folder)
    setBusy(false)
    if (id === undefined) setFailed(true)
    else props.onDone(id)
  }
  return (
    <form className="dsa-create" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <h2>{t('empty.title')}</h2>
      <p className="dsa-note">{t('empty.hint')}</p>
      <label className="dsa-field">
        <span>{t('form.name')}</span>
        <input className="dsa-text" value={name} placeholder={t('form.name.placeholder')} autoFocus
          onChange={(event) => { setName(event.target.value) }} />
      </label>
      <label className="dsa-field">
        <span>{t('form.address')}</span>
        <input className="dsa-text" value={address} placeholder={t('form.address.placeholder')}
          onChange={(event) => { setAddress(event.target.value) }} />
      </label>
      <div className="dsa-field">
        <span>{t('form.folder')}</span>
        <span className="dsa-note">{folder ?? t('form.folder.none')}</span>
        <span className="dsa-row">
          <button type="button" className="dsa-button" onClick={() => {
            setPickFailed(false)
            pickFolder(props.deps.workspace()).then((picked) => { if (picked !== null) setFolder(picked) }, () => { setPickFailed(true) })
          }}>{t('form.folder.pick')}</button>
        </span>
        {pickFailed && <span className="dsa-note dsa-error">{t('form.folder.failed')}</span>}
        {owner !== undefined && <span className="dsa-note dsa-error">{t('form.folder.taken', { name: owner.name })}</span>}
      </div>
      {failed && <p className="dsa-note dsa-error">{t('settings.failed')}</p>}
      {!view.writable && <p className="dsa-note dsa-error">{t('settings.readonly')}</p>}
      <div className="dsa-row">
        <button type="submit" className="dsa-button dsa-primary" disabled={!ready}>{busy ? t('form.creating') : t('form.create')}</button>
        {props.cancellable && <button type="button" className="dsa-button" onClick={() => { props.onDone() }}>{t('form.cancel')}</button>}
      </div>
    </form>
  )
}
