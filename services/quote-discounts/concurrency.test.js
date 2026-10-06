import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setup, proposal } from './fixtures.js';

async function race(filename, action, request) {
  const workers = Array.from({ length: 6 }, () => new Worker(new URL('./concurrency-worker.js', import.meta.url), { workerData: { filename, action, request }, execArgv: [] }));
  const exits = workers.map(worker => new Promise(resolve => worker.once('exit', resolve)));
  const ready = workers.map(worker => new Promise((resolve, reject) => {
    worker.once('error', reject); worker.once('message', message => message === 'ready' ? resolve() : reject(new Error('worker did not become ready')));
  }));
  await Promise.all(ready);
  const results = workers.map(worker => new Promise((resolve, reject) => { worker.once('error', reject); worker.once('message', resolve); }));
  workers.forEach(worker => worker.postMessage('run'));
  const result = await Promise.all(results);
  assert.deepEqual(await Promise.all(exits), workers.map(() => 0));
  return result;
}

test('independent concurrent connections allocate one decision and one execution claim', { timeout: 15_000 }, async () => {
  const filename = join(mkdtempSync(join(tmpdir(), 'decide-quote-concurrency-')), 'store.sqlite');
  const { service } = setup({ filename }); service.close();
  const checked = await race(filename, 'check', proposal);
  assert.equal(checked.every(result => result.ok), true, JSON.stringify(checked));
  assert.equal(new Set(checked.map(result => result.value.decision_id)).size, 1);
  const claimed = await race(filename, 'consume', { decision_id: checked[0].value.decision_id, ...proposal });
  assert.equal(claimed.every(result => result.ok), true, JSON.stringify(claimed));
  assert.equal(claimed.filter(result => result.value.newly_claimed).length, 1);
  assert.equal(new Set(claimed.map(result => result.value.claim_id)).size, 1);
});
