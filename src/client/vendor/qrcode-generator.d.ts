/**
 * The part of qrcode-generator 2.0.4 (MIT, Copyright (c) 2009 Kazuhiko Arase)
 * the QR card uses. The library itself is vendored unchanged next to this file.
 * @module dsh-assisstant/client/vendor/qrcode-generator
 */

/** One encoded QR symbol. */
export interface QrCode {
  addData(data: string, mode?: 'Byte'): void
  make(): void
  getModuleCount(): number
  isDark(row: number, col: number): boolean
}

/** Create an encoder: type 0 picks the smallest symbol that fits. */
declare function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QrCode

export default qrcode
