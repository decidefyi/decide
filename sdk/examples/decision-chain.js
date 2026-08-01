const { createDecideClient } = require('../decide');

const decide = createDecideClient({
  apiKey: process.env.DECIDE_API_KEY
});

async function run() {
  const record = await decide.decide(
    {
      question: 'Approve 15% annual-plan discount exception?',
      mode: 'single',
      context: {
        workflow: 'pricing_exception',
        source_record_id: 'deal_chain_demo',
        requested_action: 'approve_discount',
        margin_floor: 'passed',
        owner_rule: 'verified'
      }
    },
    {
      idempotencyKey: 'deal_chain_demo:discount',
      responseView: 'full'
    }
  );

  const chainId = record.audit_chain && record.audit_chain.chain_id;
  if (!chainId) throw new Error('Decision Record did not include audit_chain metadata');

  const chain = await decide.decisionChain(chainId, { limit: 10 });
  console.log(
    JSON.stringify(
      {
        decision_id: record.decision_id,
        chain_id: chain.chain_id,
        chain_size: chain.chain_size,
        merkle_root: chain.merkle_root,
        head_link_hash: chain.head_link_hash,
        verification: chain.verification
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
