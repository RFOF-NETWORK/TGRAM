export async function routeToToncenter(endpoint, apiKey = "") {
  const base = "https://toncenter.com";
  const headers = {
    "Accept": "application/json",
    "User-Agent": "TGRAM-Serverless-Proxy/1.0"
  };
  if (apiKey) headers["X-API-Key"] = apiKey;
  const res = await fetch(base + endpoint, { headers });
  return res.json();
}
