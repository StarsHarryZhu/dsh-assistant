/**
 * Structural mirrors of the host services this plugin reads.
 *
 * At runtime the host half imports only `@deepseek-ai/cordis`,
 * `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`, Node built-ins, and
 * (lazily, in the sub-plugin group) `@deepseek-ai/dsh-app-boot`. These types
 * mirror only the fields it uses; each names its source.
 * @module dsh-assisstant/host/types
 */
export {};
