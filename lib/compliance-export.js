import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(__dirname, "..", "rules");

const POLICY_SETS = [
  {
    key: "refund",
    sourcesFile: "policy-sources.json",
    hashesFile: "policy-hashes.json",
    candidatesFile: "policy-change-candidates.json",
  },
  {
    key: "cancel",
    sourcesFile: "cancel-policy-sources.json",
    hashesFile: "cancel-policy-hashes.json",
    candidatesFile: "cancel-policy-change-candidates.json",
  },
  {
    key: "return",
    sourcesFile: "return-policy-sources.json",
    hashesFile: "return-policy-hashes.json",
    candidatesFile: "return-policy-change-candidates.json",
  },
  {
    key: "trial",
    sourcesFile: "trial-policy-sources.json",
    hashesFile: "trial-policy-hashes.json",
    candidatesFile: "trial-policy-change-candidates.json",
  },
];

const VENDOR_COLUMNS = [
  "vendor",
  ...POLICY_SETS.flatMap(({ key }) => ([
    `${key}_source_url`,
    `${key}_source_notes`,
    `${key}_hash`,
    `${key}_candidate_pending`,
    `${key}_candidate_count`,
    `${key}_candidate_first_seen_utc`,
    `${key}_candidate_last_seen_utc`,
    `${key}_candidate_source_url`,
  ])),
  "any_candidate_change",
];

function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function normalizeSource(entry) {
  if (typeof entry === "string") {
    return { url: entry, notes: "" };
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { url: "", notes: "" };
  }
  return {
    url: asText(entry.url),
    notes: asText(entry.notes),
  };
}

function normalizeCandidate(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  const parsedCount = Number.parseInt(String(entry.count ?? 1), 10);
  const count = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;

  return {
    count,
    first_seen_utc: asText(entry.first_seen_utc),
    last_seen_utc: asText(entry.last_seen_utc),
    source_url: asText(entry.source_url),
  };
}

function loadPolicySet(config) {
  const sources = readJson(join(RULES_DIR, config.sourcesFile), { vendors: {} });
  const hashes = readJson(join(RULES_DIR, config.hashesFile), {});
  const candidates = readJson(join(RULES_DIR, config.candidatesFile), {});

  return {
    key: config.key,
    vendors: asObject(sources.vendors),
    hashes: asObject(hashes),
    candidates: asObject(candidates),
    last_checked: asText(sources.last_checked) || null,
    last_verified_utc: asText(sources.last_verified_utc) || null,
  };
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function toCsv(rows) {
  return rows.map((cells) => cells.map(escapeCsv).join(",")).join("\n") + "\n";
}

export function buildComplianceSnapshot(now = new Date()) {
  const loadedSets = POLICY_SETS.map(loadPolicySet);
  const vendorNames = new Set();

  for (const policySet of loadedSets) {
    for (const vendor of Object.keys(policySet.vendors)) {
      vendorNames.add(vendor);
    }
  }

  const vendors = [...vendorNames].sort((a, b) => a.localeCompare(b));
  const policySummary = {};

  for (const policySet of loadedSets) {
    policySummary[policySet.key] = {
      tracked_vendors: Object.keys(policySet.vendors).length,
      pending_candidate_vendors: Object.keys(policySet.candidates).length,
      last_checked: policySet.last_checked,
      last_verified_utc: policySet.last_verified_utc,
    };
  }

  const vendorRows = vendors.map((vendor) => {
    const row = { vendor };
    let hasAnyCandidate = false;

    for (const policySet of loadedSets) {
      const source = normalizeSource(policySet.vendors[vendor]);
      const candidate = normalizeCandidate(policySet.candidates[vendor]);
      const prefix = policySet.key;

      row[`${prefix}_source_url`] = source.url;
      row[`${prefix}_source_notes`] = source.notes;
      row[`${prefix}_hash`] = asText(policySet.hashes[vendor]);
      row[`${prefix}_candidate_pending`] = candidate ? "yes" : "no";
      row[`${prefix}_candidate_count`] = candidate ? candidate.count : 0;
      row[`${prefix}_candidate_first_seen_utc`] = candidate?.first_seen_utc || "";
      row[`${prefix}_candidate_last_seen_utc`] = candidate?.last_seen_utc || "";
      row[`${prefix}_candidate_source_url`] = candidate?.source_url || "";

      if (candidate) hasAnyCandidate = true;
    }

    row.any_candidate_change = hasAnyCandidate ? "yes" : "no";
    return row;
  });

  const pendingCandidateVendorsTotal = loadedSets.reduce(
    (total, policySet) => total + Object.keys(policySet.candidates).length,
    0
  );
  const vendorsWithAnyCandidate = vendorRows.reduce(
    (total, row) => total + (row.any_candidate_change === "yes" ? 1 : 0),
    0
  );

  return {
    generated_at: now.toISOString(),
    tracked_vendors: vendors.length,
    vendors_with_any_candidate: vendorsWithAnyCandidate,
    pending_candidate_vendors_total: pendingCandidateVendorsTotal,
    policies: POLICY_SETS.map((policySet) => policySet.key),
    policy_summary: policySummary,
    columns: VENDOR_COLUMNS,
    vendors: vendorRows,
  };
}

export function snapshotToCsv(snapshot) {
  const rows = [];
  rows.push(["Compliance Export", "decide.fyi"]);
  rows.push(["Generated At (UTC)", snapshot.generated_at || ""]);
  rows.push(["Tracked Vendors", snapshot.tracked_vendors ?? ""]);
  rows.push(["Vendors With Pending Candidate Change", snapshot.vendors_with_any_candidate ?? ""]);
  rows.push(["Pending Candidate Vendor Entries (All Policies)", snapshot.pending_candidate_vendors_total ?? ""]);
  rows.push([]);
  rows.push(["Policy", "Tracked Vendors", "Pending Candidate Vendors", "Last Checked", "Last Verified (UTC)"]);

  const orderedPolicies = Array.isArray(snapshot.policies) ? snapshot.policies : [];
  const policySummary = asObject(snapshot.policy_summary);
  for (const policy of orderedPolicies) {
    const summary = asObject(policySummary[policy]);
    rows.push([
      policy,
      summary.tracked_vendors ?? "",
      summary.pending_candidate_vendors ?? "",
      summary.last_checked ?? "",
      summary.last_verified_utc ?? "",
    ]);
  }

  rows.push([]);
  rows.push(VENDOR_COLUMNS);

  const vendorRows = Array.isArray(snapshot.vendors) ? snapshot.vendors : [];
  for (const vendor of vendorRows) {
    rows.push(VENDOR_COLUMNS.map((column) => vendor?.[column] ?? ""));
  }

  return toCsv(rows);
}
