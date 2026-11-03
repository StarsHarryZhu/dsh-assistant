/**
 * dsh-assisstant browser half:
 *
 * - the「助理」row in the left sidebar and its page in the main area (both
 *   under the id `dsh-assisstant`, registered and removed together): the row
 *   opens an assistant's conversation, and the page holds the form that
 *   creates one;
 * - the settings every assistant shares on the Plugins screen;
 * - plain titles for the record tools' calls in the conversation;
 * - while the host's conversation view shows an assistant conversation: the header
 *   menu that switches assistants or creates one, the IM tab and the
 *   assistant's own settings tab among its view tabs, and a root attribute
 *   that hides the composer's permission picker (the host pins it anyway).
 *
 * Assistant conversations use the host's own conversation view, so plugins that
 * change that view reach them too; the tools stay isolated on the host side.
 * Each contribution is an effect of this plugin's context and is skipped
 * (logged) if its host seat is missing.
 * @module dsh-assisstant/client
 */

import { RECORD_TOOLS } from '../shared/record-tools.ts'
import { PACKAGE_NAME, PANEL_ID, PLUGIN_ID, readPeople } from '../shared/settings.ts'
import type {
  ClientContextLike,
  ConfigFormLike,
  ConfigFormsLike,
  LayoutLike,
  LocaleLike,
  ModelDirectoriesLike,
  PluginNavigationLike,
  RemoteSessionLike,
  SessionsLike,
  SlotsLike,
  Translate,
  UiWorkspaceLike,
} from './host.ts'
import { rememberAssistant } from './assistants.ts'
import { createImView } from './im.tsx'
import { en, fallbackT, zh } from './locales.ts'
import { createMainPage } from './page.tsx'
import { RecordRow } from './record-row.tsx'
import { createAssistantSettings, createSettings } from './settings.tsx'
import { createSwitcher } from './switcher.tsx'
import css from './styles.css'

declare const require: (request: string) => unknown

export const name = PACKAGE_NAME
export const inject = ['slots', 'locale']

/** Root attribute present while the conversation view shows an assistant conversation. */
export const ASSISTANT_ATTRIBUTE = 'data-dsh-assisstant-session'

/** Ids of the view tabs added to assistant conversations. */
export const VIEW_IDS = { im: 'dsh-assisstant-im', settings: 'dsh-assisstant-settings' } as const

/** Their places among the view tabs: Chat is 0, Trajectory 10, plugin tabs from 20 (Context 20, Stats 40). */
export const VIEW_ORDER = { im: 11, settings: 12 } as const

/** Id of the header menu and its place among the header's actions, ahead of the preset label (-10). */
export const SWITCHER = { id: 'dsh-assisstant-switcher', order: -20 } as const

/** The sidebar icon: a small house. */
function HouseIcon(props: { size?: number }) {
  const size = props.size ?? 16
  // Built without JSX so this module needs no React import at runtime.
  const react = require('react') as typeof import('react')
  return react.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    react.createElement('path', { d: 'M3 10.5 12 3l9 7.5' }),
    react.createElement('path', { d: 'M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5' }))
}

/**
 * Follow which assistant conversation, if any, the host's conversation view holds.
 * @param deps - the session retain info and the form with the assistant list.
 * @param onChange - called with the held assistant session id, or undefined, whenever that changes.
 * @returns the cleanup.
 */
export function watchAssistantView(deps: { sessions: SessionsLike; form: ConfigFormLike }, onChange: (sessionId: string | undefined) => void): () => void {
  let subscriptions: (() => void)[] = []
  let shown: string | undefined
  const check = (): void => {
    const held = readPeople(deps.form.getSnapshot().value?.people)
      .map(person => person.sessionId)
      .find(sessionId => sessionId !== undefined && (deps.sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0) > 0)
    if (held === shown) return
    shown = held
    onChange(held)
  }
  const watchPeople = (): void => {
    for (const dispose of subscriptions) dispose()
    subscriptions = readPeople(deps.form.getSnapshot().value?.people)
      .filter(person => person.sessionId !== undefined)
      .map(person => deps.sessions.retainInfo(person.sessionId as string).subscribe(check))
    check()
  }
  const disposeForm = deps.form.subscribe(watchPeople)
  watchPeople()
  return () => {
    disposeForm()
    for (const dispose of subscriptions) dispose()
    if (shown !== undefined) onChange(undefined)
  }
}

/**
 * Register the browser contributions.
 * @param ctx - the plugin's client context.
 */
