/**
 * The assistant conversation's tools beyond its records: reaching the user's
 * chat app, waking itself later, quiet hours, and moving what came in from a chat
 * out of `temp/`. They register in the router preset's scope only, so no other
 * session sees them, and return plain text for the model.
 * @module dsh-assisstant/host/assistant-tools
 */
import type { Person } from '../shared/settings.ts';
import type { AssistantService } from './service.ts';
import type { AgentLike } from './types.ts';
/** The folder things from a chat app are saved in. */
export declare const TEMP_FOLDER = "temp";
/** A tool's result. */
interface Outcome {
    ok: boolean;
    message: string;
}
/** What the tools need from the policy. */
export interface AssistantToolDeps {
    readonly service: AssistantService;
    /** The assistant a call acts for. */
    person(agent: AgentLike | undefined): Person | undefined;
    /** The user's IANA zone. */
    zone(agent: AgentLike | undefined): string;
    now?(): number;
}
/**
 * Move a file out of the workspace's `temp/`.
 * @param root - the workspace folder.
 * @param file - the file: its name, its path from the workspace, or its full path.
 * @param to - a folder inside the workspace, created when missing.
 * @returns what became of it.
 */
export declare function moveFromTemp(root: string, file: string, to: string): Outcome;
/**
 * Build the router's tools.
 * @param deps - the service and how to read a call's assistant.
 * @returns tool definitions to register in the preset's scope.
 */
export declare function assistantTools(deps: AssistantToolDeps): unknown[];
export {};
