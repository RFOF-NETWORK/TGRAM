export async function callToncenter(method, params = {}, apiKey = "") {
  const url = new URL(`https://toncenter.com{method}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, {
    headers: apiKey ? { "X-API-Key": apiKey } : {}
  });
  return res.json();
}
