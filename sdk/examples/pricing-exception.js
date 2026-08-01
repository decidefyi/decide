const { createDecideClient } = require('../decide');

async function main() {
  const decide = createDecideClient({
    apiKey: process.env.DECIDE_API_KEY
  });

  const input = {
    mode: 'rulebook',
    rulebook: {
      schema_version: 'rulebook_v1',
      rulebook_id: 'pricing_exception',
      version: '2026-06-11',
      input_schema: {
        required: ['discount_percent', 'margin_floor_passed', 'owner_verified'],
        properties: {
          discount_percent: { type: 'number' },
          margin_floor_passed: { type: 'boolean' },
          owner_verified: { type: 'boolean' }
        }
      },
      rules: [
        {
          rule_id: 'approve_standard_exception',
          priority: 100,
          condition: {
            all: [
              { field: 'discount_percent', operator: 'lte', value: 15 },
              { field: 'margin_floor_passed', operator: 'eq', value: true },
              { field: 'owner_verified', operator: 'eq', value: true }
            ]
          },
          outcome: {
            decision: 'yes',
            verdict: 'APPROVE',
            action: 'approve_discount',
            reason_code: 'STANDARD_EXCEPTION_ALLOWED'
          }
        }
      ],
      default_outcome: {
        decision: 'review',
        verdict: 'REVIEW',
        action: 'route_to_owner',
        reason_code: 'NO_RULE_MATCHED'
      }
    },
    context: {
      workflow: 'pricing_exception',
      source_record_id: 'deal_1042',
      requested_action: 'approve_discount',
      target_system: 'billing',
      target_object_id: 'sub_1042',
      mutation: 'discount.create',
      inputs: {
        discount_percent: 15,
        margin_floor_passed: true,
        owner_verified: true
      }
    }
  };

  const record = await decide.decide(input, {
    idempotencyKey: 'deal_1042_discount_15',
    responseView: 'full'
  });
  const verified = await decide.verifyRecord({ record, input });

  console.log(
    JSON.stringify(
      {
        decision_id: record.decision_id,
        verdict: record.verdict,
        application_verdict: record.application_verdict,
        reason_code: record.reason_code,
        matched_rule_id: record.matched_rule_id,
        record_hash: record.record_hash,
        receipt_hash: record.receipt_hash,
        verified: verified.verified
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
