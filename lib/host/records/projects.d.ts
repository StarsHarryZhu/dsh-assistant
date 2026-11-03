/**
 * Project files (`projects/<name>.md`): quick edits of a long-running matter's
 * goal, status, to-dos, and notes. Planning and long documents stay a worker's.
 * The model writes them for itself, so they are in English.
 * @module dsh-assisstant/host/records/projects
 */
export declare const PROJECTS_FOLDER = "projects";
/** The changes one call makes. */
export interface ProjectEdit {
    readonly goal?: string | undefined;
    readonly status?: string | undefined;
    readonly addTodo?: readonly string[] | undefined;
    readonly checkTodo?: readonly string[] | undefined;
    readonly note?: string | undefined;
}
/**
 * Apply one call's changes.
 * @param text - the file, undefined when absent.
 * @param name - the project's name.
 * @param edit - the changes.
 * @param today - the local date, "YYYY-MM-DD".
 * @returns the new text, and any to-do phrases that matched nothing.
 */
export declare function editProject(text: string | undefined, name: string, edit: ProjectEdit, today: string): {
    text: string;
    missing: string[];
};
