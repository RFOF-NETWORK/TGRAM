export async function queryTonConsole(endpoint = "/v2/status", apiKey) {
  const res = await fetch(`https://tonapi.io${endpoint}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });
  return res.json();
}
