// Test-only worker. Never part of the tool surface or a hosted route.
import { parentPort, workerData } from 'node:worker_threads';
import { createQuoteDiscountService } from './service.js';
import { NOW } from './fixtures.js';

const service = createQuoteDiscountService({ enabled: true, filename: workerData.filename, clock: () => NOW, max_records_per_workspace: 1 });
const client = service.client({ workspace_id: 'workspace-a', principal_id: workerData.action === 'check' ? 'agent' : 'executor' });
parentPort.once('message', () => {
  try {
    const value = workerData.action === 'check' ? client.checkDiscount(workerData.request) : client.consumeApproval(workerData.request);
    parentPort.postMessage({ ok: true, value });
  } catch (error) { parentPort.postMessage({ ok: false, code: error.code || 'WORKER_FAILED' }); }
  finally { service.close(); parentPort.close(); }
});
parentPort.postMessage('ready');
