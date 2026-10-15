/*
┏━━━━━━━━━━━━━━━┓
┃  DENTSU MINI BOT
┣━━━━━━━━━━━━━━━┛
┃whatsapp : +242065141056
┃owner : DENTSU MINI BOT
┃Dev : NatsuTech's Dev 🇨🇬
┗━━━━━━━━━━━━━━━┛
*/


// Le bot Telegram sert UNIQUEMENT à connecter le bot à WhatsApp.


const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const config = require("../config");
const { buildTelegramMenu, uptime } = require("../menu");
const { startWhatsApp, stopWhatsApp, listPaired, sendWhatsAppBan, broadcastFromTelegram } = require("./whatsapp");

const startTime = Date.now();
// État pairing en attente par chat
const pairingStates = new Map();

// Vérifie qu'un user Telegram est admin du bot
const isAdmin = (id) => config.TELEGRAM_ADMINS.includes(Number(id));

function isValidLocalPhoto(filePath) {
  try {
    const header = fs.readFileSync(filePath).subarray(0, 12);
    const isJpeg = header.length >= 3 &&
      header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isPng = header.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const isWebp = header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WEBP";
    return isJpeg || isPng || isWebp;
  } catch {
    return false;
  }
}

function getMenuPhotoSources() {
  const sources = [];
  if (isValidLocalPhoto(config.MENU_IMAGE)) {
    sources.push(config.MENU_IMAGE);
  } else {
    console.warn("⚠️ Local menu image is missing or invalid; using fallback.");
  }
  if (config.MENU_IMAGE_FALLBACK) {
    sources.push(config.MENU_IMAGE_FALLBACK);
  }
  return sources.length ? sources : [config.MENU_IMAGE];
}

