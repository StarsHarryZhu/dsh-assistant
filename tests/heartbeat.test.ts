import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Heartbeat, clearAutomationTasks, heartbeatText } from '../src/host/heartbeat.ts'
import type { AssistantSettings, Person } from '../src/shared/settings.ts'

const ZONE = 'Asia/Shanghai'
/** An instant by its Shanghai wall clock. */
const at = (text: string): number => Date.parse(`${text}:00+08:00`)
const MINUTE = 60_000

/** A heartbeat over fake services, ticked by hand. */
function setup(settings: Partial<AssistantSettings> = {}, options: { now?: string; directory?: string; file?: string } = {}) {
  const person: Person = { id: 'mom', name: '阿福', cwd: '/w', sessionId: 's-mom', settings }
  const world = {
    now: at(options.now ?? '2026-11-05T12:00'),
    file: options.file,
    running: false,
    chat: false,
    people: [person],
    notes: [] as string[],
    sent: [] as string[],
    warnings: [] as string[],
    canSend: true,
  }
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), 'dsa-heartbeat-'))
  const make = () => new Heartbeat({
    now: () => world.now,
    people: () => world.people,
    zoneFor: () => ZONE,
    read: path => (path === '/w/ddl.md' ? world.file : undefined),
    running: () => world.running,
    chatConnected: () => world.chat,
    sendNote: (_sessionId, text) => { world.notes.push(text) },
    sendHeld: (_person, text) => {
      world.sent.push(text)
      return world.canSend
    },
    warn: (message) => { world.warnings.push(message) },
    directory,
  })
  const beat = make()
  /** Tick every minute up to a wall-clock time. */
  const until = (text: string, instance = beat) => {
    const end = at(text)
    while (world.now < end) {
      world.now += MINUTE
      instance.tick()
    }
  }
  beat.tick()
  return { world, beat, make, until, directory, person }
}

/** One timed item, in `ddl.md`'s format. */
const item = (when: string, title: string) => `- [ ] ${new Date(at(when)).toISOString().slice(0, 16)}Z · 日程 · ${title}\n`

describe('starting up', () => {
  it('owes nothing for the time before it, whatever the hour', () => {
    const { world, beat } = setup({}, { now: '2026-11-05T15:00' })
    expect(world.notes).toEqual([])
    world.now += MINUTE
    beat.tick()
    expect(world.notes).toEqual([])
  })

  it('skips an assistant with no conversation or folder yet', () => {
    const { world, beat } = setup()
    world.people = [{ id: 'new', name: '新' }, { id: 'nofolder', name: '无', sessionId: 's' }]
    world.now += 120 * MINUTE
    expect(beat.tick()).toEqual([])
  })
})

describe('the daily brief', () => {
  it('comes once a day at its time, even when today is free', () => {
    const { world, until } = setup({ heartbeatMinutes: 0, quietStart: '', quietEnd: '' }, { now: '2026-11-05T07:00' })
    until('2026-11-05T07:59')
    expect(world.notes).toEqual([])
    until('2026-11-05T08:00')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('nothing is planned for today')
    until('2026-11-05T23:00')
    expect(world.notes).toHaveLength(1)
    until('2026-11-06T08:00')
    expect(world.notes).toHaveLength(2)
  })

  it('lists today\'s plans, and leaves out what repeats every day', () => {
    const file = `${item('2026-11-05T14:30', '看牙医')}${item('2026-11-07T10:00', '远的')}- 每天 21:00 · 日程 · 吃药\n`
    const { world, until } = setup({ heartbeatMinutes: 0, quietStart: '', quietEnd: '', reminderLeadMinutes: 0 }, { now: '2026-11-05T07:00', file })
    until('2026-11-05T08:00')
    expect(world.notes[0]).toContain('Daily brief')
    expect(world.notes[0]).toContain('14:30 看牙医')
    expect(world.notes[0]).not.toContain('远的')
    expect(world.notes[0]).not.toContain('吃药')
  })

  it('stays off when its time is empty or malformed', () => {
    for (const dailyBriefTime of ['', '8点', '25:00']) {
      const { world, until } = setup({ heartbeatMinutes: 0, quietStart: '', quietEnd: '', dailyBriefTime }, { now: '2026-11-05T07:00' })
      until('2026-11-05T12:00')
      expect(world.notes).toEqual([])
    }
  })

  it('catches up when the computer was off, and does not repeat after a restart', () => {
    const { world, make, directory } = setup({ heartbeatMinutes: 0, quietStart: '', quietEnd: '' }, { now: '2026-11-04T20:00' })
    world.now = at('2026-11-05T10:30')
    const later = make()
    later.tick()
    expect(world.notes).toHaveLength(1)
    world.now += MINUTE
    make().tick()
    expect(world.notes).toHaveLength(1)
    expect(existsSync(join(directory, 'mom.json'))).toBe(true)
  })
})

