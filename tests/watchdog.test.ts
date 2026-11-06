import { describe, expect, it } from 'vitest'
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
