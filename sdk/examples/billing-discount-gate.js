const { createDecideClient } = require('../decide');

function isApproved(record) {
  return record?.verdict === 'yes' || record?.c === 'yes' || record?.v === 'approved';
}

function isDenied(record) {
  return record?.verdict === 'no' || record?.c === 'no' || record?.v === 'denied';
}

async function decideBillingDiscount(discountRequest, {
  decide = createDecideClient({ apiKey: process.env.DECIDE_API_KEY }),
  saveDecisionRecord,
  applyBillingUpdate,
  markPendingReview
} = {}) {
  if (!saveDecisionRecord || !applyBillingUpdate || !markPendingReview) {
    throw new Error('decideBillingDiscount requires saveDecisionRecord, applyBillingUpdate, and markPendingReview callbacks');
  }

  const input = {
    question: 'Approve discount before billing update?',
    mode: 'single',
    context: {
      workflow: 'billing_discount_gate',
      source_record_id: discountRequest.subscriptionId,
      requested_action: 'apply_discount',
      target_system: 'billing',
      target_object_id: discountRequest.subscriptionId,
      mutation: 'discount.create',
      discount_percent: discountRequest.discountPercent,
      account_tier: discountRequest.accountTier,
      margin_floor: discountRequest.marginFloorStatus,
      owner_rule: discountRequest.ownerRuleStatus
    }
  };

  const record = await decide.decide(input, {
    idempotencyKey: `billing:${discountRequest.subscriptionId}:discount:${discountRequest.requestId}`,
    responseView: 'full'
  });

  await saveDecisionRecord(discountRequest.subscriptionId, record, input);

  if (isApproved(record)) {
    await applyBillingUpdate(discountRequest.subscriptionId, {
      discountPercent: discountRequest.discountPercent,
      metadata: {
        decide_decision_id: record.decision_id,
        decide_record_hash: record.record_hash,
        decide_receipt_hash: record.receipt_hash
      }
    });
    return { route: 'applied', record };
  }

  await markPendingReview(discountRequest.subscriptionId, {
    route: isDenied(record) ? 'blocked' : 'review',
    record
  });
  return { route: isDenied(record) ? 'blocked' : 'review', record };
}

module.exports = { decideBillingDiscount };

if (require.main === module) {
  decideBillingDiscount(
    {
      requestId: 'req_1042_discount_15',
      subscriptionId: 'sub_1042',
      discountPercent: 15,
      accountTier: 'annual',
      marginFloorStatus: 'passed',
      ownerRuleStatus: 'verified'
    },
    {
      saveDecisionRecord: async () => {},
      applyBillingUpdate: async () => {},
      markPendingReview: async () => {}
    }
  )
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
