/**
 * The assistant conversation's tools beyond its records: choosing whether a
 * turn's reply reaches the user's chat app, waking itself later, quiet hours,
 * the daily brief's time, and copying what came in from a chat out of the
 * inbox. They register in the router preset's scope only, so no other session
 * sees them, and return plain text for the model.
 * @module dsh-assisstant/host/assistant-tools
 */
import type { Person } from '../shared/settings.ts';
import type { AssistantService } from './service.ts';
import type { AgentLike } from './types.ts';
/** The result shape every assistant tool shares: whether it worked, and plain text for the model. */
export declare const OUTPUT: {
    readonly schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly ok: {
                readonly type: "boolean";
                readonly required: true;
            };
            readonly message: {
                readonly type: "string";
                readonly required: true;
            };
        };
    };
    readonly render: (_args: unknown, value: {
        message: string;
    }) => {
        type: "text";
        text: string;
    }[];
};
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
 * Build the router's tools.
 * @param deps - the service and how to read a call's assistant.
 * @returns tool definitions to register in the preset's scope.
 */
export declare function assistantTools(deps: AssistantToolDeps): unknown[];