describe('reminders', () => {
  const quietFree = { heartbeatMinutes: 0, quietStart: '', quietEnd: '', dailyBriefTime: '' }

  it('come at the lead time, once, naming the item', () => {
    const { world, until } = setup(quietFree, { file: item('2026-11-05T14:30', '看牙医') })
    until('2026-11-05T13:59')
    expect(world.notes).toEqual([])
    until('2026-11-05T14:00')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('Reminders due now')
    expect(world.notes[0]).toContain('11/05 周四 14:30 · 日程 · 看牙医')
    until('2026-11-05T16:00')
    expect(world.notes).toHaveLength(1)
  })

  it('use each assistant\'s own lead', () => {
    const { world, until } = setup({ ...quietFree, reminderLeadMinutes: 5 }, { file: item('2026-11-05T14:30', '看牙医') })
    until('2026-11-05T14:24')
    expect(world.notes).toEqual([])
    until('2026-11-05T14:25')
    expect(world.notes).toHaveLength(1)
  })

  it('follow the file: a moved item at its new time, a cancelled or done one never', () => {
    const { world, until } = setup(quietFree, { file: item('2026-11-05T14:30', '看牙医') })
    until('2026-11-05T13:00')
    world.file = item('2026-11-05T17:00', '看牙医')
    until('2026-11-05T14:30')
    expect(world.notes).toEqual([])
    until('2026-11-05T16:30')
    expect(world.notes).toHaveLength(1)
    world.notes.length = 0
    world.file = item('2026-11-05T19:00', '开会')
    until('2026-11-05T18:00')
    world.file = ''
    until('2026-11-05T19:00')
    expect(world.notes).toEqual([])
    world.file = item('2026-11-05T21:00', '做完的').replace('[ ]', '[x]')
    until('2026-11-05T21:00')
    expect(world.notes).toEqual([])
  })

  it('skip an item that asked for none, and one with no clock time', () => {
    const file = `${item('2026-11-05T14:30', '开会（不提醒）')}- [ ] ${new Date(at('2026-11-05T23:59')).toISOString().slice(0, 16)}Z · DDL · 交作业\n- [ ] 无日期 · DDL · 买眼镜\n`
    const { world, until } = setup(quietFree, { file })
    until('2026-11-05T23:59')
    expect(world.notes).toEqual([])
  })

  it('give nothing for an item added too late for its lead', () => {
    const { world, until } = setup(quietFree)
    until('2026-11-05T14:10')
    world.file = item('2026-11-05T14:30', '马上开会')
    until('2026-11-05T15:00')
    expect(world.notes).toEqual([])
  })

  it('come for each time an item repeats', () => {
    const { world, until } = setup(quietFree, { file: '- 每天 19:00 · 日程 · 吃药\n' })
    until('2026-11-05T18:30')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('11/05 周四 19:00 · 日程 · 吃药')
    until('2026-11-06T18:30')
    expect(world.notes).toHaveLength(2)
    expect(world.notes[1]).toContain('11/06 周五 19:00')
  })

  it('catch up after the computer slept, while the event is still ahead', () => {
    const { world, beat } = setup(quietFree, { file: `${item('2026-11-05T14:30', '还来得及')}${item('2026-11-05T13:00', '已经过了')}` })
    world.now = at('2026-11-05T14:10')
    beat.tick()
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('还来得及')
    expect(world.notes[0]).not.toContain('已经过了')
  })

  it('wait for a running turn, and then come', () => {
    const { world, until } = setup(quietFree, { file: item('2026-11-05T14:30', '看牙医') })
    until('2026-11-05T13:59')
    world.running = true
    until('2026-11-05T14:05')
    expect(world.notes).toEqual([])
    world.running = false
    until('2026-11-05T14:06')
    expect(world.notes).toHaveLength(1)
  })
})

