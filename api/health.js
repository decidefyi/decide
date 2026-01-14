export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.status(200).end(
    JSON.stringify({
      ok: true,
      service: "refund.decide.fyi",
      ts: new Date().toISOString(),
    })
  );
}
