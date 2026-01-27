import { waitUntil } from '@vercel/functions';

// Persist structured logs to Axiom (free tier)
// Uses waitUntil to log in the background without delaying the response
// Set AXIOM_DATASET and AXIOM_TOKEN in Vercel env vars
export function persistLog(event, data) {
  const dataset = process.env.AXIOM_DATASET;
  const token = process.env.AXIOM_TOKEN;
  if (!dataset || !token) return;

  const work = fetch(`https://api.axiom.co/v1/datasets/${dataset}/ingest`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{ _time: new Date().toISOString(), event, ...data }])
  }).then(r => {
    if (!r.ok) return r.text().then(t => console.log('[Axiom Error]', r.status, t));
  }).catch(e => {
    console.log('[Axiom Error]', e.message);
  });

  waitUntil(work);
}
