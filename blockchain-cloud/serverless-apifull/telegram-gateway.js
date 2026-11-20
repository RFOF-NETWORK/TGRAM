export async function sendTelegramMessage(botToken, chatId, text) {
  const res = await fetch(`https://telegram.org{botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  return res.json();
}
