export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
 
  const { b64, titulo } = req.body;
  if (!b64 || !titulo) return res.status(400).json({ error: "Faltan datos: b64 y titulo requeridos" });
 
  const prompt = `Eres ingeniero eléctrico experto en NEC 2020 (NFPA 70) aplicado en Costa Rica bajo RTCR 458:2011 (D.E. 36979-MEIC).
Analiza la foto de inspección eléctrica titulada: "${titulo}"
Las anotaciones (flechas, círculos, marcas) indican los puntos específicos a evaluar.
 
Responde SOLO con JSON válido sin texto adicional ni backticks:
{"hallazgos":["hallazgo citando Art. NEC"],"acciones":["acción correctiva"]}
 
Reglas estrictas:
- Cita artículo NEC 2020 en CADA hallazgo (ej: Art. 110.12(A), Art. 250.4(A)(5))
- Máximo 5 hallazgos y 5 acciones requeridas
- Lenguaje técnico en español
- Sin observaciones → {"hallazgos":["Sin observaciones."],"acciones":["Verificar sellos y fijación en campo."]}`;
 
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
 
    const body = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: b64,
            },
          },
          { text: prompt },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000,
      },
    };
 
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
 
    const data = await response.json();
 
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
 
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
 
    // Validate JSON
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
 
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}