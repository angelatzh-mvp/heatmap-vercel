export default async function handler(req, res) {
  console.log("==== Gemini Function Start ====");

  // Handle CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GEMINI_KEY = process.env.GEMINI_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: "GEMINI_KEY is missing." });
  }

  let prompt = "";
  try {
    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }
    prompt = body?.prompt;
    if (!prompt) throw new Error("Missing prompt");
  } catch (e) {
    return res.status(400).json({ error: "Invalid request body: " + e.message });
  }

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 3000,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return res.status(response.status || 500).json({ error: data.error.message });
    }

    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      return res.status(200).json({
        text: '{"insights":["分析暫時無法產生"],"suggestions":["請嘗試選擇其他時段或稍後再試"]}',
      });
    }

    let text = data.candidates[0].content.parts[0].text;
    text = text.replace(/```json/gi, "").replace(/```/gi, "").trim();

    console.log("Cleaned Response Text:", text);

    return res.status(200).json({ text });
  } catch (err) {
    console.error("Error calling Gemini API:", err);
    return res.status(500).json({ error: err.message });
  }
}
