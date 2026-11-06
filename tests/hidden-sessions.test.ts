import { describe, expect, it } from 'vitest'
import { hideSessionRows, hideWorkspaceMembers } from '../src/client/hidden-sessions.ts'
import type { SessionListLike, SnapshotStoreLike, WorkspaceListLike } from '../src/client/hidden-sessions.ts'

/** A store like the host's, with `set` and a list of who was told. */
function store(initial: SessionListLike) {
  let snapshot = initial
  let told = 0
  const list: SnapshotStoreLike<SessionListLike> = {
    getSnapshot: () => snapshot,
    set: (next) => {
      snapshot = next
      told += 1
    },
  }
  return { list, told: () => told, put: (next: SessionListLike) => { snapshot = next } }
}

const row = {}
const presets = ['hidden-preset']

describe('assistant conversations in the session list', () => {
  it('are left out of the ids and kept in byId', () => {
    const { list } = store({ ids: ['mine', 'other'], byId: { mine: row, other: row } })
    hideSessionRows(list, { ids: () => new Set(['mine']), presets })
    expect(list.getSnapshot().ids).toEqual(['other'])
    expect(Object.keys(list.getSnapshot().byId)).toEqual(['mine', 'other'])
  })

  it('are told by their preset too, before the list has them or after it dropped them', () => {
    const { list } = store({ ids: ['a', 'b'], byId: { a: { projectionValues: { agentPreset: 'hidden-preset' } }, b: { projectionValues: { agentPreset: 'standard' } } } })
    hideSessionRows(list, { ids: () => new Set(), presets })
    expect(list.getSnapshot().ids).toEqual(['b'])
  })

  it('leave a list with none of them as the very same object, and answer stably', () => {
    const raw = { ids: ['other'], byId: { other: row } }
    const { list, put } = store(raw)
    hideSessionRows(list, { ids: () => new Set(['mine']), presets })
    expect(list.getSnapshot()).toBe(raw)
    const withMine = { ids: ['mine', 'other'], byId: { mine: row, other: row } }
    put(withMine)
    const first = list.getSnapshot()
    expect(list.getSnapshot()).toBe(first)
  })

  it('follow the assistant list, and tell the sidebar', () => {
    let ids = new Set<string>()
    const { list, told } = store({ ids: ['mine', 'other'], byId: { mine: row, other: row } })
    const hidden = hideSessionRows(list, { ids: () => ids, presets })
    expect(list.getSnapshot().ids).toEqual(['mine', 'other'])
    ids = new Set(['mine'])
    hidden.refresh()
    expect(told()).toBe(1)
    expect(list.getSnapshot().ids).toEqual(['other'])
    ids = new Set()
    hidden.refresh()
    expect(list.getSnapshot().ids).toEqual(['mine', 'other'])
  })

  it('come back when undone', () => {
    const raw = { ids: ['mine'], byId: { mine: row } }
    const { list } = store(raw)
    const hidden = hideSessionRows(list, { ids: () => new Set(['mine']), presets })
    expect(list.getSnapshot().ids).toEqual([])
    hidden.restore()
    expect(list.getSnapshot()).toBe(raw)
  })
})

describe('assistant conversations in a workspace', () => {
  /** A store whose `getSnapshot` is on the prototype, as the host's workspace model has it. */
  class Model implements SnapshotStoreLike<WorkspaceListLike> {
    constructor(readonly value: WorkspaceListLike) {}
    getSnapshot(): WorkspaceListLike { return this.value }
  }

  it('are left out of its members, and come back when undone', () => {
    const value = { items: [{ sessionIds: ['mine', 'other'] }, { sessionIds: ['other2'] }] }
    const model = new Model(value)
    const restore = hideWorkspaceMembers(model, { hidden: id => id === 'mine', version: () => 'v' })
    expect(model.getSnapshot().items.map(item => item.sessionIds)).toEqual([['other'], ['other2']])
    expect(model.getSnapshot()).toBe(model.getSnapshot())
    restore()
    expect(model.getSnapshot()).toBe(value)
  })

  it('leave a workspace with none of them as it was', () => {
    const value = { items: [{ sessionIds: ['other'] }] }
    const model = new Model(value)
    hideWorkspaceMembers(model, { hidden: () => false, version: () => 'v' })
    expect(model.getSnapshot()).toBe(value)
  })
})
