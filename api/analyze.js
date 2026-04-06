export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { b64, titulo } = req.body || {};
    if (!b64 || !titulo) return res.status(400).json({ error: "Faltan datos" });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text:
`Eres ingeniero eléctrico experto en NEC 2020 (NFPA 70) aplicado en Costa Rica bajo RTCR 458:2011.
Analiza la foto de inspección eléctrica titulada: "${titulo}"
Las anotaciones indican los puntos específicos a evaluar.
Responde SOLO con JSON válido sin texto adicional ni backticks:
{"hallazgos":["hallazgo citando Art. NEC"],"acciones":["acción correctiva"]}
Reglas: cita Art. NEC en cada hallazgo, máximo 5 de cada uno, español técnico.
Sin observaciones → {"hallazgos":["Sin observaciones."],"acciones":["Verificar sellos y fijación en campo."]}` }
          ],
        }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const txt = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
    const parsed = JSON.parse(txt);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}