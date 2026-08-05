import cancelPenaltyHandler from "../../../lib/routes/v1/policies/cancel-penalty.js";
import refundEligibilityHandler from "../../../lib/routes/v1/policies/refund-eligibility.js";
import returnEligibilityHandler from "../../../lib/routes/v1/policies/return-eligibility.js";
import trialTermsHandler from "../../../lib/routes/v1/policies/trial-terms.js";
import { parseRequestQuery } from "../../../lib/request-query.js";

const POLICY_ROUTE_MAP = {
  "cancel/penalty": cancelPenaltyHandler,
  "refund/eligibility": refundEligibilityHandler,
  "return/eligibility": returnEligibilityHandler,
  "trial/terms": trialTermsHandler,
};

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function readPathParam(req, query, key, pathIndex) {
  const fromQuery = first(query[key]);
  if (typeof fromQuery === "string" && fromQuery) return fromQuery;

  const path = String(req.url || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  return parts[pathIndex] || "";
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function v1PolicyDispatcher(req, res) {
  const query = parseRequestQuery(req);
  const policy = normalize(readPathParam(req, query, "policy", 2));
  const action = normalize(readPathParam(req, query, "action", 3));
  const routeKey = `${policy}/${action}`;
  const handler = POLICY_ROUTE_MAP[routeKey];

  if (!handler) {
    json(res, 404, {
      ok: false,
      error: "NOT_FOUND",
      message: "Unknown policy endpoint",
      endpoint: `/api/v1/${policy}/${action}`,
    });
    return;
  }

  await handler(req, res);
}
