export default async function handler(req, res) {
  const { endpoint, ...query } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint obrigatório" });
  }

  const base = "https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata";

  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `${base}/${endpoint}?${qs}`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    res.status(r.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(text);
  } catch (e) {
    res.status(500).json({ error: String(e), url });
  }
}
