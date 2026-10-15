/*
┏━━━━━━━━━━━━━━━┓
┃  DENTSU MINI BOT
┣━━━━━━━━━━━━━━━┛
┃whatsapp : +242065141056
┃owner : DENTSU MINI BOT
┃Dev : NatsuTech's Dev 🇨🇬
┗━━━━━━━━━━━━━━━┛
*/


const axios = require("axios");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const config = require("./config");
const main = require("./commands");

const REGISTRY = main.REGISTRY;
const CATEGORIES = main.CATEGORIES;
const ax = axios.create({ timeout: 60000 });

function reg(names, handler, category = "MISC", desc = "") {
  for (const n of [].concat(names)) {
    REGISTRY[n] = { handler, category, desc, name: n };
    (CATEGORIES[category] = CATEGORIES[category] || []).push(n);
  }
}

let ffmpegAvailable;
function hasFfmpeg() {
  if (ffmpegAvailable !== undefined) return ffmpegAvailable;
  try {
    ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 2000 }).status === 0;
  } catch { ffmpegAvailable = false; }
  return ffmpegAvailable;
}

function quotedWAMessage(ctx) {
  const info = ctx.m.message?.extendedTextMessage?.contextInfo;
  if (!info?.quotedMessage) return null;
  const botId = (ctx.natsu.user?.id || "").split(":")[0].toLowerCase();
  const quotedSender = (info.participant || "").split(":")[0].toLowerCase();
  return {
    key: {
      remoteJid: info.remoteJid || ctx.jid,
      id: info.stanzaId,
      fromMe: Boolean(botId && quotedSender && botId === quotedSender),
      ...(info.participant ? { participant: info.participant } : {}),
    },
    message: info.quotedMessage,
  };
}

function unwrapQuotedContent(message) {
  let content = message;
  let viewOnce = false;
  for (let depth = 0; depth < 8 && content; depth += 1) {
    const wrapperKey = [
      "ephemeralMessage",
      "viewOnceMessage",
      "viewOnceMessageV2",
      "viewOnceMessageV2Extension",
      "documentWithCaptionMessage",
    ].find((key) => content[key]?.message);
    if (!wrapperKey) break;
    if (wrapperKey.startsWith("viewOnce")) viewOnce = true;
    content = content[wrapperKey].message;
  }
  for (const key of ["imageMessage", "videoMessage", "audioMessage", "documentMessage"]) {
    if (content?.[key]?.viewOnce === true) viewOnce = true;
  }
  return { content, viewOnce };
}

async function downloadQuotedMedia(ctx, quoted) {
  const { downloadMediaMessage } = require("@whiskeysockets/baileys");
  return downloadMediaMessage(quoted, "buffer", {}, {
    logger: ctx.natsu.logger,
    reuploadRequest: (message) => ctx.natsu.updateMediaMessage(message),
  });
}

function convertToMp3(input) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
      "-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let outputBytes = 0;
    let stderr = "";
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    ffmpeg.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 24 * 1024 * 1024) {
        ffmpeg.kill("SIGKILL");
        return fail(new Error("Converted audio exceeds the 24 MB limit."));
      }
      chunks.push(chunk);
    });
    ffmpeg.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    ffmpeg.on("error", fail);
    ffmpeg.on("close", (code) => {
      if (settled) return;
      if (code === 0 && outputBytes) {
        settled = true;
        resolve(Buffer.concat(chunks));
      } else {
        fail(new Error(stderr.trim() || `ffmpeg exited with code ${code}.`));
      }
    });
    ffmpeg.stdin.on("error", () => {});
    ffmpeg.stdin.end(input);
  });
}

async function sendImg(ctx, url, caption = "") {
  await ctx.natsu.sendMessage(ctx.jid, { image: { url }, caption, contextInfo: config.contextInfo }, { quoted: ctx.m });
}

// ════════════════════════════════════════════════════════════════
// 👑 OWNER
// ════════════════════════════════════════════════════════════════
reg("pair", async (ctx) => {
  const num = (ctx.text || "").replace(/[^0-9]/g, "");
  if (!num || num.length < 8) {
    return ctx.reply({ text:
`👑 *PAIR* — Connect to WhatsApp\n\n` +
`📲 Usage: *${config.PREFIX}pair <number>*\n` +
`   Example: ${config.PREFIX}pair 242066123456\n` +
`   (international format, no +)\n\n` +
`💞 No Telegram needed — you can connect right here from WhatsApp.\n` });
  }
  await ctx.reply({ text: `⏳ Generating pairing code for *+${num}* ...` });
  try {
    const { startWhatsApp } = require("./lib/whatsapp");
    await startWhatsApp({
      phoneNumber: num,
      authSubdir: num,
      onPairingCode: async (code, err) => {
        if (err || !code) {
          return ctx.reply({ text: `❌ Pairing error: ${err?.message || "code not generated"}` });
        }
        await ctx.reply({ text:
`✅ *WhatsApp pairing code*\n\n` +
`🔑 ${code}\n\n` +
`📲 Open WhatsApp → *Linked Devices* → *Link a device* → *Link with phone number* → enter the code.\n\n` +
`⚠️ Code valid for ~60s.` });
      },
    });
  } catch (e) {
    await ctx.reply({ text: `❌ Error: ${e.message}` });
  }
}, "OWNER", "Get a WhatsApp connection code");

reg("setpp", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  const q = ctx.m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q?.imageMessage) return ctx.reply({ text: "❌ Reply to an image with .setpp" });
  try {
    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
    const buf = await downloadMediaMessage({ message: q }, "buffer", {});
    await ctx.natsu.updateProfilePicture(ctx.natsu.user.id, buf);
    await ctx.reply({ text: "✅ Profile picture updated 💕" });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "OWNER", "Change profile picture");


