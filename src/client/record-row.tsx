/**
 * How a record tool's call reads in the conversation: its plain title, in place
 * of the host's generic row with the tool's name. Registered per tool name, so
 * only these nine tools, which only assistant conversations have, are affected.
 * @module dsh-assisstant/client/record-row
 */

import type { ReactNode } from 'react'
import { recordToolTitle } from '../shared/record-tools.ts'
import type { RecordToolName } from '../shared/record-tools.ts'

/** What the row reads from the host's `tool.call.toolview` props. */
export interface RecordRowProps {
  readonly toolName: string
  readonly block: { readonly argsRaw?: string; readonly call?: { readonly argsRaw?: string } }
}

/** @returns the call's arguments; empty while they are still an incomplete prefix. */
function argsOf(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw ?? '')
    return parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** The row. */
export function RecordRow(props: RecordRowProps): ReactNode {
  const args = argsOf(props.block.call?.argsRaw ?? props.block.argsRaw)
  return <div className="dsa-record-row">{recordToolTitle(props.toolName as RecordToolName, args)}</div>
}
