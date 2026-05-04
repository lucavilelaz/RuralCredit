export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { endpoint, ...query } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint obrigatório" });
  }

  const base =
    "https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata";

  // monta query string corretamente (evita problema com +)
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `${base}/${endpoint}?${qs}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s

    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    clearTimeout(timeout);

    const text = await r.text();

    // retorna erro REAL do BCB (isso ajuda muito debug)
    if (!r.ok) {
      return res.status(r.status).json({
        error: "Erro BCB",
        status: r.status,
        url,
        response: text
      });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(text);

  } catch (err) {
    return res.status(500).json({
      error: "Erro no proxy Vercel",
      detail: String(err),
      url
    });
  }
}
