/**
 * The assistant's name in the conversation header, as a menu that switches to
 * another assistant or creates a new one. It sits first among the header's
 * actions, and the stylesheet hides the host's plain title beside it.
 * @module dsh-assisstant/client/switcher
 */

import type { ReactNode } from 'react'
import { assistantsView, useForm } from './assistants.ts'
import type { ConfigFormLike, Translate, UiWorkspaceLike } from './host.ts'
import { fallbackT } from './locales.ts'
import { Dropdown } from './menu.tsx'

/** What the menu reads and does. */
export interface SwitcherDeps {
  readonly form: ConfigFormLike
  workspace(): UiWorkspaceLike | undefined
  /** Show the form that creates an assistant. */
  createAssistant(): void
}

/** Build the `conversation.session.header.actions` entry. */
export function createSwitcher(deps: SwitcherDeps) {
  return function AssistantSwitcher(props: { t?: Translate; sessionId?: string }): ReactNode {
    const t = props.t ?? fallbackT
    const view = assistantsView(useForm(deps.form))
    const current = view.people.find(person => person.sessionId !== undefined && person.sessionId === props.sessionId)
    // A split pane can show another session's header while this entry is registered.
    if (current === undefined) return null
    return (
      <Dropdown className="dsa-switcher" label={current.name} ariaLabel={t('switcher.label')}>
        {close => (
          <>
            {view.people.map(person => (
              <button key={person.id} type="button" role="menuitemradio" aria-checked={person.id === current.id} className="dsa-menu-item"
                disabled={person.sessionId === undefined}
                onClick={() => {
                  close()
                  if (person.sessionId !== undefined && person.id !== current.id) deps.workspace()?.openSession(person.sessionId)
                }}>
                <span className="dsa-menu-name">{person.name}</span>
                {person.sessionId === undefined && <span className="dsa-note">{t('page.preparing')}</span>}
                {person.id === current.id && <span aria-hidden="true">✓</span>}
              </button>
            ))}
            <div role="separator" className="dsa-menu-separator" />
            <button type="button" role="menuitem" className="dsa-menu-item" onClick={() => { close(); deps.createAssistant() }}>
              ＋ {t('switcher.create')}
            </button>
          </>
        )}
      </Dropdown>
    )
  }
}
