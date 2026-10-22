const EVENTS_KEY = "lts:events";
const TOTALS_KEY = "lts:totals";
const SHOWN_EVENTS = 300;

const LABELS = {
  word: "Word",
  word_pdf: "Word + PDF",
  copy: "Copiar",
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (iso) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  });

module.exports = async (req, res) => {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const statsKey = (process.env.STATS_KEY || "").trim();
  if (!url || !token || !statsKey) return res.status(500).send("Não configurado.");

  const key = String((req.query && req.query.key) || "").trim();
  if (!statsKey || key !== statsKey) return res.status(401).send("Não autorizado.");

  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["HGETALL", TOTALS_KEY],
      ["LRANGE", EVENTS_KEY, -SHOWN_EVENTS, -1],
      ["LLEN", EVENTS_KEY],
    ]),
  });
  if (!response.ok) return res.status(502).send("Falha ao consultar o banco.");

  const [totalsRes, eventsRes, lenRes] = await response.json();
  const flat = totalsRes.result || [];
  const totals = {};
  for (let i = 0; i < flat.length; i += 2) totals[flat[i]] = Number(flat[i + 1]);

  const events = (eventsRes.result || [])
    .map((e) => {
      try {
        return JSON.parse(e);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();

  if (req.query && req.query.format === "json") {
    return res.status(200).json({ totals, total: lenRes.result, events });
  }

  const totalRows = Object.keys(totals)
    .sort()
    .map((k) => {
      const [app, type] = k.split(":");
      return `<tr><td>${esc(app)}</td><td>${esc(LABELS[type] || type)}</td><td>${totals[k]}</td></tr>`;
    })
    .join("");

  const eventRows = events
    .map(
      (e) =>
        `<tr><td>${esc(fmt(e.t))}</td><td>${esc(e.app)}</td><td>${esc(LABELS[e.type] || e.type)}</td></tr>`,
    )
    .join("");

  const sum = Object.values(totals).reduce((a, b) => a + b, 0);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Estatísticas LTS</title>
<style>
body{background:#0f0f11;color:#ececec;font-family:Calibri,sans-serif;margin:0;padding:24px;max-width:900px;margin:0 auto}
h1,h2{color:#fbb91a}
table{width:100%;border-collapse:collapse;margin-bottom:32px;background:#1e1f23}
th,td{padding:8px 12px;border-bottom:1px solid #3b3d44;text-align:left}
th{background:#3a3c42}
</style></head><body>
<h1>Estatísticas LTS</h1>
<h2>Total: ${sum}</h2>
<table><tr><th>App</th><th>Ação</th><th>Quantidade</th></tr>${totalRows}</table>
<h2>Últimos ${events.length} eventos (horário de Brasília)</h2>
<table><tr><th>Data e hora</th><th>App</th><th>Ação</th></tr>${eventRows}</table>
</body></html>`);
};
