/**
 * A QR code drawn as SVG squares, from the vendored qrcode-generator.
 * @module dsh-assisstant/client/qr
 */

import { useMemo, type ReactNode } from 'react'
import qrcode from './vendor/qrcode-generator.js'

/**
 * Encode text into its dark modules.
 * @param text - the text to encode.
 * @returns the module count and the dark cells, or undefined when it does not fit.
 */
export function encode(text: string): { size: number; cells: [number, number][] } | undefined {
  try {
    const code = qrcode(0, 'M')
    code.addData(text, 'Byte')
    code.make()
    const size = code.getModuleCount()
    const cells: [number, number][] = []
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) if (code.isDark(row, col)) cells.push([col, row])
    }
    return { size, cells }
  } catch {
    return undefined
  }
}

/** The QR code of `text`, `pixels` wide. */
export function QrCode(props: { text: string; pixels?: number; label: string }): ReactNode {
  const encoded = useMemo(() => encode(props.text), [props.text])
  if (encoded === undefined) return null
  const margin = 2
  const span = encoded.size + margin * 2
  return (
    <svg className="dsa-qr" role="img" aria-label={props.label} width={props.pixels ?? 220} height={props.pixels ?? 220}
      viewBox={`0 0 ${span} ${span}`} shapeRendering="crispEdges">
      <rect width={span} height={span} fill="#fff" />
      {encoded.cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x + margin} y={y + margin} width={1} height={1} fill="#000" />)}
    </svg>
  )
}
