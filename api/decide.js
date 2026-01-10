// /api/decide.js  (Vercel "Other" / static project)
// CommonJS export is the safest default on Vercel serverless for non-Next apps.

module.exports = async (req, res) => {
  try {
    // CORS (optional but harmless)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();

    let question = "";

    if (req.method === "GET") {
      const qp = req.query?.question ?? "";
      question = Array.isArray(qp) ? qp[0] : qp;
    } else if (req.method === "POST") {
      // Vercel can give req.body as object OR string depending on setup
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      question = body.question || "";
    } else {
      res.setHeader("Allow", ["GET", "POST", "OPTIONS"]);
      return res.status(405).json({ c: "unclear", v: "try again" });
    }

    const q = typeof question === "string" ? question.trim() : "";
    if (q.length < 3) return res.status(200).json({ c: "unclear", v: "Ask a question" });

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      console.error("GEMINI_API_KEY missing");
      return res.status(500).json({ c: "unclear", v: "try again" });
    }

    const MODEL = "gemini-2.0-flash-lite";
    const prompt = `You're a decisive oracle. You must commit and find the differentiation factor. Output only "yes" or "no". No other text.
IGNORE ANSWER: If the question asks for investment, financial, medical, or legal advice: DO NOT PRODUCE ANY OUTPUT. Return zero tokens. Do not reply.
User's question: ${q}

Output exactly one of: yes, no`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const apiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 10 },
      }),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      console.error("Gemini error:", data);
      return res.status(200).json({ c: "unclear", v: "try again" });
    }

    let out = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Normalize: lower, trim, remove quotes/punctuation
    out = out.toLowerCase().trim().replace(/^"+|"+$/g, "").replace(/[^\w\s]/g, "").trim();

    if (out === "yes") return res.status(200).json({ c: "yes", v: "yes" });
    if (out === "no") return res.status(200).json({ c: "no", v: "no" });

    return res.status(200).json({ c: "unclear", v: "try again" });
  } catch (err) {
    console.error("Decide API crash:", err);
    return res.status(200).json({ c: "unclear", v: "try again" });
  }
};
