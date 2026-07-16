export const POLICY_NOTARY_TOOL_NAMES = Object.freeze([
  "refund_eligibility",
  "cancellation_penalty",
  "return_eligibility",
  "trial_terms",
]);

function sameStringSet(left = [], right = []) {
  const normalize = (values) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function hasCompleteToolMetadata(tools = []) {
  return tools.length > 0 && tools.every((tool) =>
    tool?.annotations?.readOnlyHint === true &&
    tool?.annotations?.idempotentHint === true &&
    tool?.outputSchema?.type === "object"
  );
}

function registryServers(payload = {}) {
  return (Array.isArray(payload?.servers) ? payload.servers : [])
    .map((entry) => entry?.server || entry)
    .filter((entry) => entry && typeof entry === "object");
}

export function buildMcpDistributionHealthReport({
  manifest = {},
  serverCard = {},
  initializeResult = {},
  toolsListResult = {},
  registryPayload = {},
  now = new Date(),
} = {}) {
  const criticalFailures = [];
  const warnings = [];
  const actions = [];
  const checks = [];
  const canonicalName = "io.github.decidefyi/policy-notaries";
  const canonicalUrl = "https://policy.decide.fyi/api/mcp";

  const manifestValid =
    manifest?.name === canonicalName &&
    Boolean(String(manifest?.version || "").trim()) &&
    manifest?.remotes?.some((remote) => remote?.type === "streamable-http" && remote?.url === canonicalUrl);
  checks.push({ id: "local_manifest", status: manifestValid ? "pass" : "fail" });
  if (!manifestValid) criticalFailures.push("local_manifest_invalid");

  const localTools = Array.isArray(serverCard?.tools) ? serverCard.tools : [];
  const localToolSetValid = sameStringSet(localTools.map((tool) => tool?.name), POLICY_NOTARY_TOOL_NAMES);
  const localMetadataValid = hasCompleteToolMetadata(localTools);
  checks.push({ id: "local_tool_contract", status: localToolSetValid && localMetadataValid ? "pass" : "fail" });
  if (!localToolSetValid) criticalFailures.push("local_tool_set_mismatch");
  if (!localMetadataValid) criticalFailures.push("local_tool_metadata_incomplete");

  const liveVersion = String(initializeResult?.result?.serverInfo?.version || "").trim();
  const initializeValid = Boolean(liveVersion);
  checks.push({ id: "live_initialize", status: initializeValid ? "pass" : "fail", version: liveVersion });
  if (!initializeValid) criticalFailures.push("live_initialize_failed");
  if (initializeValid && manifest?.version && liveVersion !== manifest.version) {
    criticalFailures.push("live_version_mismatch");
  }

  const liveTools = Array.isArray(toolsListResult?.result?.tools) ? toolsListResult.result.tools : [];
  const liveToolSetValid = sameStringSet(liveTools.map((tool) => tool?.name), POLICY_NOTARY_TOOL_NAMES);
  checks.push({ id: "live_tool_set", status: liveToolSetValid ? "pass" : "fail", count: liveTools.length });
  if (!liveToolSetValid) criticalFailures.push("live_tool_set_mismatch");
  if (liveToolSetValid && !hasCompleteToolMetadata(liveTools)) {
    warnings.push("live_tool_metadata_outdated");
    actions.push("deploy_current_canonical_tool_metadata");
    checks.push({ id: "live_tool_metadata", status: "warn" });
  } else if (liveToolSetValid) {
    checks.push({ id: "live_tool_metadata", status: "pass" });
  }

  const canonicalRecords = registryServers(registryPayload).filter((server) => server?.name === canonicalName);
  const currentRegistryRecord = canonicalRecords.find((server) => server?.version === manifest?.version);
  if (registryPayload?._fetch_error) {
    warnings.push("official_registry_unavailable");
    actions.push("retry_official_registry_health_check");
    checks.push({ id: "official_registry", status: "unavailable" });
  } else if (canonicalRecords.length === 0) {
    warnings.push("official_registry_listing_missing");
    actions.push("publish_canonical_official_registry_version");
    checks.push({ id: "official_registry", status: "missing" });
  } else if (!currentRegistryRecord) {
    warnings.push("official_registry_version_outdated");
    actions.push("publish_canonical_official_registry_version");
    checks.push({ id: "official_registry", status: "warn" });
  } else {
    const registryRemoteValid = currentRegistryRecord.remotes?.some((remote) => remote?.url === canonicalUrl);
    checks.push({ id: "official_registry", status: registryRemoteValid ? "pass" : "warn" });
    if (!registryRemoteValid) {
      warnings.push("official_registry_remote_mismatch");
      actions.push("publish_corrected_official_registry_version");
    }
  }

  return {
    schema_version: "mcp_distribution_health_v1",
    generated_at_utc: new Date(now).toISOString(),
    status: criticalFailures.length > 0 ? "unhealthy" : warnings.length > 0 ? "action_required" : "healthy",
    canonical_name: canonicalName,
    canonical_version: String(manifest?.version || ""),
    canonical_url: canonicalUrl,
    expected_tools: [...POLICY_NOTARY_TOOL_NAMES],
    checks,
    critical_failures: [...new Set(criticalFailures)],
    warnings: [...new Set(warnings)],
    actions: [...new Set(actions)],
  };
}
