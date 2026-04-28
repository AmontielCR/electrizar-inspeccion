export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { b64, titulo } = req.body;
  if (!b64 || !titulo) return res.status(400).json({ error: "Faltan datos" });

  const prompt = `Eres un ingeniero eléctrico experto en NEC 2020 y RTCR 458:2011 (Costa Rica).
Analiza esta imagen de una instalación eléctrica llamada "${titulo}".

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta (sin texto adicional ni markdown):
{
  "hallazgos": ["hallazgo 1 con artículo NEC", "hallazgo 2 con artículo NEC"],
  "acciones": ["acción correctiva 1", "acción correctiva 2"],
  "notas": ["nota técnica 1 relevante", "nota técnica 2 relevante"]
}

Reglas:
- hallazgos: 2-4 no conformidades observables en la imagen, cada una con el artículo NEC 2020 o RTCR 458:2011 aplicable
- acciones: 2-4 acciones correctivas específicas y ejecutables
- notas: exactamente 2 notas técnicas adicionales (contexto normativo, recomendaciones preventivas, o condiciones especiales a considerar)
- Si la imagen se ve correcta, hallazgos y acciones pueden ser 1 item indicando cumplimiento
- Sé específico y técnico. No uses lenguaje genérico.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: b64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `API error: ${response.status}`, detail: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    // Limpiar posibles bloques markdown antes de parsear
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: "La IA devolvió un formato inválido", raw: text });
    }

    // Asegurar que notas exista y tenga exactamente 2 items
    if (!Array.isArray(parsed.notas)) parsed.notas = [];
    while (parsed.notas.length < 2) parsed.notas.push("Sin notas adicionales.");
    parsed.notas = parsed.notas.slice(0, 2);

    return res.status(200).json({
      hallazgos: parsed.hallazgos || [],
      acciones: parsed.acciones || [],
      notas: parsed.notas,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Error interno" });
  }
}
