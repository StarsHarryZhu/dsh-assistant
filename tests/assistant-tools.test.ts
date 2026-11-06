import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assistantTools } from '../src/host/assistant-tools.ts'
import { copyFromInbox, copyName, pruneOldFiles } from '../src/host/inbox.ts'
import { recordToolTitle } from '../src/shared/record-tools.ts'
import type { WakeRequest } from '../src/host/heartbeat.ts'
import type { Person } from '../src/shared/settings.ts'
import { fakeAgent, fakeService, fakeSession } from './helpers.ts'

const ZONE = 'Asia/Shanghai'
const NOW = Date.parse('2026-11-05T14:00:00+08:00')

type Tool = { name: string; execute(args: unknown, exec: unknown): Promise<{ ok: boolean; message: string }> }

function setup(person: Person = { id: 'mom', name: '阿福', cwd: '/w', sessionId: 's', settings: { quietStart: '22:00', quietEnd: '08:00' } }) {
  const service = fakeService({}, [person])
  const wakes: Omit<WakeRequest, 'id'>[] = []
  const patches: { personId: string; patch: unknown }[] = []
  let fromUser = true
  service.turnFromUser = () => fromUser
  service.addWake = (_person, wake) => {
    wakes.push(wake)
    return { id: 'w', ...wake }
  }
  service.updateSettings = async (personId, patch) => { patches.push({ personId, patch }) }
  const agent = fakeAgent(fakeSession('s'))
  const tools = assistantTools({ service, person: () => person, zone: () => ZONE, now: () => NOW }) as Tool[]
  const call = (name: string, args: Record<string, unknown>) => (tools.find(tool => tool.name === name) as Tool).execute(args, { agent })
  return { service, call, wakes, patches, setFromUser: (value: boolean) => { fromUser = value } }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: NOW }) })
afterEach(() => { vi.useRealTimers() })

describe('im_route', () => {
  it('reports each outcome so the model knows what to do next', async () => {
    const { service, call } = setup()
    const calls: unknown[] = []
    service.routeChat = (_person, _session, send) => {
      calls.push(send)
      return { status: 'routed' }
    }
    const routed = await call('im_route', { send: true })
    expect(routed).toMatchObject({ ok: true, message: expect.stringContaining('goes to WeChat too') })
    expect(routed.message).toContain('<keep>')
    service.routeChat = () => ({ status: 'held', until: Date.parse('2026-11-06T08:00:00+08:00') })
    const held = await call('im_route', { send: true })
    expect(held).toMatchObject({ ok: true, message: expect.stringContaining('11/06 08:00') })
    expect(held.message).toContain('shows in the app now')
    service.routeChat = (_person, _session, send) => {
      calls.push(send)
      return { status: 'kept' }
    }
    expect((await call('im_route', { send: false })).message).toContain('stays in the app only')
    expect(calls).toEqual([true, false])
    service.routeChat = () => ({ status: 'unavailable' })
    expect(await call('im_route', { send: true })).toMatchObject({ ok: false, message: expect.stringContaining('No chat app is connected') })
    service.routeChat = () => ({ status: 'no-turn' })
    expect((await call('im_route', { send: true })).ok).toBe(false)
  })

  it('turns a failure into a result', async () => {
    const { service, call } = setup()
    service.routeChat = () => { throw new Error('boom') }
    expect(await call('im_route', { send: true })).toMatchObject({ ok: false, message: expect.stringContaining('boom') })
  })
})

