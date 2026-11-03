/**
 * The workspace context: the assistant's name and what it calls its user
 * (both set on the assistant page), `profile.md`, `persona.md` with its
 * self-correction status, the project list, and what the other records hold
 * (names only: the contents are looked up when needed). Read synchronously
 * from the session's folder on every assembly, cut to the configured limits,
 * so the model always sees the files as they are now.
 * @module dsh-assisstant/host/workspace
 */
/** What the workspace context needs to know. */
export interface WorkspaceOptions {
    /** The assistant's name from the assistant list, when known. */
    readonly name?: string | undefined;
    /** What the assistant calls its user, when they set it. */
    readonly address?: string | undefined;
    readonly profileMaxChars: number;
    readonly personaMaxChars: number;
    readonly personaSelfCorrect: boolean;
    readonly personaCooldownHours: number;
}
/** The file-system reads the context makes; tests pass fakes. */
export interface WorkspaceFs {
    read(path: string): string | undefined;
    mtime(path: string): number | undefined;
    list(path: string): readonly string[] | undefined;
}
/** Node's file system, with every failure read as "absent". */
export declare const nodeFs: WorkspaceFs;
/**
 * Build the workspace context.
 * @param cwd - the session's folder, or undefined when unknown.
 * @param options - the person's name and the limits.
 * @param now - the current instant, epoch milliseconds.
 * @param fs - the file-system reads.
 * @returns the context text.
 */
export declare function workspaceText(cwd: string | undefined, options: WorkspaceOptions, now: number, fs?: WorkspaceFs): string;