describe('quiet hours', () => {
  const quiet = { heartbeatMinutes: 60, dailyBriefTime: '', heartbeatIdleWake: true }

  it('stop heartbeats, which resume when they end', () => {
    const { world, until } = setup(quiet, { now: '2026-11-05T21:30' })
    until('2026-11-05T22:30')
    const before = world.notes.length
    until('2026-11-06T07:59')
    expect(world.notes).toHaveLength(before)
    until('2026-11-06T08:00')
    expect(world.notes).toHaveLength(before + 1)
  })

  it('move a reminder of an event ahead of their end to their end', () => {
    const { world, until } = setup({ ...quiet, heartbeatMinutes: 0 }, { now: '2026-11-05T21:00', file: item('2026-11-06T08:15', '早会') })
    until('2026-11-06T07:59')
    expect(world.notes).toEqual([])
    until('2026-11-06T08:00')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('早会')
  })

  it('move a reminder of an event inside them to the evening before', () => {
    const { world, until } = setup({ ...quiet, heartbeatMinutes: 0 }, { now: '2026-11-05T21:00', file: item('2026-11-06T06:00', '赶早班') })
    until('2026-11-05T21:58')
    expect(world.notes).toEqual([])
    until('2026-11-05T21:59')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('11/06 周五 06:00 · 日程 · 赶早班')
    until('2026-11-06T10:00')
    expect(world.notes).toHaveLength(1)
  })

  it('give nothing for an event inside them added too late to move', () => {
    const { world, until } = setup({ ...quiet, heartbeatMinutes: 0 }, { now: '2026-11-05T22:30' })
    world.file = item('2026-11-06T01:00', '半夜的事')
    until('2026-11-06T10:00')
    expect(world.notes).toEqual([])
  })

  it('hold the daily brief until they end', () => {
    const { world, until } = setup({ ...quiet, heartbeatMinutes: 0, dailyBriefTime: '07:00' }, { now: '2026-11-05T21:00' })
    until('2026-11-06T07:59')
    expect(world.notes).toEqual([])
    until('2026-11-06T08:00')
    expect(world.notes[0]).toContain('Daily brief')
  })

  it('hold a wake-up until they end, unless the user asked for that moment', () => {
    const { world, beat, until } = setup({ ...quiet, heartbeatMinutes: 0 }, { now: '2026-11-05T23:00' })
    beat.addWake('mom', { at: at('2026-11-06T02:00'), reason: '查一下', throughQuiet: false })
    beat.addWake('mom', { at: at('2026-11-06T03:00'), reason: '叫他赶飞机', throughQuiet: true })
    until('2026-11-06T02:59')
    expect(world.notes).toEqual([])
    until('2026-11-06T03:00')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('叫他赶飞机')
    expect(world.notes[0]).toContain('during their quiet hours')
    expect(world.notes[0]).not.toContain('查一下')
    until('2026-11-06T08:00')
    expect(world.notes[1]).toContain('查一下')
    expect(beat.wakes('mom')).toEqual([])
  })

  it('hold chat messages and send them at their end, without the model', () => {
    const { world, beat, until } = setup({ ...quiet, heartbeatMinutes: 0 }, { now: '2026-11-05T23:00' })
    beat.hold('mom', '任务做完了')
    until('2026-11-06T07:59')
    expect(world.sent).toEqual([])
    until('2026-11-06T08:00')
    expect(world.sent).toEqual(['任务做完了'])
    expect(world.notes).toEqual([])
    until('2026-11-06T09:00')
    expect(world.sent).toEqual(['任务做完了'])
  })

  it('drop with a log line a held message that can no longer go out', () => {
    const { world, beat, until } = setup({ ...quiet, heartbeatMinutes: 0 }, { now: '2026-11-05T23:00' })
    world.canSend = false
    beat.hold('mom', '发不出去')
    until('2026-11-06T08:00')
    expect(world.warnings.join()).toContain('could not go out')
    world.warnings.length = 0
    until('2026-11-06T09:00')
    expect(world.warnings).toEqual([])
  })

  it('include temporary ones', () => {
    const { world, until } = setup({ ...quiet, quietStart: '', quietEnd: '', tempQuietFrom: at('2026-11-05T13:00'), tempQuietUntil: at('2026-11-05T15:00') })
    until('2026-11-05T13:00')
    const before = world.notes.length
    until('2026-11-05T14:59')
    expect(world.notes).toHaveLength(before)
    until('2026-11-05T15:00')
    expect(world.notes).toHaveLength(before + 1)
  })
})

