import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DailyBrief, briefText } from '../src/host/brief.ts'
import { SYSTEM_PREFIX, Watchdog } from '../src/host/watchdog.ts'

describe('the watchdog', () => {
  const setup = () => {
    let now = 0
    const cancelled: string[] = []
    const notes: { to: string; text: string }[] = []
    const dog = new Watchdog({
      now: () => now,
      stallMs: () => 10 * 60_000,
      cancel: (id) => { cancelled.push(id) },
      notify: (to, text) => { notes.push({ to, text }) },
    })
    return { dog, cancelled, notes, advance: (ms: number) => { now += ms } }
  }

  it('stops an assistant conversation stalled mid-turn once and tells it', () => {
    const { dog, cancelled, notes, advance } = setup()
    dog.observe('r1', 'router', 'r1', 'turn/start')
    advance(9 * 60_000)
    expect(dog.tick()).toEqual([])
    advance(2 * 60_000)
    expect(dog.tick()).toEqual(['r1'])
    expect(cancelled).toEqual(['r1'])
    expect(notes[0]?.to).toBe('r1')
    expect(notes[0]?.text.startsWith(SYSTEM_PREFIX)).toBe(true)
    advance(20 * 60_000)
    expect(dog.tick()).toEqual([])
  })

  it('reports a quiet worker to its assistant conversation once per stall, and ignores idle sessions', () => {
    const { dog, cancelled, notes, advance } = setup()
    dog.observe('r1', 'router', 'r1', 'turn/end')
    dog.observe('w1', 'worker', 'r1', 'turn/start')
    expect(dog.routerOf('w1')).toBe('r1')
    advance(11 * 60_000)
    expect(dog.tick()).toEqual(['w1'])
    expect(cancelled).toEqual([])
    expect(notes).toHaveLength(1)
    expect(notes[0]?.to).toBe('r1')
    expect(dog.tick()).toEqual([])
    dog.observe('w1', 'worker', 'r1', 'tool/call')
    advance(11 * 60_000)
    expect(dog.tick()).toEqual(['w1'])
    dog.forget('w1')
    expect(dog.routerOf('w1')).toBe('w1')
  })

  it('uses the stall limit of the assistant a session belongs to', () => {
    let now = 0
    const cancelled: string[] = []
    const dog = new Watchdog({
      now: () => now,
      stallMs: router => (router === 'patient' ? 120 : 10) * 60_000,
      cancel: (id) => { cancelled.push(id) },
      notify: () => undefined,
    })
    dog.observe('patient', 'router', 'patient', 'turn/start')
    dog.observe('quick', 'router', 'quick', 'turn/start')
    now = 11 * 60_000
    expect(dog.tick()).toEqual(['quick'])
    now = 121 * 60_000
    expect(dog.tick()).toEqual(['patient'])
    expect(cancelled).toEqual(['quick', 'patient'])
  })
})

describe('the daily brief', () => {
  const file = '- [ ] 2026-10-28T18:00Z · 日程 · 看牙医\n- [ ] 2026-11-30T18:00Z · 日程 · 远期\n'

  it('sends once a day after the set time when today has items, and remembers it across restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsa-brief-'))
    let now = new Date('2026-10-28T11:00:00Z')
    const sent: { to: string; text: string }[] = []
    const deps = {
      now: () => now,
      time: () => '08:00',
      people: () => [
        { id: 'mom', name: '妈妈', cwd: '/w/mom', sessionId: 's-mom' },
        { id: 'pa', name: '爸爸', cwd: '/w/pa', sessionId: 's-pa' },
        { id: 'new', name: '新人' },
      ],
      zoneFor: () => 'America/New_York',
      read: (path: string) => (path === '/w/mom/ddl.md' ? file : undefined),
      send: (to: string, text: string) => { sent.push({ to, text }) },
      statePath: join(dir, 'brief.json'),
    }
    const brief = new DailyBrief(deps)
    expect(brief.tick()).toEqual([])
    now = new Date('2026-10-28T12:05:00Z')
    expect(brief.tick()).toEqual(['s-mom'])
    expect(sent[0]?.text).toContain('📅 14:00 看牙医')
    expect(brief.tick()).toEqual([])
    expect(JSON.parse(readFileSync(join(dir, 'brief.json'), 'utf8'))).toEqual({ mom: '2026-10-28', pa: '2026-10-28' })
    expect(new DailyBrief(deps).tick()).toEqual([])
  })

  it('does nothing when switched off or set to a malformed time', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsa-brief-'))
    for (const time of ['', '8点', '25:00']) {
      const brief = new DailyBrief({
        now: () => new Date('2026-10-28T23:00:00Z'), time: () => time, people: () => [{ id: 'a', name: 'a', cwd: '/w', sessionId: 's' }],
        zoneFor: () => 'UTC', read: () => file, send: () => { throw new Error('sent') }, statePath: join(dir, 'b.json'),
      })
      expect(brief.tick()).toEqual([])
    }
  })

  it('uses each assistant\'s own time, and skips the one that turned it off', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dsa-brief-'))
    const sent: string[] = []
    const people = [
      { id: 'early', name: '早', cwd: '/e', sessionId: 's-early' },
      { id: 'late', name: '晚', cwd: '/l', sessionId: 's-late' },
      { id: 'off', name: '关', cwd: '/o', sessionId: 's-off' },
    ]
    const times: Record<string, string> = { early: '08:00', late: '20:00', off: '' }
    let now = new Date('2026-10-28T09:00:00Z')
    const brief = new DailyBrief({
      now: () => now,
      time: person => times[person.id] ?? '',
      people: () => people,
      zoneFor: () => 'UTC',
      read: () => file,
      send: (sessionId) => { sent.push(sessionId) },
      statePath: join(folder, 'brief.json'),
    })
    brief.tick()
    expect(sent).toEqual(['s-early'])
    now = new Date('2026-10-28T20:30:00Z')
    brief.tick()
    expect(sent).toEqual(['s-early', 's-late'])
  })

  it('words the note for the assistant', () => {
    expect(briefText(['📅 14:00 看牙医'])).toMatch(/^\[assistant-system\] Daily brief/u)
  })
})
