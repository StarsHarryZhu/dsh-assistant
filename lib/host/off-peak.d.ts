/**
 * What the assistant conversation knows of DeepSeek's peak hours: when they
 * are in the user's own time, and whether one is on now, so work that can
 * wait waits for the off-peak price (see "Off-peak work" in the router
 * prompt).
 * @module dsh-assisstant/host/off-peak
 */
import type { PeakWindow } from '../shared/peak.ts';
/**
 * The peak-hours lines of the conversation's context.
 * @param windows - the peak hours, Beijing time, Monday to Friday.
 * @param now - epoch milliseconds.
 * @param zone - the user's IANA zone.
 */
export declare function offPeakText(windows: readonly PeakWindow[], now: number, zone: string): string;
