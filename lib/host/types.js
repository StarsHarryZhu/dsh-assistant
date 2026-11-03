/**
 * Structural mirrors of the host services this plugin reads.
 *
 * At runtime the host half imports only `@deepseek-ai/cordis`,
 * `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`, Node built-ins, and
 * (lazily, in the sub-plugin group) `@deepseek-ai/dsh-app-boot`. These types
 * mirror only the fields it uses; each names its source.
 * @module dsh-assisstant/host/types
 */
/** The global tools the assistant agents keep: complete-subagent's six. */
export const ALLOWED_GLOBAL_TOOLS = [
    'delegate',
    'delegate_fork',
    'request_write_access',
    'answer_write_request',
    'grant_write_access',
    'revoke_write_access',
];
