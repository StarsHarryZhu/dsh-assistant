// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { SILENT_ATTRIBUTE, markSilentTurns, watchSilentTurns } from '../src/client/silent-turns.ts'

/** A conversation's rows, as the host draws them: each `[kind, turn, answer?]`. */
function rows(items: readonly (readonly [string, string, boolean?])[]): HTMLElement {
  const root = document.createElement('div')
  for (const [kind, turn, answer] of items) {
    const row = document.createElement('div')
    row.setAttribute('data-chat-flow-kind', kind)
    row.setAttribute('data-chat-turn', turn)
    if (answer === true) row.setAttribute('data-turn-process-answer', 'true')
    root.appendChild(row)
  }
  return root
}
const marked = (root: Element) => [...root.querySelectorAll(`[${SILENT_ATTRIBUTE}]`)].map(row => `${row.getAttribute('data-chat-turn')}:${row.getAttribute('data-chat-flow-kind')}`)

describe('silent turns', () => {
  it('are a host note\'s turns with nothing said or done', () => {
    const root = rows([['turn-trigger', '5'], ['turn-process', '5'], ['assistant-step', '5'], ['turn-tail', '5']])
    markSilentTurns(root)
    expect(marked(root)).toEqual(['5:turn-trigger', '5:turn-process', '5:assistant-step', '5:turn-tail'])
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
