export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { endpoint, ...query } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint obrigatório" });
  }

  const base =
    "https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata";

  function buildUrl(q) {
    const qs = Object.entries(q)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return `${base}/${endpoint}?${qs}`;
  }

  async function tryFetch(q, attempt = 1) {
    const url = buildUrl(q);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const r = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });

      clearTimeout(timeout);
      const text = await r.text();

      if (r.ok) {
        return { ok: true, text, url };
      }

      // Se erro 500 → tenta fallback
      if (r.status === 500 && attempt <= 3) {
        console.warn("BCB 500 → tentativa", attempt);

        // Estratégia de fallback
        if (attempt === 1 && q.$top && Number(q.$top) > 100) {
          return tryFetch({ ...q, $top: 100 }, 2);
        }

        if (attempt === 2 && q.$select) {
          const { $select, ...rest } = q;
          return tryFetch(rest, 3);
        }

        if (attempt === 3 && q.$filter) {
          // tenta limpar filtro (às vezes quebra encoding)
          return tryFetch({ ...q, $filter: String(q.$filter) }, 4);
        }
      }

      return {
        ok: false,
        status: r.status,
        text,
        url
      };

    } catch (err) {
      if (attempt <= 2) {
        return tryFetch(q, attempt + 1);
      }

      return {
        ok: false,
        status: 500,
        text: String(err),
        url
      };
    }
  }

  try {
    const result = await tryFetch(query);

    if (!result.ok) {
      return res.status(result.status || 500).json({
        error: "Erro BCB",
        status: result.status,
        url: result.url,
        response: result.text
      });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(result.text);

  } catch (err) {
    return res.status(500).json({
      error: "Erro proxy",
      detail: String(err)
    });
  }
}
