const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// Run in the inventory stage, after its real ripgrep prerequisite is installed.
test('generated inventory identifies the repository independently of the checkout folder', () => {
  const repoRoot = path.join(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-checkout-'));
  try {
    fs.mkdirSync(path.join(fixture, 'scripts'));
    for (const name of ['generate-project-inventory.sh', 'generate-outbound-domain-inventory.mjs']) {
      fs.copyFileSync(path.join(repoRoot, 'scripts', name), path.join(fixture, 'scripts', name));
    }
    for (const args of [['init', '--quiet'], ['remote', 'add', 'origin', 'https://github.com/decidefyi/decide.git']]) {
      assert.equal(spawnSync('git', args, { cwd: fixture }).status, 0);
    }
    const result = spawnSync('bash', ['scripts/generate-project-inventory.sh'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(fixture, 'FUNCTION_INTERCONNECTIONS.md'), 'utf8'), /dependency map for `decide`/);
    assert.match(fs.readFileSync(path.join(fixture, 'OUTBOUND_DOMAIN_INVENTORY.md'), 'utf8'), /Repository: `decide`/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
