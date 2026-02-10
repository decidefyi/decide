import zendeskCancelWorkflow from "../../../../lib/routes/v1/workflows/zendesk/cancel.js";
import zendeskRefundWorkflow from "../../../../lib/routes/v1/workflows/zendesk/refund.js";
import zendeskReturnWorkflow from "../../../../lib/routes/v1/workflows/zendesk/return.js";
import zendeskTrialWorkflow from "../../../../lib/routes/v1/workflows/zendesk/trial.js";

const WORKFLOW_ROUTE_MAP = {
  cancel: zendeskCancelWorkflow,
  refund: zendeskRefundWorkflow,
  return: zendeskReturnWorkflow,
  trial: zendeskTrialWorkflow,
};

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function readWorkflowParam(req) {
  const fromQuery = first(req.query?.workflow);
  if (typeof fromQuery === "string" && fromQuery) return fromQuery;

  const path = String(req.url || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  return parts[4] || "";
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function zendeskWorkflowDispatcher(req, res) {
  const workflow = normalize(readWorkflowParam(req));
  const handler = WORKFLOW_ROUTE_MAP[workflow];

  if (!handler) {
    json(res, 404, {
      ok: false,
      error: "NOT_FOUND",
      message: "Unknown workflow endpoint",
      endpoint: `/api/v1/workflows/zendesk/${workflow}`,
    });
    return;
  }

  await handler(req, res);
}