describe('the heartbeat itself', () => {
  const plain = { quietStart: '', quietEnd: '', dailyBriefTime: '' }

  it('wakes the model at its interval, saying nothing is due', () => {
    const { world, until } = setup({ ...plain, heartbeatMinutes: 30 })
    until('2026-11-05T12:29')
    expect(world.notes).toEqual([])
    until('2026-11-05T12:30')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toMatch(/^\[assistant-system\] Heartbeat\./u)
    expect(world.notes[0]).toContain('Nothing is due')
    expect(world.notes[0]).toContain('without any text')
    until('2026-11-05T13:00')
    expect(world.notes).toHaveLength(2)
  })

  it('reaches the model with nothing due only while the setting is on', () => {
    const { world, until } = setup({ ...plain, heartbeatMinutes: 30, heartbeatIdleWake: false }, { file: item('2026-11-05T14:30', '看牙医') })
    until('2026-11-05T13:59')
    expect(world.notes).toEqual([])
    until('2026-11-05T14:00')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).not.toContain('Nothing is due')
  })

  it('is off at 0, while other reasons still wake', () => {
    const { world, beat, until } = setup({ ...plain, heartbeatMinutes: 0 })
    beat.addWake('mom', { at: at('2026-11-05T15:00'), reason: '回头看看', throughQuiet: false })
    until('2026-11-05T14:59')
    expect(world.notes).toEqual([])
    until('2026-11-05T15:00')
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('Heartbeats are off.')
  })

  it('merges what is due in one minute into one note, and counts as the heartbeat', () => {
    const { world, beat, until } = setup({ ...plain, heartbeatMinutes: 60, dailyBriefTime: '13:00' }, { file: item('2026-11-05T13:30', '看牙医') })
    beat.addWake('mom', { at: at('2026-11-05T13:00'), reason: '回头看看', throughQuiet: false })
    until('2026-11-05T13:00')
    const merged = world.notes.at(-1) as string
    expect(world.notes.filter(note => note.includes('Daily brief'))).toHaveLength(1)
    expect(merged).toContain('Daily brief')
    expect(merged).toContain('Reminders due now')
    expect(merged).toContain('回头看看')
    expect(merged).not.toContain('Nothing is due')
  })

  it('tells how to reach the user, by whether a chat app is connected', () => {
    const { world, until } = setup({ ...plain, heartbeatMinutes: 30 })
    until('2026-11-05T12:30')
    expect(world.notes[0]).toContain('Write what they must see as your reply')
    world.chat = true
    until('2026-11-05T13:00')
    expect(world.notes[1]).toContain('goes out with `im_send`')
  })

  it('says when the next one comes, past quiet hours', () => {
    const text = heartbeatText({ now: at('2026-11-05T21:30'), zone: ZONE, nextBeat: at('2026-11-06T08:00'), reminders: [], wakes: [], chat: false, inQuiet: false })
    expect(text).toContain('Local time 2026-11-05 周四 21:30 (Asia/Shanghai)')
    expect(text).toContain('Next heartbeat around 11/06 周五 08:00')
  })
})

