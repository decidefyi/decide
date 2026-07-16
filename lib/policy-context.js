export const QUALIFYING_CONDITION_VENDORS = new Set([
  "amazon_prime",
  "coursera_plus",
  "deezer",
  "expressvpn",
  "instacart_plus",
  "linkedin_premium",
  "midjourney",
  "noom",
  "nordvpn",
  "scribd",
  "squarespace",
  "todoist",
]);

export function resolveQualifyingConditionContext({
  vendor,
  qualifyingConditionsMet,
  requireCompleteContext = false,
}) {
  const hasConditionalPolicy = QUALIFYING_CONDITION_VENDORS.has(vendor);
  const contextComplete =
    !requireCompleteContext || !hasConditionalPolicy || qualifyingConditionsMet !== undefined;
  const conditionsSatisfied =
    !hasConditionalPolicy ||
    qualifyingConditionsMet === true ||
    (!requireCompleteContext && qualifyingConditionsMet === undefined);

  return {
    hasConditionalPolicy,
    contextComplete,
    conditionsSatisfied,
  };
}
