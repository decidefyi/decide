import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('publishing this service source branch cannot trigger an unrelated API preview deployment', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.git?.deploymentEnabled, { 'codex/quote-discount-service-20261006': false });
  assert.equal(config.git.deploymentEnabled.main, undefined, 'normal main deployment remains enabled by default');
  assert.equal(config.git.deploymentEnabled['*'], undefined, 'other branches are not disabled');
});