describe('wake_after', () => {
  it('takes minutes or a local time', async () => {
    const { call, wakes } = setup()
    expect((await call('wake_after', { reason: '叫他', minutes: 10 })).message).toContain('11/05 14:10')
    expect(wakes[0]).toEqual({ at: NOW + 600_000, reason: '叫他', throughQuiet: false })
    expect((await call('wake_after', { reason: '查快递', time: '17:30' })).ok).toBe(true)
    expect(wakes[1]?.at).toBe(Date.parse('2026-11-05T17:30:00+08:00'))
    expect((await call('wake_after', { reason: '问结果', date: '2026-11-07', time: '09:00' })).ok).toBe(true)
    expect(wakes[2]?.at).toBe(Date.parse('2026-11-07T09:00:00+08:00'))
  })

  it('refuses what it cannot use', async () => {
    const { call } = setup()
    for (const args of [{ reason: ' ', minutes: 5 }, { reason: 'x' }, { reason: 'x', minutes: 0 }, { reason: 'x', minutes: 60 * 24 * 31 }, { reason: 'x', time: '13:00' }, { reason: 'x', time: '25:00' }, { reason: 'x', date: '2027-12-01', time: '09:00' }]) {
      expect((await call('wake_after', args)).ok, JSON.stringify(args)).toBe(false)
    }
  })

  it('says when quiet hours will delay it', async () => {
    const { call } = setup()
    const result = await call('wake_after', { reason: '半夜查', time: '23:00' })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('11/06 08:00')
  })

  it('goes through quiet hours only in a turn the user is in', async () => {
    const { call, wakes, setFromUser } = setup()
    const asked = await call('wake_after', { reason: '叫他赶飞机', date: '2026-11-06', time: '03:00', through_quiet: true })
    expect(asked.message).toContain('11/06 03:00')
    expect(wakes[0]?.throughQuiet).toBe(true)
    setFromUser(false)
    const own = await call('wake_after', { reason: '半夜看看', date: '2026-11-06', time: '03:00', through_quiet: true })
    expect(own.ok).toBe(false)
    expect(wakes).toHaveLength(1)
  })
})

describe('wake_cancel', () => {
  it('cancels by words, and says when none match', async () => {
    const { service, call } = setup()
    service.cancelWakes = (_person, match) => (match === '快递' ? [{ id: 'w', at: 1, reason: '查快递', throughQuiet: false }] : [])
    expect((await call('wake_cancel', { match: '快递' })).message).toContain('查快递')
    expect((await call('wake_cancel', { match: '别的' })).ok).toBe(false)
    expect((await call('wake_cancel', { match: ' ' })).ok).toBe(false)
  })
})

