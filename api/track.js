const APPS = ["acidentes", "ocorrencias", "alertas"];
const TYPES = ["word", "word_pdf", "copy"];
const EVENTS_KEY = "lts:events";
const TOTALS_KEY = "lts:totals";
const MAX_EVENTS = 20000;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(500).json({ error: "Banco não configurado." });

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { app, type } = body || {};
  if (!APPS.includes(app) || !TYPES.includes(type)) {
    return res.status(400).json({ error: "Evento inválido." });
  }

  const event = JSON.stringify({ t: new Date().toISOString(), app, type });

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["RPUSH", EVENTS_KEY, event],
        ["LTRIM", EVENTS_KEY, -MAX_EVENTS, -1],
        ["HINCRBY", TOTALS_KEY, `${app}:${type}`, 1],
      ]),
    });
    if (!response.ok) return res.status(502).json({ error: "Falha ao registrar." });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: "Falha ao registrar." });
  }
};
