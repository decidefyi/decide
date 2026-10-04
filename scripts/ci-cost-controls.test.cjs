const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('contract and inventory jobs avoid drafts, cancel obsolete runs and have bounded timeouts', () => {
  for (const filename of ['contract-policy-tests.yml', 'inventory-freshness.yml']) {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows', filename), 'utf8');
    assert.match(workflow, /ready_for_review, converted_to_draft/, filename);
    assert.match(workflow, /if: \$\{\{ github.event_name != 'pull_request' \|\| github.event.pull_request.draft == false \}\}/, filename);
    assert.match(workflow, /group: \$\{\{ github.workflow \}\}-\$\{\{ github.ref \}\}/, filename);
    assert.match(workflow, /cancel-in-progress: true/, filename);
    assert.match(workflow, /timeout-minutes: (?:10|20)/, filename);
    assert.match(workflow, /workflow_dispatch:/, filename);
    assert.match(workflow, /persist-credentials: false/, filename);
  }
  const contracts = fs.readFileSync(path.join(__dirname, '../.github/workflows/contract-policy-tests.yml'), 'utf8');
  assert.match(contracts, /cache: npm/);
  assert.match(contracts, /npm ci --ignore-scripts/);
  assert.match(contracts, /test:policy-evidence-postgres/);
  assert.match(contracts, /test:contract/);
  assert.match(contracts, /test:mcp-adoption/);
  assert.doesNotMatch(contracts, /continue-on-error/);
});


test('local preflight fails before push and preserves the full offline CI gate', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.scripts['ci:preflight'], 'npm run ci:preflight:full');
  assert.ok(pkg.scripts['ci:preflight:quick'].includes('git diff --check'));
  assert.ok(pkg.scripts['ci:preflight:full'].includes('npm run ci:preflight:quick'));
  for (const command of ["test:policy-evidence-postgres","test:contract","test:policy-mcp-http","test:mcp-adoption","workflow:test"]) assert.ok(pkg.scripts['ci:preflight:full'].includes(command), command);
  for (const lane of ['ci:preflight:quick', 'ci:preflight:full']) {
    assert.doesNotMatch(pkg.scripts[lane], /npm ci|npm install|gh |git push|vercel|smoke:production/);
  }
});
