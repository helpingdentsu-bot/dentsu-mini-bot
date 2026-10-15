/*
┏━━━━━━━━━━━━━━━┓
┃  DENTSU MINI BOT
┣━━━━━━━━━━━━━━━┛
┃whatsapp : +242065141056
┃owner : DENTSU MINI BOT
┃Dev : NatsuTech's Dev 🇨🇬
┗━━━━━━━━━━━━━━━┛
*/

// Point d'entrée principal.
// - Démarre le bot Telegram (qui sert à connecter WhatsApp)
// - Reprend automatiquement les sessions WhatsApp déjà appairées
require("dotenv").config();

const fs = require("fs");
const path = require("path");

// Charge le registre principal puis les commandes additionnelles (~410 cmds)
require("./commands");
require("./commands_extra");

// Page web publique pour le pairing WhatsApp (Telegram reste disponible).
require("./lib/web").startWebServer();
require("./lib/telegram").startTelegram();

// Reprise auto des sessions existantes
const authRoot = path.join(__dirname, "auth_info");
if (fs.existsSync(authRoot)) {
  for (const sub of fs.readdirSync(authRoot)) {
    const creds = path.join(authRoot, sub, "creds.json");
    if (fs.existsSync(creds)) {
      console.log("🔁 Resuming WhatsApp session:", sub);
      require("./lib/whatsapp").startWhatsApp({ authSubdir: sub, phoneNumber: sub });
    }
  }
}

process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

console.log(`
╔════════════════════════════════╗
║   DENTSU MINI BOT - NatsuTech's Dev ║
║   WhatsApp × Telegram          ║
╚════════════════════════════════╝
`);
