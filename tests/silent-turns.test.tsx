// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { SILENT_ATTRIBUTE, markSilentTurns, watchSilentTurns } from '../src/client/silent-turns.ts'

/**
 * A conversation's rows, as the host draws them: each `[kind, turn, reply?]`.
 * A string reply is drawn in the step's Markdown body, as 0.2.2 does; `true`
 * marks the answer the way older hosts did.
 */
function rows(items: readonly (readonly [string, string, (string | boolean)?])[]): HTMLElement {
  const root = document.createElement('div')
  for (const [kind, turn, reply] of items) {
    const row = document.createElement('div')
    row.setAttribute('data-chat-flow-kind', kind)
    row.setAttribute('data-chat-turn', turn)
    if (reply === true) row.setAttribute('data-turn-process-answer', 'true')
    if (typeof reply === 'string') {
      const body = document.createElement('div')
      body.setAttribute('data-text-interaction-source', '')
      body.textContent = reply
      row.appendChild(body)
    } else {
      // Thinking is drawn outside the Markdown body.
      row.textContent = '思考 nothing due'
    }
    root.appendChild(row)
  }
  return root
}
const marked = (root: Element) => [...root.querySelectorAll(`[${SILENT_ATTRIBUTE}]`)].map(row => `${row.getAttribute('data-chat-turn')}:${row.getAttribute('data-chat-flow-kind')}`)

describe('silent turns', () => {
  it('are a host note\'s turns with nothing said or done: only thinking, or the silent reply', () => {
    const root = rows([
      ['turn-trigger', '5'], ['turn-process', '5'], ['assistant-step', '5'], ['turn-tail', '5'],
      ['turn-trigger', '6'], ['assistant-step', '6'], ['assistant-step', '6', ' [silent] '], ['turn-tail', '6'],
    ])
    markSilentTurns(root)
    expect(marked(root)).toEqual(['5:turn-trigger', '5:turn-process', '5:assistant-step', '5:turn-tail', '6:turn-trigger', '6:assistant-step', '6:assistant-step', '6:turn-tail'])
  })

  it('keep a heartbeat\'s reminder in view', () => {
    const root = rows([['turn-trigger', '7'], ['turn-process', '7'], ['assistant-step', '7'], ['assistant-step', '7', '到点了，该喝水啦。'], ['turn-tail', '7']])
    markSilentTurns(root)
    expect(marked(root)).toEqual([])
  })

  it('leave out the turn that answered, acted, failed, or that a person started', () => {
    const root = rows([
      ['turn-trigger', '1'], ['turn-process', '1'], ['assistant-step', '1', true], ['turn-tail', '1'],
      ['turn-trigger', '2'], ['turn-process', '2'], ['tool-call', '2'], ['turn-tail', '2'],
      ['turn-trigger', '3'], ['turn-process', '3'], ['turn-error', '3'], ['turn-tail', '3'],
      ['user', '4'], ['turn-process', '4'], ['turn-tail', '4'],
    ])
    markSilentTurns(root)
    expect(marked(root)).toEqual([])
  })

  it('come back into view when the turn turns out to say something', () => {
    const root = rows([['turn-trigger', '5'], ['turn-process', '5']])
    markSilentTurns(root)
    expect(marked(root)).toHaveLength(2)
    const answer = document.createElement('div')
    answer.setAttribute('data-chat-flow-kind', 'assistant-step')
    answer.setAttribute('data-chat-turn', '5')
    answer.setAttribute('data-turn-process-answer', 'true')
    root.appendChild(answer)
    markSilentTurns(root)
    expect(marked(root)).toEqual([])
  })

  it('are followed as the conversation changes, until the watch ends', async () => {
    const root = rows([['turn-trigger', '5'], ['turn-process', '5']])
    const stop = watchSilentTurns(root)
    expect(marked(root)).toHaveLength(2)
    const more = rows([['turn-trigger', '6'], ['turn-process', '6']])
    root.append(...more.children)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(marked(root)).toHaveLength(4)
    stop()
  })
})