async function sendMenuPhoto(bot, chatId, options) {
  let lastError;
  for (const source of [...new Set(getMenuPhotoSources())]) {
    try {
      return await bot.sendPhoto(chatId, source, options);
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Telegram photo source failed: ${source}`, error.message);
    }
  }
  throw lastError;
}

function startTelegram() {
  if (!config.TELEGRAM_TOKEN || config.TELEGRAM_TOKEN.includes("PUT_YOUR")) {
    console.log("⚠️  TELEGRAM_BOT_TOKEN missing. Telegram bot not started.");
    return null;
  }

  const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });
  console.log("🤖 Telegram bot started.");

  // ── /start & /help & /menu : link-preview (1ère photo) + photo principale ──
  const sendStart = async (msg) => {
    const chatId = msg.chat.id;
    const caption = buildTelegramMenu();
    const keyboard = {
      inline_keyboard: [
        [{ text: "📣 Telegram", url: config.LINKS.telegramChannel }],
        [{ text: "📣 WhatsApp", url: config.LINKS.whatsappChannel }],
        [{ text: "🫂 Groupe",   url: config.LINKS.whatsappGroup }],
      ],
    };
    try {
      // Une seule réponse : photo + menu (sans la carte d'aperçu).
      if (caption.length <= 1024) {
        await sendMenuPhoto(bot, chatId, {
          caption,
          parse_mode: undefined,
          reply_markup: keyboard,
        });
      } else {
        await sendMenuPhoto(bot, chatId, {
          caption: `⫷ ${config.BOT_NAME} ${config.VERSION} ⫸\n👨‍💻 ${config.DEV}`,
        });
        await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
      }
    } catch (e) {
      console.error("❌ Telegram menu photo failed:", e.message);
      await bot.sendMessage(
        chatId,
        `⚠️ Menu image unavailable.\n\n${caption}`,
        { reply_markup: keyboard },
      );
    }
  };

  bot.onText(/^\/start$/, sendStart);
  bot.onText(/^\/help$/, sendStart);
  bot.onText(/^\/menu$/, sendStart);

  // ── /ping ─────────────────────────────────────────────────────
  bot.onText(/^\/ping$/, (msg) => {
    const t = Date.now();
    bot.sendMessage(msg.chat.id, "🏓 Pong!").then((s) =>
      bot.editMessageText(`🏓 Pong! ${Date.now() - t} ms`, {
        chat_id: msg.chat.id,
        message_id: s.message_id,
      }),
    );
  });

  // ── /runtime ──────────────────────────────────────────────────
  bot.onText(/^\/runtime$/, (msg) =>
    bot.sendMessage(msg.chat.id, `⏱ *Uptime:* ${uptime((Date.now() - startTime) / 1000)}`, {
      parse_mode: "Markdown",
    }),
  );

  // ── /getmyid ──────────────────────────────────────────────────
  bot.onText(/^\/getmyid$/, (msg) =>
    bot.sendMessage(msg.chat.id, `🆔 Your Telegram ID: \`${msg.from.id}\``, {
      parse_mode: "Markdown",
    }),
  );

  // ── /howtouse ─────────────────────────────────────────────────
  bot.onText(/^\/howtouse$/, (msg) =>
    bot.sendMessage(
      msg.chat.id,
      `📖 *How to use ${config.BOT_NAME}*

1️⃣ Send \`/pair <your number>\` (international format, no +)
2️⃣ The bot will send you an 8-digit code
3️⃣ Open WhatsApp → *Linked Devices* → *Link with phone number*
4️⃣ Enter the code shown here

🔁 To unlink: \`/delpair <your number>\`
ℹ️ Check status: \`/checkdevice\``,
      { parse_mode: "Markdown" },
    ),
  );

  // ── /checkdevice ──────────────────────────────────────────────
  bot.onText(/^\/checkdevice$/, (msg) => {
    const list = listPaired();
    bot.sendMessage(
      msg.chat.id,
      list.length
        ? `✅ Active sessions: *${list.length}*\n\n${list.map((n) => "• +" + n).join("\n")}`
        : "❌ No active WhatsApp session.",
      { parse_mode: "Markdown" },
    );
  });

  // ── /listpair (admin) ─────────────────────────────────────────
  bot.onText(/^\/listpair$/, (msg) => {
    if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, "❌ Admin only.");
    const list = listPaired();
    bot.sendMessage(
      msg.chat.id,
      list.length
        ? `📋 *Paired sessions (${list.length})*\n${list.map((n) => "• +" + n).join("\n")}`
        : "❌ No paired sessions.",
      { parse_mode: "Markdown" },
    );
  });

  // ── /pair <number> ────────────────────────────────────────────
  bot.onText(/^\/pair(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const num = (match[1] || "").replace(/\D/g, "");
    if (!num) {
      pairingStates.set(chatId, { awaiting: true });
      return bot.sendMessage(chatId, "📱 Send your WhatsApp number (international format, e.g. `24206XXXXXX`)", { parse_mode: "Markdown" });
    }
    await launchPairing(bot, chatId, num);
  });

  // ── /delpair <number> ─────────────────────────────────────────
  bot.onText(/^\/delpair(?:\s+(.+))?/, async (msg, match) => {
    const num = (match[1] || "").replace(/\D/g, "");
    if (!num) return bot.sendMessage(msg.chat.id, "❌ Usage: `/delpair 242xxxxxxxx`", { parse_mode: "Markdown" });
    try {
      await stopWhatsApp(num);
      await bot.sendMessage(msg.chat.id, `✅ Session for *+${num}* deleted.`, { parse_mode: "Markdown" });
    } catch (e) {
      await bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
    }
  });

  // ── GROUP MANAGER commands (info pour le user) ────────────────
  const groupHelp = (cmd) => `ℹ️ \`/${cmd}\` is a *WhatsApp* group command. Use it inside a WhatsApp group where ${config.BOT_NAME} is connected, with prefix \`${config.PREFIX}\` (example: \`${config.PREFIX}${cmd}\`).`;
  ["promote", "mute", "getalladmins", "groupinfo", "tagadmin", "tagall"].forEach((c) => {
    bot.onText(new RegExp(`^/${c}$`), (msg) =>
      bot.sendMessage(msg.chat.id, groupHelp(c), { parse_mode: "Markdown" }),
    );
  });

  // ── /ban (admin) : envoie des warnings sur WhatsApp ──────────
  // Usage: /ban <numero_whatsapp> [count]
  // Le numéro est un numéro WhatsApp (format international sans +),
  // PAS un Telegram chat_id. Exemple : /ban 24206XXXXXX 20
  bot.onText(/^\/ban(?:\s+(\S+))?(?:\s+(\d+))?$/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, "❌ Admin only.");
    const rawTarget = match[1];
    const target = (rawTarget || "").replace(/\D/g, "");
    const count = Math.min(parseInt(match[2] || "20", 10), 100);
    if (!target) {
      return bot.sendMessage(
        msg.chat.id,
        "⚖️ *BAN — anti-abuse (WhatsApp)*\nUsage: `/ban <whatsapp_number> [count]`\nExample: `/ban 24206XXXXXX 20`\n\nSends a warning spam to a WhatsApp account that breaks the terms of service.\nAdmin only.",
        { parse_mode: "Markdown" },
      );
    }
    if (target.length < 8) {
      return bot.sendMessage(msg.chat.id, "❌ Invalid WhatsApp number (international format without +).");
    }
    await bot.sendMessage(msg.chat.id, `🚨 Ban WhatsApp \`+${target}\` (${count} warnings)...`, { parse_mode: "Markdown" });
    try {
      const ok = await sendWhatsAppBan(target, count);
      await bot.sendMessage(msg.chat.id, `✅ Delivered ${ok}/${count} warnings to *+${target}* on WhatsApp.`, { parse_mode: "Markdown" });
    } catch (e) {
      await bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
    }
  });

  // ── /owner ────────────────────────────────────────────────────
  bot.onText(/^\/owner$/, (msg) =>
    bot.sendMessage(msg.chat.id, `👨‍💻 *Dev:* ${config.DEV}\n📞 +${config.OWNERS.join(" , +")}`, {
      parse_mode: "Markdown",
    }),
  );

  // ── /broadcast (admin) : send a message to ALL active WA groups ──
  bot.onText(/^\/broadcast(?:\s+([\s\S]+))?$/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, "❌ Admin only.");
    const text = (match[1] || "").trim();
    if (!text) {
      return bot.sendMessage(
        msg.chat.id,
        "📢 *BROADCAST*\nUsage: `/broadcast <your message>`\n\nSends the message to every WhatsApp group the bot is in.\nAdmin only.",
        { parse_mode: "Markdown" },
      );
    }
    await bot.sendMessage(msg.chat.id, "📡 Broadcasting on WhatsApp...");
    try {
      const ok = await broadcastFromTelegram(text);
      await bot.sendMessage(msg.chat.id, `✅ Delivered to *${ok}* WhatsApp group(s).`, { parse_mode: "Markdown" });
    } catch (e) {
      await bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
    }
  });


  // ── Catch numéro libre après bouton "Connect WhatsApp" ────────
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const state = pairingStates.get(msg.chat.id);
    if (!state?.awaiting) return;
    const num = msg.text.replace(/\D/g, "");
    if (num.length < 8) return bot.sendMessage(msg.chat.id, "❌ Invalid number.");
    pairingStates.delete(msg.chat.id);
    await launchPairing(bot, msg.chat.id, num);
  });

  return bot;
}

// Lance le pairing WhatsApp et renvoie le code à l'utilisateur Telegram
async function launchPairing(bot, chatId, phoneNumber) {
  await bot.sendMessage(chatId, `⏳ Generating pairing code for *+${phoneNumber}* ...`, { parse_mode: "Markdown" });
  try {
    await startWhatsApp({
      phoneNumber,
      authSubdir: phoneNumber,
      onPairingCode: async (code, err) => {
        if (err || !code) {
          return bot.sendMessage(chatId, `❌ Pairing error: ${err?.message || "code not generated"}`);
        }
        await bot.sendMessage(
          chatId,
          `✅ *WhatsApp pairing code*\n\n🔑 \`${code}\`\n\n📲 Open WhatsApp → *Linked Devices* → *Link a device* → *Link with phone number* → enter the code.\n\n⚠️ Code valid for ~60s.`,
          { parse_mode: "Markdown" },
        );
      },
    });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

module.exports = { startTelegram };
