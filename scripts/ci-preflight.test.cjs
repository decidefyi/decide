const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

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

test('the full local preflight stops on the first failed tool instead of continuing into a push', () => {
  const repoRoot = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts['ci:preflight:full'];
  const commands = script.split(' && ');
  assert.ok(commands.length >= 2);
  assert.ok(commands.every(command => /^(?:npm (?:run |--prefix |test)|bash scripts\/check-project-inventory\.sh$)/.test(command)));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ecosystem-preflight-'));
  const log = path.join(fixture, 'calls.jsonl');
  const fake = '#!' + process.execPath + '\n'
    + 'const fs = require("node:fs"); const path = require("node:path");\n'
    + 'const command = path.basename(process.argv[1]) + " " + process.argv.slice(2).join(" ");\n'
    + 'fs.appendFileSync(process.env.PREFLIGHT_LOG, JSON.stringify(command) + "\\n");\n'
    + 'if (command === process.env.PREFLIGHT_FAIL) process.exit(7);\n';
  for (const tool of ['npm', 'bash']) fs.writeFileSync(path.join(fixture, tool), fake, { mode: 0o700 });
  for (const index of new Set([0, 1, Math.floor(commands.length / 2), commands.length - 1, commands.length])) {
    fs.writeFileSync(log, '');
    const result = spawnSync('sh', ['-c', script], { cwd: repoRoot, encoding: 'utf8',
      env: { PATH: fixture + ':' + process.env.PATH, PREFLIGHT_LOG: log, PREFLIGHT_FAIL: commands[index] || '' } });
    assert.equal(result.status, index === commands.length ? 0 : 7, result.stderr);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls, commands.slice(0, Math.min(index + 1, commands.length)));
  }
});
