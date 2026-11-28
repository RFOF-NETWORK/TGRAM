// Sets the bot's profile photo via Bot API setMyProfilePhoto.
// Usage: TELEGRAM_BOT_TOKEN=... node scripts/set-bot-avatar.mjs [path/to/640x640.jpg]
// Telegram requires a static JPG; 640x640 is the size it stores (it derives 320 and 160).
import { readFile } from "node:fs/promises";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN fehlt");
  process.exit(1);
}

const file = process.argv[2] || new URL("../assets/bot/avatar-640.jpg", import.meta.url);
const bytes = await readFile(file);

const form = new FormData();
form.append("photo", JSON.stringify({ type: "static", photo: "attach://avatar" }));
form.append("avatar", new Blob([bytes], { type: "image/jpeg" }), "avatar.jpg");

const res = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, { method: "POST", body: form });
const json = await res.json();
console.log(json.ok ? "Bot-Avatar gesetzt" : `Fehler: ${json.description}`);
process.exit(json.ok ? 0 : 1);
