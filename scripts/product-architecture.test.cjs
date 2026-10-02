const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const prose = (file) => read(file).replace(/\s+/g, ' ');

test('canonical architecture and contributor instructions preserve capability ownership', () => {
  const constitution = prose('docs/ECOSYSTEM_CONSTITUTION.md');
  const instructions = prose('AGENTS.md');
  assert.match(constitution, /Decide is independent decision infrastructure for software and agents/);
  assert.match(constitution, /Krafthaus is the application and workflow layer/);
  assert.match(constitution, /APIs, MCP tools, and agents stay with the product that owns their capability/);
  assert.match(constitution, /Independent applications can use Decide without adopting Krafthaus/);
  assert.match(instructions, /independent decision infrastructure/);
  assert.match(instructions, /ECOSYSTEM_CONSTITUTION\.md/);
  for (const text of [constitution, instructions]) {
    assert.doesNotMatch(text, /Decide is the deterministic policy runtime/i);
  }
});

test('action lifecycle captures evidence before execution and never treats replay as permission', () => {
  const constitution = read('docs/ECOSYSTEM_CONSTITUTION.md');
  const lifecycle = constitution.split('## Shared Application Anatomy')[1].split('```text')[1].split('```')[0];
  const record = lifecycle.indexOf('Decision Record captured before execution');
  const enforcement = lifecycle.indexOf('trusted application checks the exact action');
  const execution = lifecycle.indexOf('application executes');
  assert.ok(record >= 0 && record < enforcement && enforcement < execution);
  assert.match(prose('docs/ECOSYSTEM_CONSTITUTION.md'), /Replay reconstructs historical evaluation, not fresh permission to act/);
});

test('approved-action plan separates a local model from releasable authority', () => {
  const plan = prose('docs/APPROVED_ACTION_PRODUCTION_PATH.md');
  assert.match(plan, /Status: Implementation sequence, not a production feature/);
  for (const requirement of [
    'owner-approved', 'trusted executor', 'durable', 'revocation',
    'provider idempotency', 'reconciliation', 'independent application'
  ]) assert.ok(plan.includes(requirement), `missing production requirement: ${requirement}`);
  assert.match(plan, /No public endpoint or MCP tool is introduced by this document/);
  assert.match(plan, /unsigned and in memory/);
});
