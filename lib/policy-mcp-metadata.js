export const POLICY_MCP_VERSION = "1.3.1";
export const POLICY_MCP_URL = "https://policy.decide.fyi/api/mcp";

export const POLICY_MCP_READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export function buildPolicyMcpOutputSchema(verdicts, properties = {}) {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      verdict: { type: "string", enum: [...verdicts] },
      code: { type: "string" },
      message: { type: "string" },
      vendor: { type: "string" },
      rules_version: { type: "string" },
      policy_version: { type: "string" },
      policy_source_url: { type: "string" },
      policy_source_notes: { type: "string" },
      policy_last_checked: { type: "string" },
      policy_last_verified_utc: { type: "string" },
      source_hash: { type: "string" },
      evaluated_at: { type: "string" },
      required_context: { type: "array", items: { type: "string" } },
      rulebook_result: { type: "object", additionalProperties: true },
      ...properties,
    },
    required: ["verdict", "code", "message"],
  };
}

export const POLICY_MCP_SERVER_INFO = Object.freeze({
  name: "policy.decide.fyi",
  title: "Decide Policy Notaries",
  version: POLICY_MCP_VERSION,
  description: "Fail-closed refund, cancellation, return, and trial checks for 100 US subscription vendors.",
  icons: [
    {
      src: "https://policy.decide.fyi/favicon.svg",
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ],
  websiteUrl: "https://policy.decide.fyi",
});

export function buildPolicyRegistryServer() {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: "io.github.decidefyi/policy-notaries",
    title: POLICY_MCP_SERVER_INFO.title,
    description: POLICY_MCP_SERVER_INFO.description,
    repository: {
      url: "https://github.com/decidefyi/decide",
      source: "github",
    },
    version: POLICY_MCP_VERSION,
    remotes: [{ type: "streamable-http", url: POLICY_MCP_URL }],
  };
}

export function buildPolicyMcpServerCard(tools) {
  return {
    serverInfo: POLICY_MCP_SERVER_INFO,
    authentication: {
      required: false,
      schemes: [],
    },
    tools,
    resources: [],
    prompts: [],
  };
}
