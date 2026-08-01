const { createDecideClient } = require('../decide');

async function main() {
  const decide = createDecideClient({
    apiKey: process.env.DECIDE_API_KEY,
    baseUrl: process.env.DECIDE_BASE_URL || 'https://www.decide.fyi'
  });

  const decision = await decide.decide(
    {
      question: 'Approve 15% annual-plan discount exception before CRM write-back?',
      mode: 'single',
      context: {
        workflow: 'pricing_exception',
        source_record_id: '006xx000004TmiQAAS',
        requested_action: 'approve_discount',
        target_system: 'salesforce',
        target_object_id: '006xx000004TmiQAAS',
        mutation: 'Opportunity.update'
      }
    },
    {
      idempotencyKey: 'opp_006xx000004TmiQAAS_discount_15',
      responseView: 'full'
    }
  );

  const crmSync = await decide.recordCrmSync(
    decision.decision_id,
    {
      sync_status: 'written',
      sync_direction: 'writeback',
      crm_provider: 'salesforce',
      crm_object_type: 'Opportunity',
      crm_object_id: '006xx000004TmiQAAS',
      crm_record_url: 'https://example.my.salesforce.com/006xx000004TmiQAAS',
      decision_record_hash: decision.record_hash,
      decision_receipt_hash: decision.receipt_hash,
      decision_verdict: decision.verdict,
      decision_action: decision.action,
      policy_id: decision.policy_id,
      policy_version: decision.policy_version,
      field_mapping: {
        decision_id: 'Decide_ID__c',
        verdict: 'Decision_Verdict__c',
        record_hash: 'Decision_Record_Hash__c',
        receipt_hash: 'Decision_Receipt_Hash__c',
        verify_url: 'Decision_Verify_URL__c'
      }
    },
    {
      idempotencyKey: 'opp_006xx000004TmiQAAS_decide_writeback'
    }
  );

  console.log({
    decision_id: decision.decision_id,
    sync_id: crmSync.crm_sync?.sync_id,
    sync_status: crmSync.crm_sync?.sync_status,
    sync_hash: crmSync.crm_sync?.sync_hash,
    mapped_fields: crmSync.crm_sync?.mapped_fields
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