export function apply(ctx: ClientContextLike): void {
  const slots = ctx.get?.('slots') as SlotsLike | undefined
  const locale = ctx.get?.('locale') as LocaleLike | undefined
  if (slots === undefined) {
    console.error(`${PLUGIN_ID}: the slots service is missing, so the assistant page cannot render`)
    return
  }
  let session: RemoteSessionLike | undefined

  guard('dictionaries', () => {
    if (locale !== undefined) ctx.effect?.(() => locale.register(PACKAGE_NAME, { zh, en }), `${PACKAGE_NAME}: dictionaries`)
  })
  guard('styles', () => {
    ctx.effect?.(() => mountStyles(css), `${PLUGIN_ID}: styles`)
  })
  guard('record rows', () => {
    slots.inject('tool.call.toolview', () => {
      const disposers = RECORD_TOOLS.map(key => slots.register({ name: 'tool.call.toolview', key, locale: PACKAGE_NAME }, RecordRow))
      return () => { for (const dispose of disposers) dispose() }
    })
  })
  let directories: ModelDirectoriesLike | undefined
  guard('model directories', () => {
    ctx.inject?.(['modelDirectories'], (scope) => {
      const service = scope.get?.('modelDirectories') as ModelDirectoriesLike | undefined
      directories = service
      scope.effect?.(() => () => { if (directories === service) directories = undefined }, `${PLUGIN_ID}: model directories`)
    })
  })
  guard('remote', () => {
    ctx.inject?.(['remote', 'remote.session'], (scope) => {
      const service = (scope.get?.('remote') as { session?: RemoteSessionLike } | undefined)?.session
      session = service
      scope.effect?.(() => () => { if (session === service) session = undefined }, `${PLUGIN_ID}: remote session`)
    })
  })
  guard('pages', () => {
    ctx.inject?.(['configForms'], (scope) => {
      const forms = scope.get?.('configForms') as ConfigFormsLike | undefined
      const scopedSlots = (scope.get?.('slots') as SlotsLike | undefined) ?? slots
      if (forms === undefined) return
      const form = forms.get(PLUGIN_ID)
      const Settings = createSettings(form, () => session)
      scopedSlots.inject('plugins.bundle.config', () => scopedSlots.register(
        { name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: PACKAGE_NAME },
        Settings,
      ))
      const workspace = (): UiWorkspaceLike | undefined => ctx.get?.('uiWorkspace') as UiWorkspaceLike | undefined
      const openPage = (): void => {
        try {
          (ctx.get?.('layout') as LayoutLike | undefined)?.selectPanel(PANEL_ID)
        } catch {
          // The page is not registered (yet); nothing to show.
        }
      }
      let createRequested = false
      const MainPage = createMainPage({
        form,
        workspace,
        takeCreateRequest: () => {
          const requested = createRequested
          createRequested = false
          return requested
        },
      })
      // Nested as dsh-mnemon does: the icon exists only while the page does.
      scopedSlots.inject('main', () => {
        const disposePage = scopedSlots.register({ name: 'main', key: PANEL_ID, locale: PACKAGE_NAME }, MainPage)
        const disposeIcon = scopedSlots.inject('sidebar.panellist', () => scopedSlots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 2, locale: PACKAGE_NAME, label: () => fallbackT('panel') },
          HouseIcon,
        ))
        return () => {
          if (typeof disposeIcon === 'function') (disposeIcon as () => void)()
          disposePage()
        }
      })

      const ImView = createImView({ form, directories: () => directories })
      const SettingsView = createAssistantSettings({
        form,
        workspace,
        openPage,
        sharedSettings: () => {
          const navigation = ctx.get?.('pluginNavigation') as PluginNavigationLike | undefined
          return navigation === undefined ? undefined : () => { navigation.openBundle(PACKAGE_NAME) }
        },
      })
      const Switcher = createSwitcher({ form, workspace, createAssistant: () => { createRequested = true; openPage() } })
      const registerViews = (): (() => void) => {
        const disposeViews = scopedSlots.inject('conversation.view', () => {
          const im = scopedSlots.register({
            name: 'conversation.view',
            id: VIEW_IDS.im,
            order: VIEW_ORDER.im,
            locale: PACKAGE_NAME,
            label: () => fallbackT('view.im'),
            inject: (sessionId: string) => ({ sessionId }),
          }, ImView)
          const settings = scopedSlots.register({
            name: 'conversation.view',
            id: VIEW_IDS.settings,
            order: VIEW_ORDER.settings,
            locale: PACKAGE_NAME,
            label: () => fallbackT('view.settings'),
            inject: (sessionId: string) => ({ sessionId }),
          }, SettingsView)
          return () => { settings(); im() }
        })
        const disposeSwitcher = scopedSlots.inject('conversation.session.header.actions', () => scopedSlots.register({
          name: 'conversation.session.header.actions',
          id: SWITCHER.id,
          order: SWITCHER.order,
          locale: PACKAGE_NAME,
          inject: (sessionId: string) => ({ sessionId }),
        }, Switcher))
        return () => {
          if (typeof disposeSwitcher === 'function') (disposeSwitcher as () => void)()
          if (typeof disposeViews === 'function') (disposeViews as () => void)()
        }
      }
      scope.inject?.(['sessions'], (inner) => {
        const sessions = inner.get?.('sessions') as SessionsLike | undefined
        if (sessions === undefined) return
        inner.effect?.(() => {
          let disposeViews: (() => void) | undefined
          const stop = watchAssistantView({ sessions, form }, (sessionId) => {
            const root = typeof document === 'undefined' ? undefined : document.documentElement
            if (sessionId === undefined) {
              root?.removeAttribute(ASSISTANT_ATTRIBUTE)
              disposeViews?.()
              disposeViews = undefined
              return
            }
            rememberAssistant(sessionId)
            root?.setAttribute(ASSISTANT_ATTRIBUTE, sessionId)
            disposeViews ??= registerViews()
          })
          return () => {
            stop()
            disposeViews?.()
          }
        }, `${PLUGIN_ID}: assistant conversation tabs`)
      })
    })
  })
}

/** Run one contribution, logging instead of throwing: a throw here fails the page's boot. */
function guard(label: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    console.error(`${PLUGIN_ID}: the ${label} could not be registered`, error)
  }
}

/**
 * Add the plugin's stylesheet, tagged with the plugin id.
 * @param text - the stylesheet.
 * @returns the cleanup that removes it.
 */
function mountStyles(text: string): () => void {
  if (typeof document === 'undefined') return () => undefined
  const style = document.createElement('style')
  style.setAttribute('data-plugin', PACKAGE_NAME)
  style.setAttribute('data-plugin-css', `${PACKAGE_NAME}/styles.css`)
  style.textContent = text
  document.head.appendChild(style)
  return () => { style.remove() }
}