describe('brief_set', () => {
  it('refuses in any turn without a message from the user, changing nothing', async () => {
    const { call, patches, setFromUser } = setup()
    setFromUser(false)
    const result = await call('brief_set', { time: '07:00' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('only when the user asks')
    expect(patches).toEqual([])
  })

  it('moves the brief, says when quiet hours hold it back, and turns it off', async () => {
    const { call, patches } = setup()
    const early = await call('brief_set', { time: '07:00' })
    expect(early.ok).toBe(true)
    expect(early.message).toContain('inside the daily quiet hours (22:00–08:00), so it will come at 08:00')
    expect(patches[0]).toEqual({ personId: 'mom', patch: { dailyBriefTime: '07:00' } })
    expect((await call('brief_set', { time: '09:00' })).message).toBe('The daily brief comes at 09:00 from now on.')
    expect((await call('brief_set', { time: '' })).message).toBe('The daily brief is off.')
    expect(patches[2]?.patch).toEqual({ dailyBriefTime: '' })
    expect((await call('brief_set', { time: '25:00' })).ok).toBe(false)
    expect(patches).toHaveLength(3)
  })
})

describe('quiet_set', () => {
  it('refuses in any turn without a message from the user, changing nothing', async () => {
    const { call, patches, setFromUser } = setup()
    setFromUser(false)
    const result = await call('quiet_set', { daily_start: '23:00', daily_end: '07:00' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('only when the user asks')
    expect(patches).toEqual([])
  })

  it('changes the daily hours, or turns them off', async () => {
    const { call, patches } = setup()
    expect((await call('quiet_set', { daily_start: '23:00', daily_end: '07:00' })).ok).toBe(true)
    expect(patches[0]).toEqual({ personId: 'mom', patch: { quietStart: '23:00', quietEnd: '07:00' } })
    expect((await call('quiet_set', { daily_start: '', daily_end: '' })).message).toContain('off')
    expect(patches[1]?.patch).toEqual({ quietStart: '', quietEnd: '' })
    expect((await call('quiet_set', { daily_start: '23:00', daily_end: '23:00' })).ok).toBe(false)
    expect((await call('quiet_set', { daily_start: '25:00', daily_end: '07:00' })).ok).toBe(false)
    expect((await call('quiet_set', { daily_start: '23:00' })).ok).toBe(false)
    expect(patches).toHaveLength(2)
  })

  it('sets temporary hours from now or from a time, and ends them', async () => {
    const { call, patches } = setup()
    expect((await call('quiet_set', { until_date: '2026-11-06', until_time: '10:00' })).message).toContain('from now until 11/06 10:00')
    expect(patches[0]?.patch).toEqual({ tempQuietFrom: NOW, tempQuietUntil: Date.parse('2026-11-06T10:00:00+08:00') })
    expect((await call('quiet_set', { from_time: '15:00', until_time: '16:00' })).ok).toBe(true)
    expect(patches[1]?.patch).toEqual({ tempQuietFrom: Date.parse('2026-11-05T15:00:00+08:00'), tempQuietUntil: Date.parse('2026-11-05T16:00:00+08:00') })
    expect((await call('quiet_set', { clear_temporary: true })).ok).toBe(true)
    expect(patches[2]?.patch).toEqual({ tempQuietFrom: undefined, tempQuietUntil: undefined })
    expect((await call('quiet_set', { until_time: '13:00' })).ok).toBe(false)
    expect((await call('quiet_set', { from_time: '16:00', until_time: '15:00' })).ok).toBe(false)
    expect((await call('quiet_set', {})).ok).toBe(false)
    expect(patches).toHaveLength(3)
  })
})

describe('media_copy', () => {
  const workspace = () => {
    const root = mkdtempSync(join(tmpdir(), 'dsa-copy-'))
    mkdirSync(join(root, 'IM', 'WeChat'), { recursive: true })
    writeFileSync(join(root, 'IM', 'WeChat', '20261105-213502-报告.pdf'), 'content')
    return root
  }
  const original = (root: string) => join(root, 'IM', 'WeChat', '20261105-213502-报告.pdf')

  it('copies a file by its name, its path, or its full path, under the name it was sent with, keeping the original', () => {
    for (const form of ['20261105-213502-报告.pdf', 'IM/WeChat/20261105-213502-报告.pdf', 'full'] as const) {
      const root = workspace()
      const result = copyFromInbox(root, form === 'full' ? original(root) : form, 'projects/装修')
      expect(result).toEqual({ ok: true, message: 'Copied to projects/装修/报告.pdf. Work on that copy, never on the file in IM/.' })
      expect(readFileSync(join(root, 'projects', '装修', '报告.pdf'), 'utf8')).toBe('content')
      expect(existsSync(original(root))).toBe(true)
    }
  })

  it('keeps the time on a generic name, and takes the older temp folder too', () => {
    expect(copyName('20261105-213502-image.jpg')).toBe('20261105-213502-image.jpg')
    expect(copyName('20261105-213502-image-1.png')).toBe('20261105-213502-image-1.png')
    expect(copyName('20261105-213502-合同.docx')).toBe('合同.docx')
    const root = workspace()
    mkdirSync(join(root, 'temp'))
    writeFileSync(join(root, 'temp', 'old.txt'), 'old')
    expect(copyFromInbox(root, 'temp/old.txt', 'files').message).toContain('files/old.txt')
    expect(copyFromInbox(root, 'IM/WeChat/20261105-213502-报告.pdf', '.').message).toContain('Copied to 报告.pdf.')
  })

  it('never overwrites', () => {
    const root = workspace()
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'docs', '报告.pdf'), 'older')
    expect(copyFromInbox(root, '20261105-213502-报告.pdf', 'docs').message).toContain('Copied to docs/报告-1.pdf.')
    expect(readFileSync(join(root, 'docs', '报告.pdf'), 'utf8')).toBe('older')
  })

  it('copies only out of the inbox, only to a folder of the workspace outside it', () => {
    const root = workspace()
    writeFileSync(join(root, 'profile.md'), 'mine')
    expect(copyFromInbox(root, 'profile.md', 'docs').ok).toBe(false)
    expect(copyFromInbox(root, '../profile.md', 'docs').ok).toBe(false)
    expect(copyFromInbox(root, 'IM/../profile.md', 'docs').ok).toBe(false)
    expect(copyFromInbox(root, '/etc/passwd', 'docs').ok).toBe(false)
    expect(copyFromInbox(root, 'missing.pdf', 'docs')).toMatchObject({ ok: false, message: expect.stringContaining('send it again') })
    expect(copyFromInbox(root, '20261105-213502-报告.pdf', '../outside').ok).toBe(false)
    expect(copyFromInbox(root, '20261105-213502-报告.pdf', '/tmp/outside').ok).toBe(false)
    expect(copyFromInbox(root, '20261105-213502-报告.pdf', 'IM/WeChat/sub').ok).toBe(false)
    expect(copyFromInbox(root, '20261105-213502-报告.pdf', 'IM').ok).toBe(false)
    expect(readdirSync(join(root, 'IM', 'WeChat'))).toEqual(['20261105-213502-报告.pdf'])
  })

  it('does not follow a link out of the workspace', () => {
    const root = workspace()
    const elsewhere = mkdtempSync(join(tmpdir(), 'dsa-elsewhere-'))
    symlinkSync(elsewhere, join(root, 'away'))
    expect(copyFromInbox(root, '20261105-213502-报告.pdf', 'away').ok).toBe(false)
    expect(readdirSync(elsewhere)).toEqual([])
  })

  it('works as a tool, and needs a workspace', async () => {
    const root = workspace()
    expect((await setup({ id: 'mom', name: '阿福', cwd: root }).call('media_copy', { file: '20261105-213502-报告.pdf', to: 'docs' })).ok).toBe(true)
    expect((await setup({ id: 'mom', name: '阿福' }).call('media_copy', { file: 'a.pdf', to: 'docs' })).ok).toBe(false)
  })
})

describe('the inbox clean-up', () => {
  it('removes plain files older than the days kept, and nothing when kept for good', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsa-prune-'))
    const folder = join(root, 'IM', 'WeChat')
    mkdirSync(join(folder, 'sub'), { recursive: true })
    const day = 86_400_000
    const file = (name: string, age: number) => {
      writeFileSync(join(folder, name), name)
      const at = (NOW - age) / 1000
      utimesSync(join(folder, name), at, at)
    }
    file('old.jpg', 31 * day)
    file('new.jpg', 29 * day)
    symlinkSync(join(root, 'elsewhere'), join(folder, 'link'))
    expect(pruneOldFiles(folder, 0, NOW)).toBe(0)
    expect(pruneOldFiles(folder, 30, NOW)).toBe(1)
    expect(readdirSync(folder).sort()).toEqual(['link', 'new.jpg', 'sub'])
    expect(pruneOldFiles(join(root, 'missing'), 30, NOW)).toBe(0)
  })
})

describe('the titles', () => {
  it('read plainly and stay short', () => {
    expect(recordToolTitle('im_route', { send: true })).toBe('回复也发到微信')
    expect(recordToolTitle('im_route', { send: false })).toBe('回复只留在这里')
    expect(recordToolTitle('media_copy', { file: '/w/IM/WeChat/20261105-213502-报告.pdf' })).toBe('复制微信发来的文件：20261105-213502-报告.pdf')
    expect(recordToolTitle('quiet_set', {})).toBe('改勿扰时间')
    expect(recordToolTitle('brief_set', { time: '07:00' })).toBe('改早上提示时间：07:00')
    expect(recordToolTitle('wake_after', { reason: '叫他' })).toBe('稍后再看：叫他')
    expect([...recordToolTitle('wake_after', { reason: '长'.repeat(100) })].length).toBeLessThan(70)
  })
})

describe('no assistant', () => {
  it('does nothing without one', async () => {
    const service = fakeService()
    const tools = assistantTools({ service, person: () => undefined, zone: () => ZONE }) as Tool[]
    expect((await tools[0]!.execute({ send: true }, {})).ok).toBe(false)
  })
})
