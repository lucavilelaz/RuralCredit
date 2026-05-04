export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { endpoint, ...query } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: "Informe endpoint" });
  }

  const base = "https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata";
  const params = new URLSearchParams(query);

  if (!params.has("$format")) {
    params.set("$format", "json");
  }

  const url = `${base}/${endpoint}?${params.toString().replace(/\+/g, "%20")}`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    res.status(r.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(text);
  } catch (err) {
    return res.status(500).json({
      error: "Erro ao consultar BCB",
      detail: String(err)
    });
  }
}
