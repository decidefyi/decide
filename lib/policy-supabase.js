function toFlag(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

export function getPolicySupabaseConfig(env = process.env) {
  const url = normalizeUrl(env.SUPABASE_URL);
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const syncEnabled = toFlag(env.POLICY_SUPABASE_SYNC_ENABLED, false);
  const stateSyncEnabled = toFlag(env.POLICY_SUPABASE_STATE_SYNC_ENABLED, false);
  const suppressGitState = toFlag(env.POLICY_SUPABASE_SUPPRESS_GIT_STATE, true);
  const configured = Boolean(url && serviceRoleKey);

  return {
    url,
    serviceRoleKey,
    configured,
    syncEnabled: configured && syncEnabled,
    stateSyncEnabled: configured && stateSyncEnabled,
    suppressGitState,
  };
}

function buildUrl(baseUrl, path, params = {}) {
  const target = new URL(path.replace(/^\//, ""), `${baseUrl}/`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item == null || item === "") continue;
        target.searchParams.append(key, String(item));
      }
      continue;
    }
    target.searchParams.set(key, String(value));
  }
  return target.toString();
}

function buildHeaders(config, { json = true, prefer = "" } = {}) {
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  if (prefer) {
    headers.Prefer = prefer;
  }
  return headers;
}

export async function supabaseRestRequest(config, { method = "GET", path = "", params = {}, body, prefer = "" } = {}) {
  if (!config?.configured) {
    return {
      ok: false,
      status: 0,
      error: "supabase_not_configured",
      data: null,
    };
  }

  const url = buildUrl(config.url, path, params);
  const response = await fetch(url, {
    method,
    headers: buildHeaders(config, { json: body !== undefined, prefer }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        (data && typeof data === "object" && (data.message || data.error || data.hint)) ||
        `supabase_http_${response.status}`,
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    error: "",
    data,
  };
}

export async function supabaseUpsertRows(config, tableName, rows = [], onConflictColumns = []) {
  const payload = Array.isArray(rows) ? rows : [];
  if (payload.length === 0) {
    return { ok: true, status: 200, error: "", upserted: 0 };
  }

  const conflict = (onConflictColumns || []).map((entry) => String(entry || "").trim()).filter(Boolean).join(",");
  const result = await supabaseRestRequest(config, {
    method: "POST",
    path: `/rest/v1/${tableName}`,
    params: conflict ? { on_conflict: conflict } : {},
    body: payload,
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  return {
    ok: result.ok,
    status: result.status,
    error: result.error,
    upserted: payload.length,
  };
}
