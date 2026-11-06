// @vitest-environment jsdom
/**
 * The browser half through its real registration path: the built bundle is
 * loaded as the page loads it, `apply(ctx)` runs as cordis runs it, and the
 * assistant page renders with real React over fake host services.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { encode } from '../src/client/qr.tsx'
import type { PathOp } from '../src/client/host.ts'

type Component = (props: Record<string, unknown>) => React.ReactNode

/** A settings form whose snapshot changes on every mutation. */
function fakeForm(value: Record<string, unknown>) {
  let snapshot = { status: 'ready', value, writable: true, revision: 1 }
  const listeners = new Set<() => void>()
  const mutations: { ops: readonly PathOp[]; revision?: number }[] = []
  return {
    mutations,
    form: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      mutate: async (ops: readonly PathOp[], revision?: number) => {
        mutations.push({ ops, ...(revision === undefined ? {} : { revision }) })
        const next = { ...snapshot.value }
        for (const op of ops) if (op.op === 'set') next[op.path[0] as string] = op.value
        snapshot = { ...snapshot, value: next, revision: snapshot.revision + 1 }
        for (const listener of listeners) listener()
        return true
      },
    },
  }
}

/** One observable value. */
function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (next: T) => { value = next; for (const listener of listeners) listener() },
  }
}

/** Fake `ctx.sessions`: which sessions the host's conversation view retains. */
function fakeSessions() {
  const mainView = observable<Record<string, Record<string, number>>>({})
  return {
    mainView,
    show: (sessionId: string | undefined) => { mainView.set(sessionId === undefined ? {} : { [sessionId]: { mainView: 1 } }) },
    sessions: {
      retainInfo: (id: string) => ({ getSnapshot: () => ({ retainedBy: mainView.getSnapshot()[id] ?? {} }), subscribe: mainView.subscribe }),
    },
  }
}

/** Fake `ctx.uiWorkspace`. */
function fakeWorkspace(...folders: string[]) {
  const opened: string[] = []
  const archived: string[] = []
  const picked: string[] = [...folders]
  return {
    opened,
    archived,
    uiWorkspace: {
      pickDirectory: async (): Promise<string | null> => picked.shift() ?? null,
      archiveSession: async (id: string) => { archived.push(id) },
      openSession: (id: string) => { opened.push(id) },
    },
  }
}

