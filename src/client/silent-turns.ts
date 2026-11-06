/**
 * Marks the turns in an assistant conversation that nobody needs to see: started
 * by a host note, such as a heartbeat with nothing due, and ending with nothing
 * said or done. The host would draw each as a "done" row. Only such a turn is
 * marked: anything else in it, an error included, keeps it in view.
 * @module dsh-assisstant/client/silent-turns
 */

/** The attribute the stylesheet hides. */
export const SILENT_ATTRIBUTE = 'data-dsa-silent'

/** The rows a turn may hold and still be silent. */
const QUIET_KINDS = new Set(['turn-trigger', 'turn-process', 'turn-tail', 'assistant-step'])

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
      && !rows.some(row => row.hasAttribute('data-turn-process-answer'))
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
