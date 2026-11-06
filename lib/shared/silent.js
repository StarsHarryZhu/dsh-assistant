/**
 * The reply that says nothing. A model always writes something, so a turn with
 * nothing to say (a heartbeat with nothing due) answers with exactly this, and
 * the browser half hides that turn.
 * @module dsh-assisstant/shared/silent
 */
/** The whole reply of a turn with nothing to say. */
export const SILENT_REPLY = '[silent]';
