export function resolveQualifyingConditionContext({
  decisionMode,
  qualifyingConditionsMet,
  requireCompleteContext = true,
}) {
  const normalizedMode = ["deterministic", "conditional", "review_only"].includes(decisionMode)
    ? decisionMode
    : "review_only";
  const hasConditionalPolicy = normalizedMode === "conditional";
  const requiresManualReview = normalizedMode === "review_only";
  const contextComplete = requiresManualReview
    ? false
    : (!requireCompleteContext || !hasConditionalPolicy || qualifyingConditionsMet !== undefined);
  const conditionsSatisfied =
    !requiresManualReview && (
      !hasConditionalPolicy ||
      qualifyingConditionsMet === true ||
      (!requireCompleteContext && qualifyingConditionsMet === undefined)
    );

  return {
    decisionMode: normalizedMode,
    hasConditionalPolicy,
    requiresManualReview,
    contextComplete,
    conditionsSatisfied,
    missingContext: requiresManualReview ? "manual_policy_review" : (contextComplete ? "" : "qualifying_conditions_met"),
  };
}
