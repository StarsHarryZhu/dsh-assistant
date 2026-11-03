/**
 * A button that opens a menu below itself. The menu goes through a portal
 * because the conversation header clips what overflows it. A click outside,
 * scrolling, resizing, or Escape closes it.
 * @module dsh-assisstant/client/menu
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Where the open menu sits. */
interface Place {
  readonly left: number
  readonly top: number
  readonly minWidth: number
}

/** @param props.children - the menu's rows, given the function that closes it. */
export function Dropdown(props: { label: ReactNode; ariaLabel: string; className: string; children: (close: () => void) => ReactNode }): ReactNode {
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<Place | undefined>()
  const open = place !== undefined
  useEffect(() => {
    if (!open) return
    const close = (): void => { setPlace(undefined) }
    const outside = (event: Event): void => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close()
    }
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('scroll', outside, true)
    document.addEventListener('keydown', key)
    globalThis.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('scroll', outside, true)
      document.removeEventListener('keydown', key)
      globalThis.removeEventListener('resize', close)
    }
  }, [open])
  return (
    <>
      <button ref={button} type="button" className={props.className} aria-label={props.ariaLabel} aria-haspopup="menu" aria-expanded={open}
        onClick={() => {
          const rect = button.current?.getBoundingClientRect()
          setPlace(open || rect === undefined ? undefined : { left: rect.left, top: rect.bottom + 4, minWidth: rect.width })
        }}>
        <span className="dsa-dropdown-label">{props.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {place !== undefined && createPortal(
        <div ref={menu} className="dsa-dropdown" role="menu" style={place}>{props.children(() => { setPlace(undefined) })}</div>,
        document.body,
      )}
    </>
  )
}