function loadClient(form: ReturnType<typeof fakeForm>['form'], extra: Record<string, unknown> = {}) {
  const source = readFileSync(join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')
  let registration: { id: string; factory: (require: (request: string) => unknown) => Record<string, unknown> } | undefined
  new Function('window', source)({ __ModuleLoader__: { load: (value: never) => { registration = value } } })
  if (registration === undefined) throw new Error('the bundle did not register itself')
  const exports = registration.factory((request) => {
    if (request === 'react') return React
    if (request === 'react/jsx-runtime') return JsxRuntime
    if (request === 'react-dom') return ReactDom
    throw new Error(`no module ${request}`)
  })
  const registrations: Record<string, unknown>[] = []
  const services: Record<string, unknown> = {
    slots: {
      inject: (_name: string, callback: () => unknown) => callback(),
      register: (options: Record<string, unknown>, component: unknown) => {
        const entry = { ...options, component }
        registrations.push(entry)
        return () => { registrations.splice(registrations.indexOf(entry), 1) }
      },
    },
    locale: { register: () => () => undefined },
    configForms: { get: () => form },
    ...extra,
  }
  const ctx = {
    get: (name: string) => services[name],
    effect: (execute: () => unknown) => { execute() },
    inject: (deps: string[], callback: (scope: unknown) => void) => { if (deps.every(dep => services[dep] !== undefined)) callback(ctx) },
  }
  ;(exports.apply as (ctx: unknown) => void)(ctx)
  const find = (name: string, key: string) => registrations.find(entry => entry.name === name && (entry.key ?? entry.id) === key)?.component as Component
  return { registrations, find }
}

afterEach(() => { cleanup() })

describe('the browser half', () => {
  it('registers the assistant page, its sidebar row, and the settings page', () => {
    const { registrations } = loadClient(fakeForm({}).form)
    expect(registrations.filter(entry => entry.name !== 'tool.call.toolview').map(entry => `${String(entry.name)}:${String(entry.key ?? entry.id)}`).sort()).toEqual([
      'main:dsh-assisstant', 'plugins.bundle.config:@starsharryzhu/dsh-assistant', 'sidebar.panellist:dsh-assisstant',
    ])
  })

  it('asks to create an assistant while none exists, and cannot create one without a workspace folder', async () => {
    const { form, mutations } = fakeForm({ people: [] })
    const workspace = fakeWorkspace('/Users/x/记事')
    const { find } = loadClient(form, { uiWorkspace: workspace.uiWorkspace })
    const Page = find('main', 'dsh-assisstant')
    render(<Page />)
    expect(screen.getByText('创建一个助理')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('助理的名字'), { target: { value: ' 阿福 ' } })
    fireEvent.change(screen.getByLabelText('希望它怎么称呼你'), { target: { value: '妈妈' } })
    const create = screen.getByText('创建') as HTMLButtonElement
    expect(create.disabled).toBe(true)
    await act(async () => { fireEvent.submit(create.closest('form') as HTMLFormElement) })
    expect(mutations).toEqual([])
    expect(screen.getByText('还没有选。要先选一个文件夹才能创建。')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('选择文件夹…')) })
    expect(screen.getByText('/Users/x/记事')).toBeTruthy()
    expect(create.disabled).toBe(false)
    await act(async () => { fireEvent.click(create) })
    const people = (mutations[0]?.ops[0] as { op: string; value: { name: string; address?: string; cwd?: string }[] })
    expect(people.op).toBe('set')
    expect(people.value.map(({ name, address, cwd }) => ({ name, address, cwd }))).toEqual([{ name: '阿福', address: '妈妈', cwd: '/Users/x/记事' }])
  })

  it('keeps the folder required when the chooser is cancelled or fails, and refuses another assistant\'s folder', async () => {
    const { form } = fakeForm({ people: [{ id: 'a1', name: '阿福', cwd: '/w', sessionId: 's-a1' }] })
    const workspace = fakeWorkspace('/w')
    const pick = workspace.uiWorkspace.pickDirectory
    const fake = fakeSessions()
    const layout = { panelInfo: observable({ activePanelId: null }), selectPanel: () => undefined }
    const { find } = loadClient(form, { uiWorkspace: workspace.uiWorkspace, sessions: fake.sessions, layout })
    fake.show('s-a1')
    const Switcher = find('conversation.session.header.actions', 'dsh-assisstant-switcher')
    const switcher = render(<Switcher sessionId="s-a1" />)
    fireEvent.click(screen.getByLabelText('切换助理'))
    fireEvent.click(screen.getByText(/新建助理/u))
    switcher.unmount()
    const Page = find('main', 'dsh-assisstant')
    render(<Page />)
    fireEvent.change(screen.getByLabelText('助理的名字'), { target: { value: '小管家' } })
    const create = screen.getByText('创建') as HTMLButtonElement
    workspace.uiWorkspace.pickDirectory = async () => { throw new Error('denied') }
    await act(async () => { fireEvent.click(screen.getByText('选择文件夹…')) })
    expect(screen.getByText('没能打开文件夹选择框，请再试一次。')).toBeTruthy()
    expect(create.disabled).toBe(true)
    workspace.uiWorkspace.pickDirectory = pick
    await act(async () => { fireEvent.click(screen.getByText('选择文件夹…')) })
    expect(screen.getByText('这个文件夹已经是「阿福」的工作区了，请换一个。')).toBeTruthy()
    expect(create.disabled).toBe(true)
    await act(async () => { fireEvent.click(screen.getByText('选择文件夹…')) })
    expect(screen.getByText('/w')).toBeTruthy()
  })

  it('leaves the form of address out when it is empty', async () => {
    const { form, mutations } = fakeForm({ people: [] })
    const workspace = fakeWorkspace('/n')
    const { find } = loadClient(form, { uiWorkspace: workspace.uiWorkspace })
    const Page = find('main', 'dsh-assisstant')
    render(<Page />)
    fireEvent.change(screen.getByLabelText('助理的名字'), { target: { value: '阿福' } })
    await act(async () => { fireEvent.click(screen.getByText('选择文件夹…')) })
    await act(async () => { fireEvent.click(screen.getByText('创建')) })
    expect((mutations[0]?.ops[0] as { value: Record<string, unknown>[] }).value[0]).not.toHaveProperty('address')
  })

  it('opens the assistant last shown here when the sidebar row is clicked, else the first', async () => {
    localStorage.clear()
    const people = [{ id: 'a1', name: '阿福', cwd: '/w', sessionId: 's-a1' }, { id: 'a2', name: '小管家', cwd: '/n', sessionId: 's-a2' }]
    const { form } = fakeForm({ people })
    const workspace = fakeWorkspace()
    const fake = fakeSessions()
    const { find } = loadClient(form, { uiWorkspace: workspace.uiWorkspace, sessions: fake.sessions })
    const Page = find('main', 'dsh-assisstant')
    const first = render(<Page />)
    expect(workspace.opened).toEqual(['s-a1'])
    first.unmount()
    fake.show('s-a2')
    fake.show(undefined)
    render(<Page />)
    expect(workspace.opened).toEqual(['s-a1', 's-a2'])
  })

  it('opens a new assistant once its conversation exists, and offers to remove one that never gets one', async () => {
    const { form, mutations } = fakeForm({ people: [{ id: 'a1', name: '阿福', cwd: '/w' }] })
    const workspace = fakeWorkspace()
    const { find } = loadClient(form, { uiWorkspace: workspace.uiWorkspace })
    const Page = find('main', 'dsh-assisstant')
    render(<Page />)
    expect(workspace.opened).toEqual([])
    expect(screen.getByText('正在准备对话…')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('删除')) })
    expect((mutations.at(-1)?.ops[0] as { value: unknown[] }).value).toEqual([])
  })

  it('switches assistants and asks for a new one from the menu on the conversation\'s title', async () => {
    const { form } = fakeForm({ people: [{ id: 'a1', name: '阿福', cwd: '/w', sessionId: 's-a1' }, { id: 'a2', name: '小管家', cwd: '/n', sessionId: 's-a2' }, { id: 'a3', name: '新来的', cwd: '/m' }] })
    const workspace = fakeWorkspace()
    const fake = fakeSessions()
    const selected: (string | null)[] = []
    const layout = { panelInfo: observable({ activePanelId: null }), selectPanel: (id: string | null) => { selected.push(id) } }
    const { find, registrations } = loadClient(form, { uiWorkspace: workspace.uiWorkspace, sessions: fake.sessions, layout })
    const header = () => registrations.filter(entry => entry.name === 'conversation.session.header.actions')
    expect(header()).toEqual([])
    fake.show('s-a1')
    expect(header().map(entry => entry.order)).toEqual([-20])
    const Switcher = find('conversation.session.header.actions', 'dsh-assisstant-switcher')

    const other = render(<Switcher sessionId="s-other" />)
    expect(other.container.textContent).toBe('')
    other.unmount()

    render(<Switcher sessionId="s-a1" />)
    fireEvent.click(screen.getByLabelText('切换助理'))
    expect(screen.getByRole('menuitemradio', { name: /阿福/u }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('menuitemradio', { name: /新来的/u }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('menuitemradio', { name: /小管家/u }))
    expect(workspace.opened).toEqual(['s-a2'])
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByLabelText('切换助理'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByLabelText('切换助理'))
    fireEvent.click(screen.getByText(/新建助理/u))
    expect(selected).toEqual(['dsh-assisstant'])
    const Page = find('main', 'dsh-assisstant')
    render(<Page />)
    expect(screen.getByText('创建一个助理')).toBeTruthy()
  })

  it('saves an assistant\'s own settings on its entry, leaving out what stays at the default', async () => {
    const { form, mutations } = fakeForm({ people: [{ id: 'a1', name: '阿福', address: '妈妈', cwd: '/w', sessionId: 's-a1' }, { id: 'a2', name: '小管家', cwd: '/n', sessionId: 's-a2', settings: { watchdogStallMinutes: 5 } }] })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-a1')
    const Tab = find('conversation.view', 'dsh-assisstant-settings')
    render(<Tab sessionId="s-a1" />)
    expect(screen.queryByText('模型')).toBeNull()
    expect(screen.queryByText('余额提醒')).toBeNull()
    expect((screen.getByLabelText('多少分钟没有进展就自动停下') as HTMLInputElement).value).toBe('10')
    expect((screen.getByText('保存') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('多少分钟没有进展就自动停下'), { target: { value: '120' } })
    fireEvent.change(screen.getByLabelText('助理的名字'), { target: { value: '大福' } })
    fireEvent.change(screen.getByLabelText('希望它怎么称呼你'), { target: { value: '' } })
    await act(async () => { fireEvent.click(screen.getByText('保存')) })
    expect((mutations.at(-1)?.ops[0] as { value: unknown[] }).value).toEqual([
      { id: 'a1', name: '大福', cwd: '/w', sessionId: 's-a1', settings: { watchdogStallMinutes: 120 } },
      { id: 'a2', name: '小管家', cwd: '/n', sessionId: 's-a2', settings: { watchdogStallMinutes: 5 } },
    ])
  })

  it('deletes an assistant from its settings tab after an inline confirmation, and leaves its conversation', async () => {
    const { form, mutations } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }] })
    const workspace = fakeWorkspace()
    const selected: (string | null)[] = []
    const layout = { panelInfo: observable({ activePanelId: null }), selectPanel: (id: string | null) => { selected.push(id) } }
    const fake = fakeSessions()
    const { find } = loadClient(form, { layout, uiWorkspace: workspace.uiWorkspace, sessions: fake.sessions })
    fake.show('s-mom')
    const Tab = find('conversation.view', 'dsh-assisstant-settings')
    render(<Tab sessionId="s-mom" />)
    fireEvent.click(screen.getByText('删除这个助理'))
    expect(screen.getByText('删除助理「阿福」后，它的对话不再出现在菜单里，工作区里的文件会保留。确定删除吗？')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('删除')) })
    expect(workspace.archived).toEqual(['s-mom'])
    expect((mutations.at(-1)?.ops[0] as { value: unknown[] }).value).toEqual([])
    expect(selected.at(-1)).toBe('dsh-assisstant')
  })

  it('adds the IM and settings tabs and locks the pickers while the conversation view shows an assistant conversation', () => {
    const { form } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }] })
    const fake = fakeSessions()
    const { registrations } = loadClient(form, { sessions: fake.sessions })
    const views = () => registrations.filter(entry => entry.name === 'conversation.view').map(entry => entry.id)
    expect(views()).toEqual([])
    fake.show('s-other')
    expect(views()).toEqual([])
    expect(document.documentElement.hasAttribute('data-dsh-assisstant-session')).toBe(false)
    fake.show('s-mom')
    expect(views()).toEqual(['dsh-assisstant-im', 'dsh-assisstant-settings'])
    // Right after the host's Chat (0) and Trajectory (10), before plugin tabs such as Context (20).
    const orders = registrations.filter(entry => entry.name === 'conversation.view').map(entry => entry.order as number)
    expect(orders.every(order => order > 10 && order < 20)).toBe(true)
    expect(document.documentElement.getAttribute('data-dsh-assisstant-session')).toBe('s-mom')
    fake.show(undefined)
    expect(views()).toEqual([])
    expect(document.documentElement.hasAttribute('data-dsh-assisstant-session')).toBe(false)
  })

  it('shows the record tools\' calls under plain titles, and no other tool\'s', () => {
    const { registrations, find } = loadClient(fakeForm({}).form)
    expect(registrations.filter(entry => entry.name === 'tool.call.toolview').map(entry => entry.key)).toEqual([
      'calendar_add', 'calendar_update', 'list_update', 'memo_set', 'log_add', 'project_update', 'recall', 'profile_set', 'persona_set',
      'im_send', 'wake_after', 'wake_cancel', 'quiet_set', 'brief_set', 'temp_move',
    ])
    const Row = find('tool.call.toolview', 'calendar_add')
    const settled = render(<Row toolName="calendar_add" phase="result" block={{ kind: 'ok', call: { argsRaw: '{"title":"看牙医","kind":"日程"}' } }} />)
    expect(settled.container.textContent).toBe('记日程：看牙医')
    settled.unmount()
    const preparing = render(<Row toolName="calendar_add" phase="preparing" block={{ argsRaw: '{"title":"看' }} />)
    expect(preparing.container.textContent).toBe('记日程')
    preparing.unmount()
  })

  it('binds WeChat from the IM tab', async () => {
    const { form, mutations } = fakeForm({ people: [{ id: 'mom', name: '阿福', address: '妈妈', cwd: '/w', sessionId: 's-mom' }] })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-mom')
    const Im = find('conversation.view', 'dsh-assisstant-im')
    render(<Im sessionId="s-mom" />)
    expect(screen.getByText('未接入')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('接入微信')) })
    expect(mutations.at(-1)?.ops[0]).toMatchObject({ path: ['wechatRequest'], value: { personId: 'mom', action: 'bind' } })
    await act(async () => {
      await form.mutate([{ op: 'set', path: ['wechatState'], value: { mom: { status: 'qr', qr: 'https://ilinkai.weixin.qq.com/qr/abc', updatedAt: 1 } } }])
    })
    expect(screen.getByText('请用妈妈自己的微信扫一扫下面的二维码')).toBeTruthy()
  })

  it('shows a bound account\'s settings, keeps the fixed ones disabled, and sends option, diagnosis, and removal requests', async () => {
    const { form, mutations } = fakeForm({
      people: [{ id: 'mom', name: '阿福', cwd: '/Users/x/阿福', sessionId: 's-mom' }],
      wechatState: { mom: { status: 'bound', user: 'wx_abc***', connected: true, sendMode: 'queue', commands: true, updatedAt: 1,
        diagnosis: { ok: false, at: 2, checks: [{ label: '登录有效', ok: false, detail: '已过期' }] } } },
    })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-mom')
    const Im = find('conversation.view', 'dsh-assisstant-im')
    render(<Im sessionId="s-mom" />)
    expect(screen.getByText('已连接')).toBeTruthy()
    expect(screen.getByText('wx_abc***')).toBeTruthy()
    expect((screen.getByDisplayValue('工作区写入') as HTMLSelectElement).disabled).toBe(false)
    expect((screen.getByDisplayValue('关闭（保持原会话）') as HTMLSelectElement).disabled).toBe(true)
    for (const label of ['名称备注', '当前工作区', 'Agent 预设', '私聊准入']) expect(screen.queryByText(label)).toBeNull()
    expect(screen.getAllByDisplayValue('跟对话输入框的选择一致')).toHaveLength(2)
    expect(screen.getByText('✕ 登录有效：已过期')).toBeTruthy()

    await act(async () => { fireEvent.change(screen.getByDisplayValue('排队发送'), { target: { value: 'steer' } }) })
    expect(mutations.at(-1)?.ops[0]).toMatchObject({ value: { personId: 'mom', action: 'options', options: { sendMode: 'steer' } } })
    await act(async () => { fireEvent.change(screen.getByDisplayValue('可以执行命令'), { target: { value: 'off' } }) })
    expect(mutations.at(-1)?.ops[0]).toMatchObject({ value: { action: 'options', options: { commands: false } } })
    await act(async () => { fireEvent.click(screen.getByText('诊断连接')) })
    expect(mutations.at(-1)?.ops[0]).toMatchObject({ value: { action: 'diagnose' } })
    await act(async () => { fireEvent.click(screen.getByText('重新连接')) })
    expect(mutations.at(-1)?.ops[0]).toMatchObject({ value: { action: 'reconnect' } })
    fireEvent.click(screen.getByText('移除接入'))
    await act(async () => { fireEvent.click(screen.getAllByText('移除接入')[0] as HTMLElement) })
    expect(mutations.at(-1)?.ops[0]).toMatchObject({ value: { action: 'unbind' } })
  })

  it('changes the permission on the assistant, asking first for full access', async () => {
    const person = { id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }
    const { form, mutations } = fakeForm({
      people: [{ ...person, settings: { watchdogStallMinutes: 5 } }],
      wechatState: { mom: { status: 'bound', user: 'wx', updatedAt: 1 } },
    })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-mom')
    const Im = find('conversation.view', 'dsh-assisstant-im')
    render(<Im sessionId="s-mom" />)
    const before = mutations.length
    fireEvent.change(screen.getByDisplayValue('工作区写入'), { target: { value: 'danger-full-access' } })
    expect(screen.getByText(/确定开启吗/)).toBeTruthy()
    fireEvent.click(screen.getByText('取消'))
    expect(mutations).toHaveLength(before)
    fireEvent.change(screen.getByDisplayValue('工作区写入'), { target: { value: 'danger-full-access' } })
    await act(async () => { fireEvent.click(screen.getByText('开启完全访问')) })
    expect((mutations.at(-1)?.ops[0] as { value: unknown[] }).value).toEqual([{ ...person, settings: { watchdogStallMinutes: 5, sandboxMode: 'danger-full-access' } }])
    await act(async () => { fireEvent.change(screen.getByDisplayValue('完全访问'), { target: { value: 'workspace-write' } }) })
    expect((mutations.at(-1)?.ops[0] as { value: unknown[] }).value).toEqual([{ ...person, settings: { watchdogStallMinutes: 5 } }])
    await act(async () => { fireEvent.change(screen.getByDisplayValue('工作区写入'), { target: { value: 'read-only' } }) })
    expect((mutations.at(-1)?.ops[0] as { value: unknown[] }).value).toEqual([{ ...person, settings: { watchdogStallMinutes: 5, sandboxMode: 'read-only' } }])
  })

  it('shows the model picker once a conversation that was still binding is ready', async () => {
    const snapshot = { current: { provider: 'p', model: 'a' }, groups: [{ id: 'p', name: 'P', models: [{ id: 'a', name: 'A' }] }] }
    const directory = {
      store: { subscribe: () => () => undefined, getSnapshot: () => snapshot },
      load: async () => undefined,
      select: async () => ({ ok: true }),
    }
    let bound = false
    const { form } = fakeForm({
      people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }],
      wechatState: { mom: { status: 'bound', user: 'wx', updatedAt: 1 } },
    })
    const fake = fakeSessions()
    const directoryFor = () => {
      if (!bound) throw new Error('resolved no scope')
      return directory
    }
    const { find } = loadClient(form, { sessions: fake.sessions, modelDirectories: { directoryFor } })
    fake.show('s-mom')
    const Im = find('conversation.view', 'dsh-assisstant-im')
    render(<Im sessionId="s-mom" />)
    expect(screen.getAllByDisplayValue('跟对话输入框的选择一致')).toHaveLength(2)
    bound = true
    expect(await screen.findByDisplayValue('A')).toBeTruthy()
    expect(screen.queryByDisplayValue('跟对话输入框的选择一致')).toBeNull()
  })

  it('picks the model and effort through the directory the composer uses', async () => {
    const efforts = [{ id: 'low', name: '低' }, { id: 'high', name: '高' }]
    const groups = [{ id: 'p', name: 'P', models: [
      { id: 'a', name: 'A', reasoning: { efforts, defaultEffort: 'low' } },
      { id: 'b/x', name: 'B', reasoning: { efforts: [{ id: 'max', name: '最高' }], defaultEffort: 'max' } },
      { id: 'c', name: 'C' },
    ] }]
    let snapshot: { current: Record<string, string> | null; groups: typeof groups } = { current: { provider: 'p', model: 'a', reasoningEffort: 'low' }, groups }
    let listener = (): void => undefined
    let accept = true
    const selected: unknown[] = []
    const directory = {
      store: { subscribe: (next: () => void) => { listener = next; return () => undefined }, getSnapshot: () => snapshot },
      load: async () => undefined,
      select: async (selection: Record<string, string>) => {
        selected.push(selection)
        if (accept) {
          snapshot = { ...snapshot, current: selection }
          listener()
        }
        return { ok: accept }
      },
    }
    const { form } = fakeForm({
      people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }],
      wechatState: { mom: { status: 'bound', user: 'wx', updatedAt: 1 } },
    })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions, modelDirectories: { directoryFor: () => directory } })
    fake.show('s-mom')
    const Im = find('conversation.view', 'dsh-assisstant-im')
    render(<Im sessionId="s-mom" />)
    expect(screen.getByDisplayValue('A')).toBeTruthy()
    await act(async () => { fireEvent.change(screen.getByDisplayValue('低'), { target: { value: 'high' } }) })
    expect(selected.at(-1)).toEqual({ provider: 'p', model: 'a', reasoningEffort: 'high' })
    await act(async () => { fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'p/b/x' } }) })
    expect(selected.at(-1)).toEqual({ provider: 'p', model: 'b/x', reasoningEffort: 'max' })
    expect(screen.getByDisplayValue('最高')).toBeTruthy()
    await act(async () => { fireEvent.change(screen.getByDisplayValue('B'), { target: { value: 'p/c' } }) })
    expect(selected.at(-1)).toEqual({ provider: 'p', model: 'c' })
    expect((screen.getByDisplayValue('这个模型没有推理等级') as HTMLSelectElement).disabled).toBe(true)
    accept = false
    await act(async () => { fireEvent.change(screen.getByDisplayValue('C'), { target: { value: 'p/a' } }) })
    expect(screen.getByText('没有改成，请再试一次。')).toBeTruthy()
  })

  it('lets a number be emptied and retyped, and corrects it when the field is left', async () => {
    const { form, mutations } = fakeForm({ compactRatio: 0.75, balanceCheckMinutes: 30, balanceThreshold: 10 })
    const { find } = loadClient(form)
    const Settings = find('plugins.bundle.config', '@starsharryzhu/dsh-assistant')
    render(<div><Settings view="page" /></div>)
    const minutes = screen.getByLabelText('每隔几分钟查一次余额') as HTMLInputElement
    fireEvent.focus(minutes)
    fireEvent.change(minutes, { target: { value: '' } })
    expect(minutes.value).toBe('')
    fireEvent.change(minutes, { target: { value: '4' } })
    expect(minutes.value).toBe('4')
    fireEvent.change(minutes, { target: { value: '45' } })
    expect(minutes.value).toBe('45')
    fireEvent.blur(minutes)
    expect(minutes.value).toBe('45')

    fireEvent.focus(minutes)
    fireEvent.change(minutes, { target: { value: '' } })
    fireEvent.blur(minutes)
    expect(minutes.value).toBe('45')

    fireEvent.focus(minutes)
    fireEvent.change(minutes, { target: { value: '999999' } })
    fireEvent.blur(minutes)
    expect(minutes.value).toBe('10080')

    fireEvent.focus(minutes)
    fireEvent.change(minutes, { target: { value: '2.6' } })
    fireEvent.keyDown(minutes, { key: 'Enter' })
    fireEvent.blur(minutes)
    expect(minutes.value).toBe('3')

    const ratio = screen.getByLabelText('上下文达到多少时自动整理（%）') as HTMLInputElement
    fireEvent.focus(ratio)
    fireEvent.change(ratio, { target: { value: '5' } })
    expect(ratio.value).toBe('5')
    fireEvent.blur(ratio)
    expect(ratio.value).toBe('30')

    const threshold = screen.getByLabelText('余额低于多少元时提醒') as HTMLInputElement
    fireEvent.focus(threshold)
    fireEvent.change(threshold, { target: { value: '9.5' } })
    fireEvent.blur(threshold)
    expect(threshold.value).toBe('9.5')

    // Typing a value and going straight to save stores the corrected value.
    fireEvent.focus(minutes)
    fireEvent.change(minutes, { target: { value: '0' } })
    await act(async () => { fireEvent.click(screen.getByText('保存')) })
    expect(mutations.at(-1)?.ops).toEqual(expect.arrayContaining([
      { op: 'set', path: ['balanceCheckMinutes'], value: 1 },
      { op: 'set', path: ['compactRatio'], value: 0.3 },
      { op: 'set', path: ['balanceThreshold'], value: 9.5 },
    ]))
  })

  it('opens the shared settings from an assistant\'s settings tab, between saving and deleting', () => {
    const opened: string[] = []
    const { form } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }] })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions, pluginNavigation: { openBundle: (name: string) => { opened.push(name) } } })
    fake.show('s-mom')
    const View = find('conversation.view', 'dsh-assisstant-settings')
    render(<View sessionId="s-mom" />)
    const buttons = screen.getAllByRole('button').map(button => button.textContent)
    expect(buttons.slice(buttons.indexOf('保存'), buttons.indexOf('保存') + 3)).toEqual(['保存', '通用设置', '删除这个助理'])
    fireEvent.click(screen.getByText('通用设置'))
    expect(opened).toEqual(['@starsharryzhu/dsh-assistant'])
  })

  it('leaves the shared settings button out on a host without plugin navigation', () => {
    const { form } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }] })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-mom')
    const View = find('conversation.view', 'dsh-assisstant-settings')
    render(<View sessionId="s-mom" />)
    expect(screen.queryByText('通用设置')).toBeNull()
  })

  it('corrects a daily brief time and keeps empty as off', () => {
    const { form } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }] })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-mom')
    const View = find('conversation.view', 'dsh-assisstant-settings')
    render(<View sessionId="s-mom" />)
    const time = screen.getByLabelText('早上提示时间（如 08:00，留空关闭）') as HTMLInputElement
    for (const [typed, shown] of [['8', '08:00'], ['7:30', '07:30'], ['0915', '09:15'], ['25:00', '09:15'], ['早上', '09:15'], ['', '']] as const) {
      fireEvent.focus(time)
      fireEvent.change(time, { target: { value: typed } })
      expect(time.value).toBe(typed)
      fireEvent.blur(time)
      expect(time.value).toBe(shown)
    }
  })

  it('edits the heartbeat and quiet hours, with 0 as off and bounds on the rest', () => {
    const { form } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }] })
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-mom')
    const View = find('conversation.view', 'dsh-assisstant-settings')
    render(<View sessionId="s-mom" />)
    const beat = screen.getByLabelText('每隔几分钟唤醒一次助理（0 表示关闭）') as HTMLInputElement
    expect(beat.value).toBe('60')
    for (const [typed, shown] of [['0', '0'], ['3', '5'], ['99999', '1440'], ['30', '30']] as const) {
      fireEvent.focus(beat)
      fireEvent.change(beat, { target: { value: typed } })
      fireEvent.blur(beat)
      expect(beat.value).toBe(shown)
    }
    expect((screen.getByLabelText('没有到期的事时也唤醒模型（更主动，也更费钱）') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('勿扰开始（如 22:00，留空关闭）') as HTMLInputElement).value).toBe('22:00')
    expect((screen.getByLabelText('勿扰结束（如 08:00）') as HTMLInputElement).value).toBe('08:00')
    expect(screen.queryByText('取消临时勿扰')).toBeNull()
  })

  it('shows temporary quiet hours while they last, keeps them on saving, and can end them', async () => {
    const until = Date.now() + 3_600_000
    const { form } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom', settings: { tempQuietFrom: 1, tempQuietUntil: until } }] })
    const value = () => form.getSnapshot().value as Record<string, unknown>
    const fake = fakeSessions()
    const { find } = loadClient(form, { sessions: fake.sessions })
    fake.show('s-mom')
    const View = find('conversation.view', 'dsh-assisstant-settings')
    render(<View sessionId="s-mom" />)
    expect(screen.getByText(/临时勿扰到/u)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('希望它怎么称呼你'), { target: { value: '妈' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => { expect((value().people as { address?: string }[])[0]?.address).toBe('妈') })
    expect((value().people as { settings?: unknown }[])[0]?.settings).toEqual({ tempQuietFrom: 1, tempQuietUntil: until })
    fireEvent.click(await screen.findByText('取消临时勿扰'))
    await waitFor(() => { expect((value().people as { settings?: unknown }[])[0]?.settings).toBeUndefined() })
  })

  it('asks where the user is when creating an assistant, and may be left empty', async () => {
    const { form } = fakeForm({ people: [] })
    const value = () => form.getSnapshot().value as Record<string, unknown>
    const workspace = fakeWorkspace('/w/a', '/w/b')
    const { find } = loadClient(form, { uiWorkspace: workspace.uiWorkspace })
    const Page = find('main', 'dsh-assisstant')
    render(<Page />)
    fireEvent.change(screen.getByLabelText('助理的名字'), { target: { value: '阿福' } })
    fireEvent.change(screen.getByLabelText('你在哪里'), { target: { value: ' 上海 ' } })
    fireEvent.click(screen.getByText('选择文件夹…'))
    await screen.findByText('/w/a')
    fireEvent.click(screen.getByText('创建'))
    await waitFor(() => { expect((value().people as { zoneHint?: string }[])[0]?.zoneHint).toBe('上海') })
  })

  it('leaves assistant conversations out of the session lists the sidebar reads, and whole for opening', () => {
    const { form } = fakeForm({ people: [{ id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom' }] })
    const fake = fakeSessions()
    const row = { retainedBy: {} }
    const raw = { ids: ['s-mom', 's-other', 's-old'], byId: { 's-mom': row, 's-other': row, 's-old': { ...row, projectionValues: { agentPreset: 'dsh-assisstant' } } } }
    const list = { getSnapshot: () => raw, set: () => undefined }
    const workspaces = { getSnapshot: () => ({ items: [{ sessionIds: ['s-mom', 's-other'] }] }) }
    loadClient(form, { sessions: { ...fake.sessions, list }, workspaces: { list: workspaces } })
    expect(list.getSnapshot().ids).toEqual(['s-other'])
    expect(Object.keys(list.getSnapshot().byId)).toEqual(['s-mom', 's-other', 's-old'])
    expect(workspaces.getSnapshot().items[0]?.sessionIds).toEqual(['s-other'])
  })

  it('draws the settings summary', () => {
    const { form } = fakeForm({ compactRatio: 0.75 })
    const { find } = loadClient(form)
    const Settings = find('plugins.bundle.config', '@starsharryzhu/dsh-assistant')
    render(<div><Settings view="summary" /></div>)
    expect(screen.getByText('上下文达到 75% 自动整理')).toBeTruthy()
  })

  it('keeps only the shared settings on the Plugins screen', () => {
    const { form } = fakeForm({ people: [] })
    const { find } = loadClient(form)
    const Settings = find('plugins.bundle.config', '@starsharryzhu/dsh-assistant')
    render(<div><Settings view="page" /></div>)
    for (const title of ['模型', '自动整理对话', '余额提醒', '人设与画像']) expect(screen.getByText(title)).toBeTruthy()
    for (const title of ['工作区', '日程与主动提醒', '看门狗', '微信', '对话用的模型']) expect(screen.queryByText(title)).toBeNull()
  })

  it('chooses several worker models, with no way to run none', async () => {
    const { form, mutations } = fakeForm({})
    const catalog = { groups: [{ id: 'deepseek-account', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'Flash' }, { id: 'deepseek-pro', name: 'Pro' }] }] }
    const remote = { session: { modelCatalog: async () => ({ ok: true, value: catalog }) } }
    const { find } = loadClient(form, { remote, 'remote.session': remote.session })
    const Settings = find('plugins.bundle.config', '@starsharryzhu/dsh-assistant')
    render(<div><Settings view="page" /></div>)
    await screen.findByText('Flash')
    expect(screen.getByText('worker模型选择')).toBeTruthy()
    expect(screen.queryByText('与对话相同')).toBeNull()
    expect(screen.queryByText('对话用的模型')).toBeNull()
    fireEvent.click(screen.getByLabelText('worker模型选择'))
    const flash = screen.getByRole('menuitemcheckbox', { name: 'Flash' }).querySelector('input') as HTMLInputElement
    const pro = screen.getByRole('menuitemcheckbox', { name: 'Pro' }).querySelector('input') as HTMLInputElement
    expect(flash.checked).toBe(true)
    expect(flash.disabled).toBe(true)
    fireEvent.click(pro)
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(flash.disabled).toBe(false)
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => { expect(mutations).toHaveLength(1) })
    expect(mutations[0]?.ops).toEqual([{ op: 'set', path: ['workerModels'], value: [
      { provider: 'deepseek-account', model: 'deepseek-flash' }, { provider: 'deepseek-account', model: 'deepseek-pro' },
    ] }])
  })

  it('encodes a QR code', () => {
    const encoded = encode('https://ilinkai.weixin.qq.com/qr/abc')
    expect(encoded?.size).toBeGreaterThanOrEqual(21)
    expect(encoded?.cells.length).toBeGreaterThan(50)
  })
})
