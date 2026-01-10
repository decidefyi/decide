// This API route acts as a proxy to the Gemini API.  It accepts a
// POST request with a JSON body containing a single field `question`,
// constructs the same prompt used on the client and forwards it to
// Google’s Generative Language API.  By placing the API call on the
// server, we can keep the API key safe in an environment variable
// (GEMINI_API_KEY) instead of exposing it to the client.

export default async function handler(req, res) {
  try {
    let question;
    // Support both GET and POST methods.  For GET, extract the `question`
    // parameter from the query string.  For POST, expect a JSON body.
    if (req.method === 'GET') {
      // In Vercel/Next.js, the query parameters are available via `req.query`.
      const queryParam = req.query?.question ?? '';
      question = Array.isArray(queryParam) ? queryParam[0] : queryParam;
    } else if (req.method === 'POST') {
      ({ question } = req.body || {});
    } else {
      // Method not supported.
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const q = typeof question === 'string' ? question.trim() : '';
    // Reject very short or empty questions to mirror the client-side behaviour.
    if (!q || q.length < 3) {
      return res.status(200).json({ c: 'unclear', v: 'Ask a question' });
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      console.warn('GEMINI_API_KEY is not defined in environment');
    }
    const MODEL = 'gemini-2.0-flash-lite';
    const prompt = `You're a decisive oracle. Output only: "Yes", "No", or refuse as last resort. No other text. Commit to an answer — even hypotheticals get a real decision.

User's question: ${q}

Output exactly one of: "Yes", "No", "Try again".`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 10,
        },
      }),
    });
    const data = await apiRes.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
    if (result === 'yes') {
      return res.status(200).json({ c: 'yes', v: 'yes' });
    }
    if (result === 'no') {
      return res.status(200).json({ c: 'no', v: 'no' });
    }
    return res.status(200).json({ c: 'unclear', v: 'try again' });
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return res.status(200).json({ c: 'unclear', v: 'try again' });
  }
}