reg("ban", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  const target = ctx.m.message?.extendedTextMessage?.contextInfo?.participant ||
                 ctx.m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!target) return ctx.reply({ text: "❌ Mention or reply to the target." });
  try { await ctx.natsu.updateBlockStatus(target, "block"); await ctx.reply({ text: "🚫 Banni." }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "OWNER", "Ban a user");

reg("unban", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  const target = ctx.m.message?.extendedTextMessage?.contextInfo?.participant ||
                 ctx.m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!target) return ctx.reply({ text: "❌ Mention the target." });
  try { await ctx.natsu.updateBlockStatus(target, "unblock"); await ctx.reply({ text: "✅ Unbanned." }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "OWNER", "Unban");

reg("block", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  const t = ctx.m.message?.extendedTextMessage?.contextInfo?.participant || ctx.jid;
  try { await ctx.natsu.updateBlockStatus(t, "block"); await ctx.reply({ text: "🚫 Blocked." }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "OWNER", "Block");

reg("unblock", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  const t = ctx.m.message?.extendedTextMessage?.contextInfo?.participant || ctx.jid;
  try { await ctx.natsu.updateBlockStatus(t, "unblock"); await ctx.reply({ text: "✅ Unblocked." }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "OWNER", "Unblock");

let SELF_MODE = false;
reg("self", (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  SELF_MODE = true;
  ctx.reply({ text: "🔒 *SELF* mode enabled — only the owner can use the bot." });
}, "OWNER", "Mode self");

reg("public", (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  SELF_MODE = false;
  ctx.reply({ text: "🌍 *PUBLIC* mode enabled — everyone can use the bot 💕" });
}, "OWNER", "Mode public");

reg("speed", async (ctx) => {
  const t = Date.now();
  const r = await ctx.reply({ text: "⚡ Mesure..." });
  await ctx.natsu.sendMessage(ctx.jid, { text: `⚡ Speed: ${Date.now()-t} ms`, edit: r.key });
}, "OWNER", "Speed");

reg(["bc", "broadcast"], async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  if (!ctx.text) return ctx.reply({ text: "❌ .bc <message>" });
  try {
    const chats = await ctx.natsu.groupFetchAllParticipating();
    let n = 0;
    for (const id of Object.keys(chats)) {
      try { await ctx.natsu.sendMessage(id, { text: `📢 *BROADCAST*\n\n${ctx.text}`, contextInfo: config.contextInfo }); n++; } catch {}
    }
    await ctx.reply({ text: `✅ Sent to ${n} groups 💕` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "OWNER", "Broadcast");

reg("restart", (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  ctx.reply({ text: "♻️ Restarting..." });
  setTimeout(() => process.exit(0), 1500);
}, "OWNER", "Restart");

// ════════════════════════════════════════════════════════════════
// 👥 GROUP
// ════════════════════════════════════════════════════════════════
function isAdminCheck(meta, jid) {
  const p = meta.participants.find((x) => x.id === jid);
  return p && (p.admin === "admin" || p.admin === "superadmin");
}

// Guard used by every group-admin command.
// Allows the group admins AND the bot owner. Same simple structure as open/close.
function requireGroupAdmin(ctx) {
  if (!ctx.isGroup) { ctx.reply({ text: "❌ Group only." }); return false; }
  if (!ctx.isAdmin && !ctx.isOwner) { ctx.reply({ text: "❌ Admins only." }); return false; }
  return true;
}

async function groupAction(ctx, action) {
  if (!requireGroupAdmin(ctx)) return;
  const ctxInfo = ctx.m.message?.extendedTextMessage?.contextInfo;
  let target = ctxInfo?.mentionedJid?.[0] || ctxInfo?.participant;
  if (!target && ctx.text) {
    const num = ctx.text.replace(/\D/g, "");
    if (num.length >= 8) target = num + "@s.whatsapp.net";
  }
  if (!target) return ctx.reply({ text: `❌ Mention or reply to the target for *${action}*.` });
  try {
    await ctx.natsu.groupParticipantsUpdate(ctx.jid, [target], action);
    await ctx.reply({ text: `✅ *${action}* done.` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}

reg(["kick","k"], (ctx) => groupAction(ctx, "remove"), "GROUP", "Kick user");
reg(["promote","p"], (ctx) => groupAction(ctx, "promote"), "GROUP", "Promote");
reg(["demote","d"], (ctx) => groupAction(ctx, "demote"), "GROUP", "Demote");
reg(["add","invite"], (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const num = (ctx.text || "").replace(/\D/g, "");
  if (!num) return ctx.reply({ text: "❌ .add 242xxxxxxxx" });
  ctx.natsu.groupParticipantsUpdate(ctx.jid, [num + "@s.whatsapp.net"], "add")
    .then(() => ctx.reply({ text: "✅ Added." }))
    .catch((e) => ctx.reply({ text: `❌ ${e.message}` }));
}, "GROUP", "Add member");

reg(["delete","del","dlt"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const q = ctx.m.message?.extendedTextMessage?.contextInfo;
  if (!q?.stanzaId) return ctx.reply({ text: "❌ Reply to the message to delete." });
  try {
    await ctx.natsu.sendMessage(ctx.jid, {
      delete: {
        remoteJid: ctx.jid,
        fromMe: false,
        id: q.stanzaId,
        participant: q.participant,
      },
    });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Delete a message");

reg(["mute","close"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  try { await ctx.natsu.groupSettingUpdate(ctx.jid, "announcement"); await ctx.reply({ text: "🔒 Group closed 💕" }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Close the group");

reg(["unmute","open"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  try { await ctx.natsu.groupSettingUpdate(ctx.jid, "not_announcement"); await ctx.reply({ text: "🔓 Group opened " }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Open the group");

reg(["hidetag","htag","ht"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const meta = await ctx.natsu.groupMetadata(ctx.jid);
  await ctx.natsu.sendMessage(ctx.jid, {
    text: ctx.text || "📢",
    mentions: meta.participants.map((p) => p.id),
    contextInfo: config.contextInfo,
  });
}, "GROUP", "Hidden tag");

reg(["tag","tagall"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const meta = await ctx.natsu.groupMetadata(ctx.jid);
  const mentions = meta.participants.map((p) => p.id);
  const txt = `📢 *${ctx.text || "TAG ALL"}*\n\n` + meta.participants.map((p,i)=>`${i+1}. @${p.id.split("@")[0]}`).join("\n");
  await ctx.natsu.sendMessage(ctx.jid, { text: txt, mentions, contextInfo: config.contextInfo });
}, "GROUP", "Tag everyone");

reg(["listadmins","tagadmin","admins"], async (ctx) => {
  if (!ctx.isGroup) return ctx.reply({ text: "❌ Group only." });
  const meta = await ctx.natsu.groupMetadata(ctx.jid);
  const admins = meta.participants.filter((p) => p.admin).map((p) => p.id);
  await ctx.natsu.sendMessage(ctx.jid, {
    text: `👑 *Admins*\n\n${admins.map((a)=>`• @${a.split("@")[0]}`).join("\n")}`,
    mentions: admins, contextInfo: config.contextInfo,
  });
}, "GROUP", "List admins");

reg(["members","membercount","listonline","online"], async (ctx) => {
  if (!ctx.isGroup) return ctx.reply({ text: "❌ Group only." });
  const meta = await ctx.natsu.groupMetadata(ctx.jid);
  await ctx.reply({ text: `👥 ${meta.participants.length} group members. WhatsApp does not provide a reliable full online-member list here.` });
}, "GROUP", "Group member count");

reg(["closetime"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const sec = parseInt(ctx.text); if (!sec) return ctx.reply({ text: "❌ .closetime 60 (in seconds)" });
  await ctx.reply({ text: `⏰ Group will close in ${sec}s` });
  setTimeout(() => ctx.natsu.groupSettingUpdate(ctx.jid, "announcement").catch(()=>{}), sec*1000);
}, "GROUP", "Auto close");

reg(["opentime"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const sec = parseInt(ctx.text); if (!sec) return ctx.reply({ text: "❌ .opentime 60" });
  await ctx.reply({ text: `⏰ Group will open in ${sec}s` });
  setTimeout(() => ctx.natsu.groupSettingUpdate(ctx.jid, "not_announcement").catch(()=>{}), sec*1000);
}, "GROUP", "Auto open");

reg(["grouplink","link","glink"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  try { const code = await ctx.natsu.groupInviteCode(ctx.jid); await ctx.reply({ text: `🔗 https://chat.whatsapp.com/${code}` }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Invite link");

reg(["resetlink","revoke"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  try { const code = await ctx.natsu.groupRevokeInvite(ctx.jid); await ctx.reply({ text: `🔄 New link: https://chat.whatsapp.com/${code}` }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Reset link");

reg(["left","leave"], async (ctx) => {
  if (!ctx.isGroup) return ctx.reply({ text: "❌ Group only." });
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  await ctx.reply({ text: "👋 Bye bye 💕" });
  await ctx.natsu.groupLeave(ctx.jid);
}, "GROUP", "Leave group");

reg(["join"], async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  const code = (ctx.text.match(/chat\.whatsapp\.com\/([\w\d]+)/) || [])[1] || ctx.text;
  try { await ctx.natsu.groupAcceptInvite(code); await ctx.reply({ text: "✅ Joined." }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Join group");

reg(["creategroup","newgroup"], async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  if (!ctx.text) return ctx.reply({ text: "❌ .creategroup <name>" });
  try { const g = await ctx.natsu.groupCreate(ctx.text, [ctx.jid]); await ctx.reply({ text: `✅ Group created: ${g.id}` }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Create a group");

reg(["gname","setname"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  if (!ctx.text) return ctx.reply({ text: "❌ .gname <new name>" });
  try { await ctx.natsu.groupUpdateSubject(ctx.jid, ctx.text); await ctx.reply({ text: "✅ Name changed 💕" }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Change the name");

reg(["gdesc","setdesc"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  if (!ctx.text) return ctx.reply({ text: "❌ .gdesc <description>" });
  try { await ctx.natsu.groupUpdateDescription(ctx.jid, ctx.text); await ctx.reply({ text: "✅ Description changed " }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Change the description");

reg(["groupinfo","ginfo","infogroup"], async (ctx) => {
  if (!ctx.isGroup) return ctx.reply({ text: "❌ Group only." });
  const meta = await ctx.natsu.groupMetadata(ctx.jid);
  await ctx.reply({ text: `╭━〔 GROUP 〕━┈⊷\n┃ 📛 ${meta.subject}\n┃ 👥 ${meta.participants.length} members\n┃ 👑 ${meta.owner||"?"}\n┃ 🆔 ${meta.id}\n┃ 📝 ${meta.desc||"—"}\n╰━━━━━━━━━━━━┈⊷` });
}, "GROUP", "Group info");

reg(["kickall"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  try {
    const meta = await ctx.natsu.groupMetadata(ctx.jid);
    const targets = meta.participants.filter((p) => !p.admin && p.id !== ctx.natsu.user.id).map((p) => p.id);
    for (const t of targets) { try { await ctx.natsu.groupParticipantsUpdate(ctx.jid, [t], "remove"); } catch {} }
    await ctx.reply({ text: `🚫 ${targets.length} members kicked.` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Kick everyone (non admins)");

reg(["kickadmins"], async (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  try {
    const meta = await ctx.natsu.groupMetadata(ctx.jid);
    const targets = meta.participants.filter((p) => p.admin === "admin").map((p) => p.id);
    for (const t of targets) { try { await ctx.natsu.groupParticipantsUpdate(ctx.jid, [t], "remove"); } catch {} }
    await ctx.reply({ text: `🚫 ${targets.length} admins kicked.` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "GROUP", "Kick admins");

// ── Antilink (delete OR kick) ─────────────────────────────────
const state = require("./lib/state");
reg(["antilink"], (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const sub = (ctx.args[0] || "").toLowerCase();
  if (sub === "on")     { state.setAntilink(ctx.jid, "delete"); return ctx.reply({ text: "🔒 Antilink *ON* — links will be deleted." }); }
  if (sub === "off")    { state.setAntilink(ctx.jid, "off");    return ctx.reply({ text: "🔓 Antilink *OFF*." }); }
  const cur = state.getAntilink(ctx.jid);
  ctx.reply({ text: `🔗 Antilink current mode: *${cur.toUpperCase()}*\n\nUsage:\n• ${config.PREFIX}antilink on   — delete links\n• ${config.PREFIX}antilink off  — disable\n• ${config.PREFIX}antilinkkick on/off — delete + kick the sender` });
}, "GROUP", "Anti-link delete on/off");

reg(["antilinkkick"], (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const sub = (ctx.args[0] || "").toLowerCase();
  if (sub === "on")  { state.setAntilink(ctx.jid, "kick"); return ctx.reply({ text: "🚫 Antilink-Kick *ON* — link senders will be kicked." }); }
  if (sub === "off") { state.setAntilink(ctx.jid, "off");  return ctx.reply({ text: "🔓 Antilink-Kick *OFF*." }); }
  ctx.reply({ text: `Usage: ${config.PREFIX}antilinkkick on  /  ${config.PREFIX}antilinkkick off` });
}, "GROUP", "Anti-link kick on/off");

reg(["welcome"], (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const sub = (ctx.args[0] || "").toLowerCase();
  if (sub === "on")  { state.setWelcome(ctx.jid, true);  return ctx.reply({ text: "💕 Welcome *ON*." }); }
  if (sub === "off") { state.setWelcome(ctx.jid, false); return ctx.reply({ text: "👋 Welcome *OFF*." }); }
  ctx.reply({ text: `Usage: ${config.PREFIX}welcome on/off  —  current: *${state.isWelcomeOn(ctx.jid) ? "ON" : "OFF"}*` });
}, "GROUP", "Welcome on/off");

reg(["goodbye","bye"], (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const sub = (ctx.args[0] || "").toLowerCase();
  if (sub === "on")  { state.setGoodbye(ctx.jid, true);  return ctx.reply({ text: "💔 Goodbye *ON*." }); }
  if (sub === "off") { state.setGoodbye(ctx.jid, false); return ctx.reply({ text: "👋 Goodbye *OFF*." }); }
  ctx.reply({ text: `Usage: ${config.PREFIX}goodbye on/off  —  current: *${state.isGoodbyeOn(ctx.jid) ? "ON" : "OFF"}*` });
}, "GROUP", "Goodbye on/off");

reg(["antispam"], (ctx) => {
  if (!requireGroupAdmin(ctx)) return;
  const sub = (ctx.args[0] || "").toLowerCase();
  if (sub === "on")  { state.setAntispam(ctx.jid, true);  return ctx.reply({ text: "🛡 Antispam *ON* — flooders will be removed." }); }
  if (sub === "off") { state.setAntispam(ctx.jid, false); return ctx.reply({ text: "🔓 Antispam *OFF*." }); }
  ctx.reply({ text: `Usage: ${config.PREFIX}antispam on/off  —  current: *${state.isAntispamOn(ctx.jid) ? "ON" : "OFF"}*` });
}, "GROUP", "Antispam on/off");

reg(["spam"], async (ctx) => {
  if (!ctx.isOwner) return ctx.reply({ text: "❌ Owner only." });
  const [target, n, ...rest] = ctx.args;
  const count = Math.min(parseInt(n || "10", 10), 50);
  const txt = rest.join(" ") || "💕";
  if (!target) return ctx.reply({ text: `Usage: ${config.PREFIX}spam <number_or_jid> <count> <message>` });
  const jid = target.includes("@") ? target : `${target.replace(/\D/g,"")}@s.whatsapp.net`;
  let ok = 0;
  for (let i = 0; i < count; i++) {
    try { await ctx.natsu.sendMessage(jid, { text: `${txt} (${i+1}/${count})` }); ok++; await new Promise(r=>setTimeout(r,300)); }
    catch {}
  }
  ctx.reply({ text: `✅ ${ok}/${count} sent.` });
}, "OWNER", "Send N messages (owner)");

reg(["hijack"], (ctx) => ctx.reply({ text: "💞 hijack — disabled for your safety (anti-ban)." }), "GROUP", "Hijack (stub)");


// ════════════════════════════════════════════════════════════════
// 🛠 TOOLS — beaucoup de petits utilitaires
// ════════════════════════════════════════════════════════════════
reg(["jid","getjid"], (ctx) => ctx.reply({ text: `🆔 ${ctx.jid}` }), "TOOL", "JID actuel");
reg(["idch","chid"], (ctx) => ctx.reply({ text: `🆔 ${ctx.jid}` }), "TOOL", "ID channel/chat");
reg(["react-ch","reactch","react"], async (ctx) => {
  const e = ctx.text || "❤️";
  try { await ctx.natsu.sendMessage(ctx.jid, { react: { text: e, key: ctx.m.key } }); }
  catch (err) { await ctx.reply({ text: `❌ ${err.message}` }); }
}, "TOOL", "React");

reg(["readqr","decodeqr"], (ctx) => ctx.reply({ text: "📷 Reply to a QR image with .readqr — (server-side reading unavailable, use .qrcode to generate)" }), "TOOL", "Read QR (stub)");
reg(["qc"], (ctx) => ctx.reply({ text: ctx.text ? `💬 « ${ctx.text} »` : "❌ .qc <texte>" }), "TOOL", "Quoted chat");

reg(["translate","tr"], async (ctx) => {
  const [lang, ...rest] = ctx.args || [];
  if (!lang || !rest.length) return ctx.reply({ text: "❌ .translate fr Hello world" });
  try {
    const { data } = await ax.get(`https://api.giftedtech.web.id/api/tools/translate?apikey=gifted&text=${encodeURIComponent(rest.join(" "))}&lang=${lang}`);
    await ctx.reply({ text: `🌐 ${data?.result || "—"}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Traduction");

reg(["lyrics"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .lyrics <titre>" });
  try {
    const { data } = await ax.get(`https://api.giftedtech.web.id/api/search/lyrics?apikey=gifted&query=${encodeURIComponent(ctx.text)}`);
    await ctx.reply({ text: `🎶 *${data?.result?.title||""}*\n\n${data?.result?.lyrics||"—"}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Lyrics");

reg(["github","gh"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .github <user>" });
  try { const { data } = await ax.get(`https://api.github.com/users/${ctx.text.trim()}`);
    await ctx.reply({ text: `🐙 *${data.login}*\n👤 ${data.name||""}\n📍 ${data.location||""}\n📦 ${data.public_repos} repos\n👥 ${data.followers} followers\n🔗 ${data.html_url}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "GitHub");

reg(["npm"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .npm <package>" });
  try { const { data } = await ax.get(`https://registry.npmjs.org/${ctx.text.trim()}`);
    await ctx.reply({ text: `📦 *${data.name}*\nv${data["dist-tags"]?.latest}\n${data.description||""}\n🔗 https://npmjs.com/package/${data.name}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "NPM info");

reg(["ssweb","screenshot"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .ssweb https://example.com" });
  await sendImg(ctx, `https://image.thum.io/get/width/900/${encodeURIComponent(ctx.text)}`, `📸 ${ctx.text}`);
}, "TOOL", "Screenshot web");

reg(["color"], async (ctx) => {
  const c = (ctx.text || "").replace("#","") || crypto.randomBytes(3).toString("hex");
  await sendImg(ctx, `https://singlecolorimage.com/get/${c}/400x400`, `🎨 #${c}`);
}, "TOOL", "Color");

reg(["base64","b64"], (ctx) => ctx.reply({ text: ctx.text ? `🔐 ${Buffer.from(ctx.text).toString("base64")}` : "❌ .base64 <texte>" }), "TOOL", "Base64 encode");
reg(["base64dec","b64d"], (ctx) => {
  try { ctx.reply({ text: ctx.text ? `🔓 ${Buffer.from(ctx.text, "base64").toString("utf8")}` : "❌ .b64d <b64>" }); }
  catch (e) { ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Base64 decode");

reg(["md5"], (ctx) => ctx.reply({ text: ctx.text ? `🔐 ${crypto.createHash("md5").update(ctx.text).digest("hex")}` : "❌ .md5 <texte>" }), "TOOL", "MD5");
reg(["sha1"], (ctx) => ctx.reply({ text: ctx.text ? `🔐 ${crypto.createHash("sha1").update(ctx.text).digest("hex")}` : "❌ .sha1 <texte>" }), "TOOL", "SHA1");
reg(["sha256"], (ctx) => ctx.reply({ text: ctx.text ? `🔐 ${crypto.createHash("sha256").update(ctx.text).digest("hex")}` : "❌ .sha256 <texte>" }), "TOOL", "SHA256");
reg(["uuid"], (ctx) => ctx.reply({ text: `🆔 ${crypto.randomUUID()}` }), "TOOL", "UUID");
reg(["timestamp","ts"], (ctx) => ctx.reply({ text: `⏰ ${Date.now()}` }), "TOOL", "Timestamp");
reg(["hex"], (ctx) => ctx.reply({ text: ctx.text ? `🔢 ${Buffer.from(ctx.text).toString("hex")}` : "❌ .hex <texte>" }), "TOOL", "Hex");
reg(["bin"], (ctx) => ctx.reply({ text: ctx.text ? `🔢 ${ctx.text.split("").map(c=>c.charCodeAt(0).toString(2)).join(" ")}` : "❌ .bin <texte>" }), "TOOL", "Binaire");
reg(["ascii"], (ctx) => ctx.reply({ text: ctx.text ? `🔢 ${ctx.text.split("").map(c=>c.charCodeAt(0)).join(" ")}` : "❌ .ascii <texte>" }), "TOOL", "ASCII");
reg(["morse"], (ctx) => {
  const m = {a:".-",b:"-...",c:"-.-.",d:"-..",e:".",f:"..-.",g:"--.",h:"....",i:"..",j:".---",k:"-.-",l:".-..",m:"--",n:"-.",o:"---",p:".--.",q:"--.-",r:".-.",s:"...",t:"-",u:"..-",v:"...-",w:".--",x:"-..-",y:"-.--",z:"--.."," ":"/"};
  ctx.reply({ text: ctx.text ? `📡 ${ctx.text.toLowerCase().split("").map(c=>m[c]||"").join(" ")}` : "❌ .morse <texte>" });
}, "TOOL", "Morse");
reg(["lorem","ipsum"], (ctx) => {
  const n = Math.min(50, parseInt(ctx.text)||30);
  const w = ["lorem","ipsum","dolor","sit","amet","consectetur","adipiscing","elit","sed","do","eiusmod","tempor","incididunt","ut","labore","et","dolore","magna","aliqua"];
  ctx.reply({ text: Array.from({length:n}, ()=>w[Math.floor(Math.random()*w.length)]).join(" ") });
}, "TOOL", "Lorem ipsum");
reg(["reverse"], (ctx) => ctx.reply({ text: ctx.text ? ctx.text.split("").reverse().join("") : "❌" }), "TOOL", "Reverse");
reg(["upper","upcase"], (ctx) => ctx.reply({ text: (ctx.text||"").toUpperCase() }), "TOOL", "Upper");
reg(["lower","downcase"], (ctx) => ctx.reply({ text: (ctx.text||"").toLowerCase() }), "TOOL", "Lower");
reg(["len","length","count"], (ctx) => ctx.reply({ text: `📏 ${(ctx.text||"").length} characters, ${(ctx.text||"").trim().split(/\s+/).filter(Boolean).length} words` }), "TOOL", "Length");
reg(["slug"], (ctx) => ctx.reply({ text: (ctx.text||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") }), "TOOL", "Slug");
reg(["bold"], (ctx) => ctx.reply({ text: `*${ctx.text||""}*` }), "TOOL", "Bold");
reg(["italic"], (ctx) => ctx.reply({ text: `_${ctx.text||""}_` }), "TOOL", "Italic");
reg(["mock","spongebob"], (ctx) => ctx.reply({ text: (ctx.text||"").split("").map((c,i)=>i%2?c.toUpperCase():c.toLowerCase()).join("") }), "TOOL", "Mock");
reg(["leet","1337"], (ctx) => {
  const map = {a:"4",e:"3",i:"1",o:"0",s:"5",t:"7",l:"1"};
  ctx.reply({ text: (ctx.text||"").toLowerCase().split("").map(c=>map[c]||c).join("") });
}, "TOOL", "Leet");
reg(["fancy"], (ctx) => ctx.reply({ text: (ctx.text||"").split("").map(c=>{const i=c.toLowerCase().charCodeAt(0)-97;return i>=0&&i<26?String.fromCodePoint(0x1d4d0+i):c;}).join("") }), "TOOL", "Fancy");
reg(["smallcaps"], (ctx) => {
  const t = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  ctx.reply({ text: (ctx.text||"").toLowerCase().split("").map(c=>{const i=c.charCodeAt(0)-97;return i>=0&&i<26?t[i]:c;}).join("") });
}, "TOOL", "Small caps");
reg(["fullwidth","aesthetic"], (ctx) => ctx.reply({ text: (ctx.text||"").split("").map(c=>{const cc=c.charCodeAt(0);return cc>=33&&cc<=126?String.fromCharCode(cc+0xfee0):c;}).join("") }), "TOOL", "Aesthetic");
reg(["owoify","owo"], (ctx) => ctx.reply({ text: (ctx.text||"").replace(/r|l/g,"w").replace(/R|L/g,"W").replace(/n([aeiou])/g,"ny$1") + " owo" }), "TOOL", "OwO");
reg(["uwu"], (ctx) => ctx.reply({ text: (ctx.text||"").replace(/[rl]/g,"w").replace(/[RL]/g,"W") + " uwu" }), "TOOL", "UwU");
reg(["clap"], (ctx) => ctx.reply({ text: (ctx.text||"").split(" ").join(" 👏 ") }), "TOOL", "Clap");
reg(["space"], (ctx) => ctx.reply({ text: (ctx.text||"").split("").join(" ") }), "TOOL", "Space");
reg(["zalgo"], (ctx) => {
  const z = ["̍","̎","̄","̅","̿","̑","̆","̐","͒","͗","͑","̇","̈","̊","͂","̓","̈́","͊","͋","͌","̃","̂","̌","͐","̀","́","̋","̏","̒","̓","̔"];
  ctx.reply({ text: (ctx.text||"").split("").map(c=>c+z[Math.floor(Math.random()*z.length)]+z[Math.floor(Math.random()*z.length)]).join("") });
}, "TOOL", "Zalgo");
reg(["json"], (ctx) => { try { ctx.reply({ text: "```\n" + JSON.stringify(JSON.parse(ctx.text||"{}"), null, 2) + "\n```" }); } catch (e) { ctx.reply({ text: `❌ ${e.message}` }); } }, "TOOL", "JSON pretty");
reg(["countdown"], (ctx) => {
  const s = parseInt(ctx.text); if (!s) return ctx.reply({ text: "❌ .countdown 10" });
  let r = s; const it = setInterval(() => { r--; if (r<=0) { clearInterval(it); ctx.reply({ text: "⏰ Fini !" }); } }, 1000);
  ctx.reply({ text: `⏳ Countdown ${s}s started` });
}, "TOOL", "Countdown");

// ════════════════════════════════════════════════════════════════
// 🎮 PLAYER — mini-jeux
// ════════════════════════════════════════════════════════════════
reg(["rps"], (ctx) => {
  const choices = { rock: "rock", pierre: "rock", paper: "paper", feuille: "paper", scissors: "scissors", ciseaux: "scissors" };
  const player = choices[(ctx.text || "").trim().toLowerCase()];
  if (!player) return ctx.reply({ text: `✊✋✌️ Choose *rock*, *paper*, or *scissors*.\nExample: ${config.PREFIX}rps rock` });
  const bot = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
  const result = player === bot ? "It's a tie!" :
    ((player === "rock" && bot === "scissors") || (player === "paper" && bot === "rock") || (player === "scissors" && bot === "paper") ? "You win!" : "I win!");
  ctx.reply({ text: `✊✋✌️ You: *${player}* · Bot: *${bot}*\n${result}` });
}, "PLAYER", "Pierre feuille ciseaux");
const GUESS_GAMES = new Map();
const HANGMAN_GAMES = new Map();
const TTT_GAMES = new Map();
function gameKey(ctx) {
  const sender = ctx.m.key?.participant || ctx.m.key?.remoteJid || ctx.jid;
  return `${ctx.jid}:${sender}`;
}
reg(["guess"], (ctx) => {
  const key = gameKey(ctx);
  let game = GUESS_GAMES.get(key);
  if (!game || /^(start|new)$/i.test((ctx.text || "").trim())) {
    game = { number: 1 + Math.floor(Math.random() * 100), attempts: 0 };
    GUESS_GAMES.set(key, game);
    return ctx.reply({ text: `🔢 I'm thinking of a number from 1 to 100. Send *${config.PREFIX}guess <number>* to play.` });
  }
  const guess = Number((ctx.text || "").trim());
  if (!Number.isInteger(guess) || guess < 1 || guess > 100) {
    return ctx.reply({ text: `❌ Guess a whole number from 1 to 100, or send *${config.PREFIX}guess new* to restart.` });
  }
  game.attempts += 1;
  if (guess === game.number) {
    GUESS_GAMES.delete(key);
    return ctx.reply({ text: `🎉 Correct! It was *${guess}*. Attempts: ${game.attempts}.` });
  }
  ctx.reply({ text: `${guess < game.number ? "⬆️ Higher" : "⬇️ Lower"} — ${game.attempts} attempt(s).` });
}, "PLAYER", "Guess the number");

reg(["hangman"], (ctx) => {
  const key = gameKey(ctx);
  let game = HANGMAN_GAMES.get(key);
  const input = (ctx.text || "").trim().toLowerCase();
  if (!game || input === "start" || input === "new") {
    const words = ["baileys", "whatsapp", "dentsu", "bot", "telegram", "natsutech"];
    game = { word: words[Math.floor(Math.random() * words.length)], guessed: new Set(), wrong: 0 };
    HANGMAN_GAMES.set(key, game);
  } else {
    if (!/^[a-z]$/.test(input)) return ctx.reply({ text: `🪢 Send one letter with *${config.PREFIX}hangman <letter>* (or *new* to restart).` });
    if (game.guessed.has(input)) return ctx.reply({ text: "You already tried that letter." });
    game.guessed.add(input);
    if (!game.word.includes(input)) game.wrong += 1;
  }
  const shown = [...game.word].map((letter) => game.guessed.has(letter) ? letter : "_").join(" ");
  const won = [...game.word].every((letter) => game.guessed.has(letter));
  const lost = game.wrong >= 6;
  if (won || lost) HANGMAN_GAMES.delete(key);
  ctx.reply({
    text: `🪢 *Hangman*  ·  ${game.wrong}/6 misses\n\n${lost ? `💔 The word was *${game.word}*.` : `${shown}${won ? "\n\n🎉 You got it!" : ""}`}\n\n${won || lost ? `Start again with *${config.PREFIX}hangman*.` : `Tried: ${[...game.guessed].join(", ") || "—"}\nGuess with *${config.PREFIX}hangman <letter>*.`}`,
  });
}, "PLAYER", "Hangman");

function tttWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return board.every(Boolean) ? "draw" : null;
}
function tttBoard(board) {
  return `${board.slice(0,3).map((v,i)=>v||String(i+1)).join(" │ ")}\n───┼───┼───\n${board.slice(3,6).map((v,i)=>v||String(i+4)).join(" │ ")}\n───┼───┼───\n${board.slice(6,9).map((v,i)=>v||String(i+7)).join(" │ ")}`;
}
reg(["tictactoe","ttt"], (ctx) => {
  const key = gameKey(ctx);
  let game = TTT_GAMES.get(key);
  const input = (ctx.text || "").trim().toLowerCase();
  if (!game || input === "start" || input === "new") {
    game = { board: Array(9).fill("") };
    TTT_GAMES.set(key, game);
    return ctx.reply({ text: `❌⭕ *Tic-tac-toe* — You are X; I am O.\n\n${tttBoard(game.board)}\n\nChoose a square with *${config.PREFIX}ttt 1-9*.` });
  }
  const position = Number(input) - 1;
  if (!Number.isInteger(position) || position < 0 || position > 8) {
    return ctx.reply({ text: `Choose an empty square from 1 to 9 with *${config.PREFIX}ttt <number>*.` });
  }
  if (game.board[position]) return ctx.reply({ text: "That square is already occupied." });
  game.board[position] = "X";
  let result = tttWinner(game.board);
  if (!result) {
    const open = game.board.map((value,index)=>value ? -1 : index).filter((index)=>index >= 0);
    const winningMove = (mark) => open.find((index) => {
      game.board[index] = mark;
      const wins = tttWinner(game.board) === mark;
      game.board[index] = "";
      return wins;
    });
    let botMove = winningMove("O");
    if (botMove === undefined) botMove = winningMove("X");
    if (botMove === undefined) botMove = open.includes(4) ? 4 : open.find((i)=>[0,2,6,8].includes(i));
    if (botMove === undefined) botMove = open[0];
    game.board[botMove] = "O";
    result = tttWinner(game.board);
  }
  if (result) TTT_GAMES.delete(key);
  ctx.reply({
    text: `❌⭕ *Tic-tac-toe*\n\n${tttBoard(game.board)}\n\n${result === "X" ? "🎉 You win!" : result === "O" ? "🤖 I win!" : result === "draw" ? "🤝 Draw!" : `Your turn: *${config.PREFIX}ttt <1-9>*.`}${result ? `\nStart again with *${config.PREFIX}ttt*.` : ""}`,
  });
}, "PLAYER", "Tic-tac-toe");
reg(["slot","slots"], (ctx) => {
  const e = ["🍒","🍋","🍇","🍉","⭐","💎","7️⃣"];
  const r = [0,0,0].map(()=>e[Math.floor(Math.random()*e.length)]);
  ctx.reply({ text: `🎰 ${r.join(" | ")}  ${r[0]===r[1]&&r[1]===r[2]?"\n💖 JACKPOT !":""}` });
}, "PLAYER", "Slot machine");
reg(["lottery"], (ctx) => ctx.reply({ text: `🎟 Numbers: ${Array.from({length:6},()=>1+Math.floor(Math.random()*49)).join(" - ")}` }), "PLAYER", "Lottery");
reg(["roulette"], (ctx) => ctx.reply({ text: `🎡 ${Math.floor(Math.random()*37)} — ${Math.random()<0.5?"🔴 Red":"⚫ Noir"}` }), "PLAYER", "Roulette");
reg(["chess"], (ctx) => ctx.reply({ text: "♟ Chess — coming soon 💕" }), "PLAYER", "Chess");
reg(["snake"], (ctx) => ctx.reply({ text: "🐍 Snake — coming soon 💕" }), "PLAYER", "Snake");
reg(["akinator"], (ctx) => ctx.reply({ text: "🧞 Akinator — coming soon 💕" }), "PLAYER", "Akinator");
reg(["truthordare","tod"], (ctx) => ctx.reply({ text: Math.random()<0.5?"❓ Truth (type .truth)":"🔥 Dare (tape .dare)" }), "PLAYER", "Truth or Dare");

// ════════════════════════════════════════════════════════════════
// 🗣 VOIX — effets audio (nécessite reply à un audio)
// ════════════════════════════════════════════════════════════════
const VOIX = ["bass","blown","earrape","deep","fast","nightcore","reverse","robot","slow","smooth","squirrel","chipmunk","helium","vintage","oldradio"];
for (const v of VOIX) {
  reg(v, (ctx) => ctx.reply({ text: `🎵 *${v}* — Reply to an audio with .${v}\n(Audio conversion will be available soon 💕)` }), "VOIX", `Voice ${v}`);
}

// ════════════════════════════════════════════════════════════════
//  ADVER / FUN (ajouts)
// ════════════════════════════════════════════════════════════════
async function jokeApi(ctx, url, label) {
  try { const { data } = await ax.get(url);
    const txt = typeof data === "string" ? data : (data.joke || data.value || data.text || data.advice || data.fact || data.content || data.setup || JSON.stringify(data));
    await ctx.reply({ text: `${label}\n\n${txt}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}
reg("chucknorris", (ctx) => jokeApi(ctx, "https://api.chucknorris.io/jokes/random", "🥊 Chuck Norris"), "ADVER", "Chuck Norris");
reg("yomama", (ctx) => jokeApi(ctx, "https://api.yomomma.info/", "👩 Yo Mama"), "ADVER", "Yo Mama");
reg("dadjoke", (ctx) => jokeApi(ctx, "https://icanhazdadjoke.com/", "👨 Dad joke"), "ADVER", "Dad joke");
reg("programmingjoke", (ctx) => jokeApi(ctx, "https://v2.jokeapi.dev/joke/Programming?type=single", "💻 Code joke"), "ADVER", "Programming");
reg("quote", (ctx) => jokeApi(ctx, "https://api.quotable.io/random", "💬 Quote"), "ADVER", "Quote");
reg("riddle", (ctx) => jokeApi(ctx, "https://riddles-api.vercel.app/random", "🧩 Riddle"), "ADVER", "Riddle");
reg("animequote", (ctx) => jokeApi(ctx, "https://animechan.io/api/v1/quotes/random", " Anime quote"), "ADVER", "Anime quote");
reg("motivation", (ctx) => jokeApi(ctx, "https://zenquotes.io/api/random", "🌟 Motivation"), "ADVER", "Motivation");
reg("kanyequote", (ctx) => jokeApi(ctx, "https://api.kanye.rest/", "🎤 Kanye"), "ADVER", "Kanye");
reg("simpsons", (ctx) => jokeApi(ctx, "https://thesimpsonsquoteapi.glitch.me/quotes", "🍩 Simpsons"), "ADVER", "Simpsons");

// ════════════════════════════════════════════════════════════════
// 🎨 AI IMAGES — flux/pollinations (alias supplémentaires)
// ════════════════════════════════════════════════════════════════
const AI_IMG = ["imagine","flux","dalle","sdxl","artai","draw","picture","aiart","midjourney","aiphoto"];
for (const c of AI_IMG) {
  reg(c, async (ctx) => {
    if (!ctx.text) return ctx.reply({ text: `❌ .${c} <prompt>` });
    await sendImg(ctx, `https://image.pollinations.ai/prompt/${encodeURIComponent(ctx.text)}?nologo=true`, `🖼 ${ctx.text}`);
  }, "DOWNLOAD", `AI img ${c}`);
}

// ════════════════════════════════════════════════════════════════
// 🤖 AI alias (Gemini / Claude / etc.)
// ════════════════════════════════════════════════════════════════
async function aiCall(prompt, model = "gpt") {
  const ep = model === "gemini" ? "geminiai" : (model === "llama" ? "llama" : "gpt");
  const { data } = await ax.get(`https://api.giftedtech.web.id/api/ai/${ep}?apikey=gifted&q=${encodeURIComponent(prompt)}`);
  return data?.result || "No response.";
}
const AI2 = { gemini:"gemini", claude:"gpt", llama:"llama", mixtral:"gpt", deepseek:"gpt", copilot:"gpt", bard:"gemini", grok:"gpt", perplexity:"gpt" };
for (const [c, mdl] of Object.entries(AI2)) {
  reg(c, async (ctx) => {
    if (!ctx.text) return ctx.reply({ text: `❌ .${c} <question>` });
    try { const r = await aiCall(ctx.text, mdl); await ctx.reply({ text: `🤖 *${c.toUpperCase()}*\n\n${r}` }); }
    catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
  }, "AI", `AI ${c}`);
}

// ════════════════════════════════════════════════════════════════
//  ANIME REACTIONS — ajouts
// ════════════════════════════════════════════════════════════════
const ANIME2 = ["lurk","cringe","baka","cuddle2","stare","facepalm","peck","run","sleep","tickle","shrug","lick","feed","cool","love","happy2","sad","angry","laugh","sip","think","yawn"];
for (const r of ANIME2) {
  reg(r, async (ctx) => {
    try {
      const pool = ["hug","pat","kiss","slap","wave","wink","smile","poke","yeet","cuddle","bonk","blush","bite","cry","dance","handhold","highfive","happy","nom"];
      const pick = pool[Math.floor(Math.random()*pool.length)];
      const url = await main.fetchAnimeImage(pick, "sfw");
      await sendImg(ctx, url, ` ${r}`);
    } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
  }, "STICKER", `Anime ${r}`);
}

// ════════════════════════════════════════════════════════════════
// 🎨 LOGO — ajouts via ephoto api (alias)
// ════════════════════════════════════════════════════════════════
const LOGO2 = ["3dtext","fire3d","leaftext","metaltext","silvertext","pubgtext","stickertext","jokertext","graffiti","ice3d","blood3d","castle","wolfposter","cinematext","neon3d","fabric","scifi","mascotlogo","esportlogo","circuit","candy","leather","glassy","horror","carbon","wood","camo","pixelpunk","skull","christmas","valentine","sakura","love3d","retrologo","tattoo","gold3d","matrix","cyberpunk","summer","cute","spring","autumn","winter","stars","cloud","glow"];
for (const c of LOGO2) {
  reg(c, async (ctx) => {
    if (!ctx.text) return ctx.reply({ text: `❌ .${c} <texte>` });
    const url = `https://apis.prexzyvilla.site/${c}?text=${encodeURIComponent(ctx.text)}`;
    try { await sendImg(ctx, url, `✨ ${c}`); }
    catch (e) {
      if (!config.NEXORACLE_API_KEY) throw new Error("NEXORACLE_API_KEY missing");
      await sendImg(ctx, `https://api.nexoracle.com/image-creating/gfx?apikey=${encodeURIComponent(config.NEXORACLE_API_KEY)}&text1=${encodeURIComponent(ctx.text)}&text2=${encodeURIComponent(config.DEV)}`, `🎨 ${c}`);
    }
  }, "EPHOTO", `Logo ${c}`);
}

// ════════════════════════════════════════════════════════════════
// 📥 DOWNLOAD — ajouts
// ════════════════════════════════════════════════════════════════
reg(["x","twitter"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .twitter <url>" });
  try { const { data } = await ax.get(`https://api.giftedtech.web.id/api/download/twitterdl?apikey=gifted&url=${encodeURIComponent(ctx.text)}`);
    const u = data?.result?.download_url || data?.result?.url || data?.result?.[0]?.url; if (!u) throw new Error("No link");
    await ctx.natsu.sendMessage(ctx.jid, { video: { url: u }, caption: "🐦 Twitter/X", contextInfo: config.contextInfo }, { quoted: ctx.m });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Twitter/X");

reg("pinterest", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .pinterest <query>" });
  try { const { data } = await ax.get(`https://api.giftedtech.web.id/api/search/pinterest?apikey=gifted&query=${encodeURIComponent(ctx.text)}`);
    const arr = data?.results || []; const u = arr[Math.floor(Math.random()*arr.length)]?.image; if (!u) throw new Error("Nothing found");
    await sendImg(ctx, u, `📌 ${ctx.text}`);
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Pinterest");

reg("img", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .img <query>" });
  try { const { data } = await ax.get(`https://api.giftedtech.web.id/api/search/googleimage?apikey=gifted&query=${encodeURIComponent(ctx.text)}`);
    const arr = data?.results || []; const u = arr[Math.floor(Math.random()*arr.length)]?.image; if (!u) throw new Error("Rien");
    await sendImg(ctx, u, ctx.text);
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Image Google");

reg(["wallpaper","wp"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: "❌ .wallpaper <query>" });
  await sendImg(ctx, `https://image.pollinations.ai/prompt/${encodeURIComponent(ctx.text+" 4k wallpaper")}?nologo=true`, `🖼 ${ctx.text}`);
}, "DOWNLOAD", "Wallpaper");

reg(["vv","viewonce"], async (ctx) => {
  const quoted = quotedWAMessage(ctx);
  if (!quoted) return ctx.reply({ text: `❌ Réponds à une photo, vidéo ou audio avec *${config.PREFIX}vv*.` });
  const { content } = unwrapQuotedContent(quoted.message);
  const type = content?.imageMessage ? "image" : content?.videoMessage ? "video" : content?.audioMessage ? "audio" : null;
  if (!type) return ctx.reply({ text: `❌ ${config.PREFIX}vv fonctionne uniquement sur les photos, vidéos et audios.` });
  try {
    const targetMsg = {
      key: quoted.key,
      message: content,
    };
    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
    const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, {
      logger: ctx.natsu.logger,
      reuploadRequest: (message) => ctx.natsu.updateMediaMessage(message),
    });
    const caption = content?.imageMessage?.caption || content?.videoMessage?.caption || "🔓 View-once récupéré";
    const messagePayload = {
      [type]: buffer,
      contextInfo: config.contextInfo,
    };
    if (type !== "audio") {
      messagePayload.caption = caption;
    } else {
      messagePayload.mimetype = content?.audioMessage?.mimetype || "audio/ogg; codecs=opus";
      messagePayload.ptt = Boolean(content?.audioMessage?.ptt);
    }
    await ctx.natsu.sendMessage(ctx.jid, messagePayload, { quoted: ctx.m });
  } catch (e) {
    await ctx.reply({ text: `❌ Erreur vv: ${e.message}` });
  }
}, "DOWNLOAD", "Récupérer un média view-once ou normal");


reg(["toimg","stickertoimage"], async (ctx) => {
  const quoted = quotedWAMessage(ctx);
  if (!quoted) return ctx.reply({ text: "❌ Reply to a sticker with .toimg" });
  const { content, viewOnce } = unwrapQuotedContent(quoted.message);
  if (viewOnce) return ctx.reply({ text: "🔒 I won't bypass view-once media. Ask the sender to resend it as a regular file." });
  if (!content?.stickerMessage) return ctx.reply({ text: "❌ Reply to a sticker with .toimg" });
  try {
    const buf = await downloadQuotedMedia(ctx, quoted);
    // Send the webp buffer as image (WA renders webp as image)
    await ctx.natsu.sendMessage(ctx.jid, { image: buf, caption: "🖼 Sticker → Image 💕" }, { quoted: ctx.m });
  } catch (e) { await ctx.reply({ text: `❌ toimg: ${e.message}` }); }
}, "DOWNLOAD", "Sticker → image");
reg("tomp3", async (ctx) => {
  const quoted = quotedWAMessage(ctx);
  if (!quoted) return ctx.reply({ text: `❌ Reply to an audio or video with *${config.PREFIX}tomp3*.` });
  const { content, viewOnce } = unwrapQuotedContent(quoted.message);
  if (viewOnce) return ctx.reply({ text: "🔒 I won't bypass view-once media. Ask the sender to resend it as a regular file." });
  if (!content?.videoMessage && !content?.audioMessage) {
    return ctx.reply({ text: `❌ ${config.PREFIX}tomp3 supports quoted audio or video.` });
  }
  if (!hasFfmpeg()) return ctx.reply({ text: "❌ Audio conversion is unavailable on this host because ffmpeg is not installed." });
  try {
    const input = await downloadQuotedMedia(ctx, quoted);
    if (!Buffer.isBuffer(input) || !input.length) throw new Error("The quoted media could not be downloaded.");
    if (input.length > 64 * 1024 * 1024) throw new Error("The source media exceeds the 64 MB limit.");
    const audio = await convertToMp3(input);
    await ctx.natsu.sendMessage(ctx.jid, {
      audio,
      mimetype: "audio/mpeg",
      fileName: "audio.mp3",
      contextInfo: config.contextInfo,
    }, { quoted: ctx.m });
  } catch (e) {
    await ctx.reply({ text: `❌ tomp3: ${e.message}` });
  }
}, "DOWNLOAD", "Convert quoted audio/video to MP3");
reg("tomp4", (ctx) => ctx.reply({ text: "🎬 Reply to an audio/gif with .tomp4 (coming soon 💕)" }), "DOWNLOAD", "GIF → mp4");
reg(["tourl","url"], async (ctx) => {
  const quoted = quotedWAMessage(ctx);
  if (!quoted) return ctx.reply({ text: "❌ Reply to an image with .tourl" });
  const { content, viewOnce } = unwrapQuotedContent(quoted.message);
  if (viewOnce) return ctx.reply({ text: "🔒 I won't bypass view-once media. Ask the sender to resend it as a regular image." });
  if (!content?.imageMessage) return ctx.reply({ text: "❌ Reply to an image with .tourl" });
  try {
    const buf = await downloadQuotedMedia(ctx, quoted);
    const FormData = require("form-data");
    const fd = new FormData(); fd.append("fileToUpload", buf, "img.jpg"); fd.append("reqtype","fileupload");
    const { data } = await ax.post("https://catbox.moe/user/api.php", fd, { headers: fd.getHeaders() });
    await ctx.reply({ text: `🔗 ${data}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Upload → URL");
reg("pdftotext", (ctx) => ctx.reply({ text: "📄 Reply to a PDF with .pdftotext (coming soon 💕)" }), "DOWNLOAD", "PDF → text");


// ════════════════════════════════════════════════════════════════
// 🆕 NATSU FIX PACK — tts, aprouve, love (FR + EN), tiktok fallback
// ════════════════════════════════════════════════════════════════

// • aprouve / approve — approve a SINGLE pending join request
reg(["approve","aprouve"], async (ctx) => {
  if (!ctx.isGroup) return ctx.reply({ text: "❌ Group only." });
  if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply({ text: "❌ Admins only." });
  try {
    const requests = await ctx.natsu.groupRequestParticipantsList(ctx.jid);
    if (!requests?.length) return ctx.reply({ text: "✅ No pending requests." });
    const mention = ctx.m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    let target;
    if (mention) target = mention;
    else if (ctx.text) target = `${ctx.text.replace(/\D/g, "")}@s.whatsapp.net`;
    else target = requests[0].jid;
    await ctx.natsu.groupRequestParticipantsUpdate(ctx.jid, [target], "approve");
    await ctx.reply({ text: `✅ Approved @${target.split("@")[0]} 💕`, mentions: [target] });
  } catch (e) { await ctx.reply({ text: `❌ approve: ${e.message}` }); }
}, "OWNER", "Approve a single join request");

reg(["reject"], async (ctx) => {
  if (!ctx.isGroup) return ctx.reply({ text: "❌ Group only." });
  if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply({ text: "❌ Admins only." });
  try {
    const requests = await ctx.natsu.groupRequestParticipantsList(ctx.jid);
    if (!requests?.length) return ctx.reply({ text: "✅ No requests." });
    const mention = ctx.m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const target = mention || (ctx.text ? `${ctx.text.replace(/\D/g,"")}@s.whatsapp.net` : requests[0].jid);
    await ctx.natsu.groupRequestParticipantsUpdate(ctx.jid, [target], "reject");
    await ctx.reply({ text: `🚫 Rejected @${target.split("@")[0]}`, mentions: [target] });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "OWNER", "Reject a single request");

// • tts <lang> <text> — Google Translate TTS (free, no key)
reg(["tts","speech"], async (ctx) => {
  let lang = "fr";
  let text = ctx.text;
  if (ctx.args[0] && /^[a-z]{2}$/i.test(ctx.args[0])) {
    lang = ctx.args[0].toLowerCase();
    text = ctx.args.slice(1).join(" ");
  }
  if (!text) return ctx.reply({ text: `❌ Usage: ${config.PREFIX}tts <lang> <text>\nExample: ${config.PREFIX}tts en Hello baby` });
  if (text.length > 200) text = text.slice(0, 200);
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    const { data } = await ax.get(url, { responseType: "arraybuffer", headers: { "User-Agent": "Mozilla/5.0" } });
    const buf = Buffer.from(data);
    await ctx.natsu.sendMessage(ctx.jid, { audio: buf, mimetype: "audio/mp4", ptt: true, contextInfo: config.contextInfo }, { quoted: ctx.m });
  } catch (e) { await ctx.reply({ text: `❌ tts: ${e.message}` }); }
}, "VOICE", "Text-to-speech");

// • tiktok — already exists; add a 2nd alias with better API fallback
reg(["tikdl","tiktok2"], async (ctx) => {
  const u = ctx.text;
  if (!u || !u.includes("tiktok.com")) return ctx.reply({ text: `❌ Usage: ${config.PREFIX}tikdl <tiktok url>` });
  const apis = [
    () => ax.get(`https://api.tikwm.com/?url=${encodeURIComponent(u)}&hd=1`).then(r => r.data?.data?.hdplay || r.data?.data?.play),
    () => ax.get(`https://api.giftedtech.web.id/api/download/tiktokdl?apikey=gifted&url=${encodeURIComponent(u)}`).then(r => r.data?.result?.video || r.data?.result?.download_url),
    () => ax.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(u)}`).then(r => r.data?.data?.play),
  ];
  for (const fn of apis) {
    try {
      const v = await fn();
      if (v) {
        await ctx.natsu.sendMessage(ctx.jid, { video: { url: v }, caption: "🎵 TikTok 💕", contextInfo: config.contextInfo }, { quoted: ctx.m });
        return;
      }
    } catch {}
  }
  ctx.reply({ text: "❌ All TikTok APIs failed. Try again later." });
}, "DOWNLOAD", "TikTok (multi-API)");

// ════════════════════════════════════════════════════════════════
// 💕💖 LOVE — paroles d'amour en français et english (féminin)
// ════════════════════════════════════════════════════════════════
const LOVE_FR = [
  "Mon bébé 🥹, tu sais que mon cœur ne bat que pour toi… chaque seconde sans toi me semble une éternité 💔",
  "Tu es mon soleil mon amour ☀️❤️ — même les plus belles fleurs ne valent pas un seul de tes sourires.",
  "Je t'aime tellement que même les étoiles sont jalouses de la lumière que tu mets dans ma vie ✨💕",
  "Bébé… si l'amour était une mer, je m'y noierais avec toi sans hésiter 🌊❤️‍🩹",
  "Tu es mon premier souffle le matin et ma dernière pensée le soir 💞",
  "Mon cœur t'appartient, totalement, sans condition — pour toujours et à jamais 🥹💖",
  "J'ai pas besoin de prince charmant bébé, je t'ai toi et c'est tout l'univers pour moi 👑❤️",
  "Chaque battement de mon cœur murmure ton nom mon amour 💗",
];
const LOVE_EN = [
  "Baby 🥹, my heart only beats for you… every second without you feels like forever 💔",
  "You are my sunshine my love ☀️❤️ — even the prettiest flowers can't match one of your smiles.",
  "I love you so much that even the stars are jealous of the light you put in my life ✨💕",
  "Baby… if love were an ocean, I'd drown in it with you without thinking twice 🌊❤️‍🩹",
  "You're my first breath in the morning and my last thought at night 💞",
  "My heart belongs to you, fully, unconditionally — forever and always 🥹💖",
  "I don't need a prince charming baby, I have you and that's the whole universe 👑❤️",
  "Every beat of my heart whispers your name my love 💗",
];
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
reg(["love","amour"], (ctx) => ctx.reply({ text: pick(LOVE_FR) }), "LOVE", "Paroles d'amour (FR)");
reg(["loveen","loveenglish"], (ctx) => ctx.reply({ text: pick(LOVE_EN) }), "LOVE", "Love words (EN)");
reg(["jtm","ily"], (ctx) => ctx.reply({ text: "Je t'aime mon bébé 🥹❤️‍🩹 — I love you baby 💕" }), "LOVE", "Quick love");
reg(["miss","tumemanques"], (ctx) => ctx.reply({ text: "Tu me manques tellement bébé 😭💔 — I miss you so much baby 🥹" }), "LOVE", "Miss you");
reg(["bisou","kiss"], (ctx) => ctx.reply({ text: "Un gros bisou rien que pour toi 😘💋 — A big kiss just for you 💕" }), "LOVE", "Kiss");
reg(["calin","hug"], (ctx) => ctx.reply({ text: "Je t'envoie un gros câlin bébé 🤗 — Sending you a big warm hug 💖" }), "LOVE", "Hug");
reg(["coeur","heart"], (ctx) => ctx.reply({ text: "Mon cœur t'appartient ❤️‍🩹 — My heart belongs to you 💗" }), "LOVE", "Heart");

