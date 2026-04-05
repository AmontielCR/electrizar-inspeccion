async function getMSToken() {
    const url = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    });
    const r = await fetch(url, { method: "POST", body });
    const d = await r.json();
    if (!d.access_token) throw new Error("No se pudo obtener token de Microsoft: " + JSON.stringify(d));
    return d.access_token;
  }
  
  async function ensureFolder(token, userEmail, folderPath) {
    const base = `https://graph.microsoft.com/v1.0/users/${userEmail}/drive/root`;
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      const path = current ? `${current}/${part}` : part;
      const url = `${base}:/${encodeURIComponent(path)}:/`;
      const check = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (check.status === 404) {
        const parentUrl = current
          ? `${base}:/${encodeURIComponent(current)}:/children`
          : `${base}/children`;
        await fetch(parentUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: part, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
        });
      }
      current = path;
    }
  }
  
  async function uploadFile(token, userEmail, filePath, content, contentType) {
    const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/drive/root:/${encodeURIComponent(filePath)}:/content`;
    let body;
    if (contentType === "image/jpeg" && typeof content === "string") {
      const b64 = content.includes(",") ? content.split(",")[1] : content;
      const binary = Buffer.from(b64, "base64");
      body = binary;
    } else {
      body = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    }
    const r = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body,
    });
    return r.ok ? await r.json() : null;
  }
  
  export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
    const { informe } = req.body;
    if (!informe) return res.status(400).json({ error: "Falta el informe" });
  
    const userEmail = process.env.ONEDRIVE_USER_EMAIL;
    const results = { folders: [], files: [], errors: [] };
  
    try {
      const token = await getMSToken();
  
      // Nombre de carpeta: INF-26-055-ClienteNombre
      const clienteSlug = (informe.propietario || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s]/g, "").trim()
        .replace(/\s+/g, "_").slice(0, 25);
      const folderName = `${informe.codigo}-${clienteSlug}`;
      const folderPath = `Electrizar-Reportes/${folderName}`;
  
      // Crear carpeta
      await ensureFolder(token, userEmail, folderPath);
      results.folders.push(folderPath);
  
      // Guardar datos JSON del informe (sin imágenes para ahorrar espacio)
      const informeSinFotos = {
        ...informe,
        elementos: (informe.elementos || []).map(e => ({ ...e, url: null, b64: null })),
      };
      await uploadFile(token, userEmail, `${folderPath}/datos.json`, informeSinFotos, "application/json");
      results.files.push("datos.json");
  
      // Guardar cada foto
      for (const el of informe.elementos || []) {
        if (el.url) {
          const nombre = `foto_${String(el.num).padStart(2, "0")}_${
            (el.titulo || "elemento")
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-zA-Z0-9\s]/g, "").trim()
              .replace(/\s+/g, "_").slice(0, 30)
          }.jpg`;
          const ok = await uploadFile(token, userEmail, `${folderPath}/${nombre}`, el.url, "image/jpeg");
          if (ok) results.files.push(nombre);
          else results.errors.push(`No se pudo subir ${nombre}`);
        }
      }
  
      return res.status(200).json({ ok: true, folder: folderPath, ...results });
    } catch (e) {
      console.error("OneDrive error:", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
  