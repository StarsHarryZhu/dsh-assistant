/**
 * Marks the turns in an assistant conversation that nobody needs to see: started
 * by a host note, such as a heartbeat with nothing due, and ending with nothing
 * said or done: no reply text but {@link SILENT_REPLY}, no tool call. The host
 * would draw each as a "done" row. Only such a turn is marked: a reply, a tool
 * call, or an error keeps it in view. Thinking alone does not count as saying
 * something; a reply is the step's Markdown body.
 * @module dsh-assisstant/client/silent-turns
 */

import { SILENT_REPLY } from '../shared/silent.ts'

/** The attribute the stylesheet hides. */
export const SILENT_ATTRIBUTE = 'data-dsa-silent'

/** The rows a turn may hold and still be silent. */
const QUIET_KINDS = new Set(['turn-trigger', 'turn-process', 'turn-tail', 'assistant-step'])

/** Where a step's reply text is drawn; its thinking is drawn elsewhere. */
const REPLY_BODY = '[data-text-interaction-source]'

/** @returns whether a row says something to the user. */
function speaks(row: Element): boolean {
  if (row.hasAttribute('data-turn-process-answer')) return true
  if (row.getAttribute('data-chat-flow-kind') !== 'assistant-step') return false
  const text = [...row.querySelectorAll(REPLY_BODY)].map(body => body.textContent ?? '').join('').trim()
  return text !== '' && text !== SILENT_REPLY
}

/** How long to wait for a burst of changes to end, in milliseconds. */
const SETTLE_MS = 100

/**
 * Mark or unmark the rows of every turn under a root.
 * @param root - what holds the conversation's rows.
 */
export function markSilentTurns(root: ParentNode): void {
  const turns = new Map<string, Element[]>()
  for (const row of root.querySelectorAll('[data-chat-flow-kind][data-chat-turn]')) {
    const turn = row.getAttribute('data-chat-turn') as string
    turns.set(turn, [...turns.get(turn) ?? [], row])
  }
  for (const rows of turns.values()) {
    const kinds = rows.map(row => row.getAttribute('data-chat-flow-kind') as string)
    const silent = kinds.includes('turn-trigger')
      && kinds.every(kind => QUIET_KINDS.has(kind))
      && !rows.some(speaks)
    for (const row of rows) row.toggleAttribute(SILENT_ATTRIBUTE, silent)
  }
}

/**
 * Keep the marks up to date while a conversation is on screen.
 * @param root - what holds the conversation's rows.
 * @returns the cleanup.
 */
export function watchSilentTurns(root: Element): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const observer = new MutationObserver(() => {
    if (timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      markSilentTurns(root)
    }, SETTLE_MS)
  })
  observer.observe(root, { childList: true, subtree: true })
  markSilentTurns(root)
  return () => {
    observer.disconnect()
    if (timer !== undefined) clearTimeout(timer)
  }
}
