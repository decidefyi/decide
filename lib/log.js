// Persist structured logs to Axiom (free tier)
// Set AXIOM_DATASET and AXIOM_TOKEN in Vercel env vars
export async function persistLog(event, data) {
  const dataset = process.env.AXIOM_DATASET;
  const token = process.env.AXIOM_TOKEN;
  if (!dataset || !token) return;

  try {
    const r = await fetch(`https://api.axiom.co/v1/datasets/${dataset}/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ _time: new Date().toISOString(), event, ...data }])
    });
    if (!r.ok) {
      const t = await r.text();
      console.log('[Axiom Error]', r.status, t);
    }
  } catch (e) {
    console.log('[Axiom Error]', e.message);
  }
}