describe('wake-ups', () => {
  it('survive a restart, and can be cancelled by words in their reason', () => {
    const { world, beat, make, until } = setup({ heartbeatMinutes: 0, dailyBriefTime: '', quietStart: '', quietEnd: '' })
    beat.addWake('mom', { at: at('2026-11-05T15:00'), reason: '查快递', throughQuiet: false })
    beat.addWake('mom', { at: at('2026-11-05T14:00'), reason: '问问结果', throughQuiet: false })
    const after = make()
    expect(after.wakes('mom').map(wake => wake.reason)).toEqual(['问问结果', '查快递'])
    expect(after.cancelWakes('mom', '没有这个')).toEqual([])
    expect(after.cancelWakes('mom', '快递').map(wake => wake.reason)).toEqual(['查快递'])
    until('2026-11-05T16:00', after)
    expect(world.notes).toHaveLength(1)
    expect(world.notes[0]).toContain('问问结果')
  })

  it('are limited in number', () => {
    const { beat } = setup()
    for (let index = 0; index < 50; index += 1) expect(beat.addWake('mom', { at: at('2026-11-06T15:00'), reason: `r${index}`, throughQuiet: false })).toBeDefined()
    expect(beat.addWake('mom', { at: at('2026-11-06T15:00'), reason: 'one more', throughQuiet: false })).toBeUndefined()
  })
})

describe('the state file', () => {
  it('is forgotten with the assistant', () => {
    const { beat, directory } = setup()
    expect(existsSync(join(directory, 'mom.json'))).toBe(true)
    beat.forget('mom')
    expect(existsSync(join(directory, 'mom.json'))).toBe(false)
  })

  it('forgets given reminders once their events are long past', () => {
    const { world, until, directory } = setup({ heartbeatMinutes: 0, dailyBriefTime: '', quietStart: '', quietEnd: '' }, { file: item('2026-11-05T14:30', '看牙医') })
    until('2026-11-05T14:00')
    expect(Object.keys(JSON.parse(readFileSync(join(directory, 'mom.json'), 'utf8')).reminded)).toHaveLength(1)
    world.file = ''
    until('2026-11-06T20:00')
    expect(JSON.parse(readFileSync(join(directory, 'mom.json'), 'utf8')).reminded).toEqual({})
  })

  it('starts over from a file nobody can read', () => {
    const { world } = setup({}, { directory: mkdtempSync(join(tmpdir(), 'dsa-heartbeat-')) })
    expect(world.warnings).toEqual([])
  })
})

describe('clearing the automation tasks earlier versions left', () => {
  it('lists and deletes one session\'s tasks on 0.2.1-rc.5', async () => {
    const calls: string[] = []
    await clearAutomationTasks({
      list: async ({ sessionId }) => (sessionId === 's-mom' ? [{ id: 'a' }, { id: 'b' }] : []),
      delete: async ({ sessionId, id }) => { calls.push(`${sessionId}:${id}`) },
    }, 's-mom')
    expect(calls).toEqual(['s-mom:a', 's-mom:b'])
  })

  it('stops and deletes them as that session on 0.2.2, where the list is a page of every task', async () => {
    const calls: string[] = []
    await clearAutomationTasks({
      list: async () => ({ items: [{ id: 'other' }] }),
      stopSessionTasks: async (sessionId) => { calls.push(`stop:${sessionId}`) },
      catalog: async () => [
        { id: 'done', target: { kind: 'session', sessionId: 's-mom' } },
        { id: 'other', target: { kind: 'session', sessionId: 's-dad' } },
        { id: 'fresh', target: { kind: 'new_once' } },
      ],
      edit: async (request, actor) => { calls.push(`${request.action}:${request.id}:${actor}`) },
    }, 's-mom')
    expect(calls).toEqual(['stop:s-mom', 'delete:done:s-mom'])
  })

  it('leaves a shape it does not know alone', async () => {
    await expect(clearAutomationTasks({ list: async () => ({ items: [] }) }, 's-mom')).resolves.toBeUndefined()
  })
})
