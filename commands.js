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
const config = require("./config");

const axiosInstance = axios.create({ timeout: 60000 });

// ─── anime image helper with multi-provider fallback ───────────
// Some hosts (Pterodactyl / certain VPS) can't resolve api.waifu.pics
// (ENOTFOUND). We try waifu.pics first, then nekos.best, then purrbot.
async function fetchAnimeImage(name, type = "sfw") {
  const tries = [];
  tries.push(async () => {
    const { data } = await axiosInstance.get(`https://api.waifu.pics/${type}/${name}`);
    return data?.url;
  });
  tries.push(async () => {
    const { data } = await axiosInstance.get(`https://nekos.best/api/v2/${name}`);
    return data?.results?.[0]?.url;
  });
  tries.push(async () => {
    const { data } = await axiosInstance.get(`https://purrbot.site/api/img/${type}/${name}/gif`);
    return data?.link;
  });
  let lastErr;
  for (const t of tries) {
    try { const u = await t(); if (u) return u; }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Aucun fournisseur d'image disponible");
}

// ─── registry ──────────────────────────────────────────────────
const REGISTRY = {};
const CATEGORIES = {};
const REQUEST_PREVIEWS = new Map();
function reg(names, handler, category = "MISC", desc = "") {
  const arr = [].concat(names);
  for (const n of arr) {
    REGISTRY[n] = { handler, category, desc, name: n };
    (CATEGORIES[category] = CATEGORIES[category] || []).push(n);
  }
}

// ─── helpers d'envoi ───────────────────────────────────────────
async function sendImg(ctx, url, caption = "") {
  await ctx.natsu.sendMessage(
    ctx.jid,
    { image: { url }, caption, contextInfo: config.contextInfo },
    { quoted: ctx.m },
  );
}
async function sendVid(ctx, url, caption = "") {
  await ctx.natsu.sendMessage(
    ctx.jid,
    { video: { url }, caption, contextInfo: config.contextInfo },
    { quoted: ctx.m },
  );
}
async function sendAud(ctx, url) {
  await ctx.natsu.sendMessage(
    ctx.jid,
    { audio: { url }, mimetype: "audio/mpeg", contextInfo: config.contextInfo },
    { quoted: ctx.m },
  );
}

// ════════════════════════════════════════════════════════════════
// 🤖 AI MENU  — API: https://chateverywhere.app/api/chat/ (POST GPT-4)
//    Récupéré depuis case.js (case 'ai' / 'openai' / 'gpt4' / 'xxai')
// ════════════════════════════════════════════════════════════════
async function askGPT(prompt) {
  const { data } = await axiosInstance.post(
    "https://chateverywhere.app/api/chat/",
    {
      model: {
        id: "gpt-4",
        name: "GPT-4",
        maxLength: 32000,
        tokenLimit: 8000,
        completionTokenLimit: 5000,
        deploymentName: "gpt-4",
      },
      messages: [{ pluginId: null, content: prompt, role: "user" }],
      prompt: prompt,
      temperature: 0.5,
    },
    {
      headers: {
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      },
    },
  );
  return typeof data === "string" ? data : JSON.stringify(data);
}
const AI_CMDS = ["ai", "gpt", "gpt4", "openai", "xxai", "chatgpt", "bot", "ask", "natsu"];
for (const c of AI_CMDS) {
  reg(c, async (ctx) => {
    if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}${c} bonjour` });
    try {
      const ans = await askGPT(ctx.text);
      await ctx.reply({
        text: `╭─❍ AI Assistant\n│\n│ Q: ${ctx.text}\n│\n│ A:\n│ ${ans}\n│\n╰─✅`,
      });
    } catch (e) {
      await ctx.reply({ text: `❌ AI error: ${e.message}` });
    }
  }, "AI", `AI ${c}`);
}

// ════════════════════════════════════════════════════════════════
// 🖼 EPHOTO MENU — API: https://apis.prexzyvilla.site/<cmd>?text=
//    Récupéré tel quel depuis case.js (ordre identique)
// ════════════════════════════════════════════════════════════════
const EPHOTO = [
  "glitchtext", "writetext", "advancedglow", "typographytext", "pixelglitch",
  "neonglitch", "flagtext", "flag3dtext", "deletingtext", "blackpinkstyle",
  "glowingtext", "underwatertext", "logomaker", "cartoonstyle", "papercutstyle",
  "watercolortext", "effectclouds", "blackpinklogo", "gradienttext", "summerbeach",
  "luxurygold", "multicoloredneon", "sandsummer", "galaxywallpaper", "style1917",
  "makingneon", "royaltext", "freecreate", "galaxystyle", "createlogo",
  "lighteffects",
];
for (const c of EPHOTO) {
  reg(c, async (ctx) => {
    if (!ctx.text)
      return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}${c} ${config.DEV}` });
    const url = `https://apis.prexzyvilla.site/${c}?text=${encodeURIComponent(ctx.text)}`;
    try {
      await sendImg(ctx, url, `✨ ${c} : ${ctx.text}`);
    } catch (e) {
      await ctx.reply({ text: `⚠️ Error ${c}: ${e.message}` });
    }
  }, "EPHOTO", `Ephoto ${c}`);
}

// ════════════════════════════════════════════════════════════════
// 🎨 LOGO MENU (gfx1..gfx12)
//    API: https://api.nexoracle.com/image-creating/<gfx>?apikey=...&text1=&text2=
//    Récupéré tel quel depuis case.js (case 'gfx'..'gfx12')
// ════════════════════════════════════════════════════════════════
const NEXO_KEY = config.NEXORACLE_API_KEY;
const LOGOS = ["gfx", "gfx2", "gfx3", "gfx4", "gfx5", "gfx6", "gfx7", "gfx8", "gfx9", "gfx10", "gfx11", "gfx12"];
for (const c of LOGOS) {
  reg(c, async (ctx) => {
    const [text1, text2] = (ctx.text || "").split("|").map((v) => v && v.trim());
    if (!text1 || !text2)
      return ctx.reply({
        text: `🎨 *${c.toUpperCase()}*\n\nExample: ${config.PREFIX}${c} DENTSU | MD`,
      });
    if (!NEXO_KEY) return ctx.reply({ text: "❌ NEXORACLE_API_KEY missing." });
    await ctx.reply({ text: `🎨 Generating ${c.toUpperCase()}...\n🔤 ${text1}\n🔡 ${text2}` });
    const url = `https://api.nexoracle.com/image-creating/${c}?apikey=${NEXO_KEY}&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}`;
    try {
      await sendImg(ctx, url, `${config.DEV} — ${c.toUpperCase()}\n🔤 ${text1}\n🔡 ${text2}`);
    } catch (e) {
      await ctx.reply({ text: `❌ ${c.toUpperCase()} failed: ${e.message}` });
    }
  }, "LOGO", `Logo ${c}`);
}

// ════════════════════════════════════════════════════════════════
// 📥 DOWNLOADER MENU — APIs choisies par le user + mes propres APIs
// ════════════════════════════════════════════════════════════════


// NexRay handles YouTube search and audio download without an API key.
const NEXRAY_API_BASE = "https://api.nexray.eu.cc";

function extractYouTubeVideoId(value) {
  const input = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}

async function resolveYouTubeVideo(input) {
  const query = String(input || "").trim();
  const directId = extractYouTubeVideoId(query);
  if (directId) return { videoId: directId, title: "YouTube", url: "https://www.youtube.com/watch?v=" + directId };

  const { data } = await axiosInstance.get(NEXRAY_API_BASE + "/search/youtube", {
    params: { q: query }, timeout: 25000,
  });
  if (data?.status === false) throw new Error(data.error || "La recherche YouTube a échoué.");
  const raw = data?.result ?? data?.results ?? data?.data ?? [];
  const results = Array.isArray(raw) ? raw : [raw];
  const video = results.find((item) => item && (extractYouTubeVideoId(item.id || item.videoId || item.video_id) || extractYouTubeVideoId(item.url || item.link)));
  if (!video) throw new Error("Aucune vidéo YouTube trouvée pour ce titre.");
  const videoId = extractYouTubeVideoId(video.id || video.videoId || video.video_id || video.url || video.link);
  return {
    videoId,
    title: video.title || video.name || "YouTube",
    url: "https://www.youtube.com/watch?v=" + videoId,
  };
}

function nexrayErrorMessage(error) {
  const status = Number(error?.response?.status || 0);
  const providerMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message;
  if (status === 429) return "NexRay a limité les requêtes (429). Réessaie dans quelques minutes.";
  if (status >= 500) return "NexRay rencontre un problème temporaire" + (providerMessage ? ": " + providerMessage : ".");
  return providerMessage || "Échec de la requête NexRay.";
}

async function handleYouTubeAudio(ctx) {
  const input = String(ctx.text || "").trim();
  if (!input) return ctx.reply({ text: "❌ Envoie un titre ou un lien YouTube après play/song/ytmp3." });
  try {
    const video = await resolveYouTubeVideo(input);
    await ctx.reply({ text: "🎵 *" + video.title + "*\n🔗 " + video.url + "\n\n⏳ Préparation de l’audio…" });
    const { data } = await axiosInstance.get(NEXRAY_API_BASE + "/downloader/savetube", {
      params: { url: video.url }, timeout: 90000,
    });
    if (data?.status === false) throw new Error(data.error || "NexRay n’a pas pu télécharger cet audio.");
    const audioUrl = data?.result?.url || data?.result?.download_url || data?.result?.audio_url;
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) throw new Error("NexRay n’a pas fourni de lien audio valide.");
    await sendAud(ctx, audioUrl);
  } catch (error) {
    console.error("NexRay play/song error:", error.message);
    await ctx.reply({ text: "❌ " + nexrayErrorMessage(error) });
  }
}

reg(["play", "song", "play2"], handleYouTubeAudio, "DOWNLOAD", "Audio YouTube");

// • tt / tiktok — API: https://api.tikwm.com/?url=...&hd=1
reg(["tt", "tiktok"], async (ctx) => {
  const tiktokUrl = ctx.text;
  if (!tiktokUrl || !tiktokUrl.includes("tiktok.com"))
    return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}tt <lien tiktok>` });
  try {
    const { data } = await axiosInstance.get(
      `https://api.tikwm.com/?url=${encodeURIComponent(tiktokUrl)}&hd=1`,
    );
    const v = data?.data?.hdplay || data?.data?.play;
    if (!v) throw new Error("Video link not found");
    await sendVid(ctx, v, `🎵 ${data?.data?.title || "TikTok"}`);
  } catch (e) {
    await ctx.reply({ text: `❌ tiktok : ${e.message}` });
  }
}, "DOWNLOAD", "TikTok");

// • aiimg — API: https://api.siputzx.my.id/api/ai/flux?prompt=...
reg("aiimg", async (ctx) => {
  const prompt = ctx.text;
  if (!prompt) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}aiimg cyber cat neon` });
  const apiUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;
  try {
    await sendImg(ctx, apiUrl, `🖼 ${prompt}`);
  } catch (e) {
    await ctx.reply({ text: `❌ aiimg : ${e.message}` });
  }
}, "DOWNLOAD", "AI Image");

// • fb / facebook — API: https://suhas-bro-api.vercel.app/download/fbdown
reg(["fb", "facebook"], async (ctx) => {
  const fbUrl = ctx.text;
  if (!fbUrl) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}fb <lien facebook>` });
  try {
    const { data } = await axiosInstance.get(
      `https://suhas-bro-api.vercel.app/download/fbdown?url=${encodeURIComponent(fbUrl)}`,
    );
    const v = data?.result?.hd || data?.result?.sd || data?.hd || data?.sd;
    if (!v) throw new Error("Lien introuvable");
    await sendVid(ctx, v, "📘 Facebook");
  } catch (e) {
    await ctx.reply({ text: `❌ fb : ${e.message}` });
  }
}, "DOWNLOAD", "Facebook");

// ── Mes propres APIs pour le reste ────────────────────────────
// YouTube vidéo
reg(["ytmp4", "video"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple — video <nom ou url>` });
  try {
    let yt = ctx.text;
    if (!/youtu/.test(yt)) {
      const info = await ytSearchFirst(yt);
      yt = `https://www.youtube.com/watch?v=${info.videoId}`;
    }
    const { data } = await axiosInstance.get(
      `https://api.giftedtech.web.id/api/download/ytmp4?apikey=gifted&url=${encodeURIComponent(yt)}`,
    );
    const u = data?.result?.download_url || data?.result?.url;
    if (!u) throw new Error("Video not found");
    await sendVid(ctx, u, "🎬 YouTube");
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "YouTube video");

reg("ytmp3", handleYouTubeAudio, "DOWNLOAD", "YouTube mp3");

// APK
reg(["apk", "apkdl"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}apk com.whatsapp` });
  try {
    const { data } = await axiosInstance.get(
      `https://api.bk9.dev/download/apk?id=${encodeURIComponent(ctx.text.trim())}`,
    );
    if (!data?.status || !data?.BK9?.dllink) throw new Error("APK introuvable");
    const { name, dllink, package: pkg } = data.BK9;
    await ctx.natsu.sendMessage(
      ctx.jid,
      {
        document: { url: dllink },
        fileName: `${name || pkg}.apk`,
        mimetype: "application/vnd.android.package-archive",
        caption: `📦 ${name}\n📁 ${pkg}`,
        contextInfo: config.contextInfo,
      },
      { quoted: ctx.m },
    );
  } catch (e) { await ctx.reply({ text: `❌ apk : ${e.message}` }); }
}, "DOWNLOAD", "APK Downloader");

// Instagram
reg(["instagram", "ig", "igdl"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}ig <url>` });
  try {
    const { data } = await axiosInstance.get(
      `https://api.bk9.dev/download/instagram?url=${encodeURIComponent(ctx.text)}`,
    );
    const items = data?.BK9 || data?.result || [];
    const arr = Array.isArray(items) ? items : [items];
    for (const it of arr) {
      const u = it.url || it.downloadUrl;
      if (!u) continue;
      if (/\.mp4/i.test(u)) await sendVid(ctx, u, "📸 Instagram");
      else await sendImg(ctx, u, "📸 Instagram");
    }
  } catch (e) { await ctx.reply({ text: `❌ ig : ${e.message}` }); }
}, "DOWNLOAD", "Instagram");

// GitClone (zip d'un repo GitHub)
reg(["gitclone", "git"], async (ctx) => {
  const url = ctx.text;
  if (!url || !/github\.com/.test(url))
    return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}gitclone https://github.com/user/repo` });
  try {
    const clean = url.replace(/\.git$/, "").replace(/\/$/, "");
    const [, , , user, repo] = clean.split("/");
    const zip = `${clean}/archive/refs/heads/main.zip`;
    await ctx.natsu.sendMessage(
      ctx.jid,
      {
        document: { url: zip },
        fileName: `${repo}.zip`,
        mimetype: "application/zip",
        caption: `📦 ${user}/${repo}`,
        contextInfo: config.contextInfo,
      },
      { quoted: ctx.m },
    );
  } catch (e) { await ctx.reply({ text: `❌ gitclone : ${e.message}` }); }
}, "DOWNLOAD", "Git clone");

// MediaFire / Spotify / Movie / Bible / Say (TTS) — fournis par mes APIs
reg("mediafire", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}mediafire <url>` });
  try {
    const { data } = await axiosInstance.get(
      `https://api.bk9.dev/download/mediafire?url=${encodeURIComponent(ctx.text)}`,
    );
    const u = data?.BK9?.url || data?.BK9?.downloadUrl;
    if (!u) throw new Error("Lien introuvable");
    await ctx.natsu.sendMessage(
      ctx.jid,
      { document: { url: u }, fileName: data?.BK9?.fileName || "mediafire.bin",
        mimetype: "application/octet-stream", contextInfo: config.contextInfo },
      { quoted: ctx.m },
    );
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "MediaFire");

reg("spotify", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}spotify <nom>` });
  try {
    const { data } = await axiosInstance.get(
      `https://api.bk9.dev/download/spotify?q=${encodeURIComponent(ctx.text)}`,
    );
    const u = data?.BK9?.download_url || data?.BK9?.url;
    if (!u) throw new Error("Audio introuvable");
    await sendAud(ctx, u);
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Spotify");

reg("movie", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}movie inception` });
  if (!config.OMDB_API_KEY) return ctx.reply({ text: "❌ OMDB_API_KEY missing." });
  try {
    const { data } = await axiosInstance.get(
      `https://www.omdbapi.com/?t=${encodeURIComponent(ctx.text)}&apikey=${encodeURIComponent(config.OMDB_API_KEY)}`,
    );
    if (data.Response === "False") throw new Error(data.Error);
    await ctx.reply({
      text: `🎬 *${data.Title}* (${data.Year})\n⭐ ${data.imdbRating}\n🎭 ${data.Genre}\n👥 ${data.Actors}\n\n📝 ${data.Plot}`,
    });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Movie info");

reg(["yts", "ytsearch"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}yts despacito` });
  try {
    const { data } = await axiosInstance.get(
      `https://api.bk9.dev/search/yts?q=${encodeURIComponent(ctx.text)}`,
    );
    const list = (data?.BK9 || []).slice(0, 6);
    if (!list.length) throw new Error("No results");
    const out = list.map((v, i) =>
      `${i + 1}. *${v.title}*\n   ⏱ ${v.timestamp || ""}  👤 ${v.author?.name || ""}\n   🔗 ${v.url}`,
    ).join("\n\n");
    await ctx.reply({ text: `🔎 *YT Search* : ${ctx.text}\n\n${out}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "YT search");

reg("shorturl", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}shorturl <url>` });
  try {
    const { data } = await axiosInstance.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(ctx.text)}`);
    await ctx.reply({ text: `🔗 ${data}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Short URL");

reg("qrcode", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}qrcode <texte>` });
  await sendImg(ctx, `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(ctx.text)}`, `📱 QR : ${ctx.text}`);
}, "DOWNLOAD", "QR code");

reg("say", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}say bonjour` });
  await sendAud(ctx, `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(ctx.text)}&tl=fr&client=tw-ob`);
}, "DOWNLOAD", "Say (TTS)");

reg("bible", async (ctx) => {
  const q = ctx.text || "John 3:16";
  try {
    const { data } = await axiosInstance.get(`https://bible-api.com/${encodeURIComponent(q)}`);
    await ctx.reply({ text: `📖 *${data.reference}*\n\n${data.text}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "DOWNLOAD", "Bible");

// Media utilities that need quoted-message context are registered in commands_extra.js.

async function handleAllJoinRequests(ctx, action, commandName) {
  if (!ctx.isGroup) return ctx.reply({ text: "❌ Group only." });
  if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply({ text: "❌ Group admins only." });
  if (!ctx.isBotAdmin) return ctx.reply({ text: "❌ Make the bot a group admin first." });
  try {
    const requests = await ctx.natsu.groupRequestParticipantsList(ctx.jid);
    if (!requests?.length) return ctx.reply({ text: "✅ No pending requests." });
    const jids = requests.map((request) => request.jid).filter(Boolean);
    if (!jids.length) return ctx.reply({ text: "✅ No valid pending requests." });
    const requester = ctx.m.key?.participant || ctx.m.key?.remoteJid || ctx.jid;
    const key = `${action}:${ctx.jid}:${requester}`;
    const previous = REQUEST_PREVIEWS.get(key);
    const sameQueue = previous && previous.expiresAt > Date.now() &&
      previous.jids.slice().sort().join("|") === jids.slice().sort().join("|");
    if ((ctx.text || "").trim().toLowerCase() !== "confirm") {
      REQUEST_PREVIEWS.set(key, { jids, expiresAt: Date.now() + 120000 });
      return ctx.reply({
        text: `⚠️ ${jids.length} pending request(s) will be ${action === "approve" ? "approved" : "rejected"}. This preview expires in 2 minutes.\nRun *${config.PREFIX}${commandName} confirm* to continue.`,
      });
    }
    if (!sameQueue) {
      REQUEST_PREVIEWS.set(key, { jids, expiresAt: Date.now() + 120000 });
      return ctx.reply({ text: `⚠️ The request list changed or its preview expired. ${jids.length} request(s) are now pending; review this list and run the command with *confirm* again.` });
    }
    await ctx.natsu.groupRequestParticipantsUpdate(ctx.jid, previous.jids, action);
    REQUEST_PREVIEWS.delete(key);
    await ctx.reply({ text: `✅ ${previous.jids.length} request(s) ${action === "approve" ? "approved" : "rejected"}.` });
  } catch (e) {
    await ctx.reply({ text: `❌ ${action}all: ${e.message}` });
  }
}

// ════════════════════════════════════════════════════════════════
// 👥 GROUP — review all pending join requests
// ════════════════════════════════════════════════════════════════
reg("approveall", (ctx) => handleAllJoinRequests(ctx, "approve", "approveall"), "GROUP", "Approve all pending join requests");
reg("approuveall", (ctx) => handleAllJoinRequests(ctx, "approve", "approuveall"), "GROUP", "Approve all pending join requests");
reg("rejectall", (ctx) => handleAllJoinRequests(ctx, "reject", "rejectall"), "GROUP", "Reject all pending join requests");
reg("rejecteall", (ctx) => handleAllJoinRequests(ctx, "reject", "rejecteall"), "GROUP", "Reject all pending join requests");

// ════════════════════════════════════════════════════════════════
// 🥱 ADVER / FUN — APIs simples
// ════════════════════════════════════════════════════════════════
reg("8ball", (ctx) => ctx.reply({
  text: ["Yes 🟢", "No 🔴", "Maybe 🤔", "Definitely 🔥", "Ask later ⏳", "Without a doubt ✅"][Math.floor(Math.random() * 6)],
}), "ADVER", "8ball");
reg("coin", (ctx) => ctx.reply({ text: Math.random() < 0.5 ? "🪙 Pile" : "🪙 Face" }), "PLAYER", "Coin");
reg("dice", (ctx) => ctx.reply({ text: `🎲 ${1 + Math.floor(Math.random() * 6)}` }), "PLAYER", "Dice");
reg("coffee", (ctx) => ctx.reply({ text: "☕ Here is your coffee!" }), "ADVER", "Coffee");

async function jokeApi(ctx, url, label) {
  try {
    const { data } = await axiosInstance.get(url);
    const txt = typeof data === "string" ? data : (data.joke || data.value || data.text || data.advice || data.fact || data.content || JSON.stringify(data));
    await ctx.reply({ text: `${label}\n\n${txt}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}
reg("joke", (ctx) => jokeApi(ctx, "https://official-joke-api.appspot.com/random_joke", "😂 Joke"), "ADVER", "Joke");
reg("truth", (ctx) => jokeApi(ctx, "https://api.truthordarebot.xyz/api/truth", "❓ Truth"), "ADVER", "Truth");
reg("dare", (ctx) => jokeApi(ctx, "https://api.truthordarebot.xyz/api/dare", "🔥 Dare"), "ADVER", "Dare");
reg("advice", (ctx) => jokeApi(ctx, "https://api.adviceslip.com/advice", "💡 Advice"), "ADVER", "Advice");
reg("funfact", (ctx) => jokeApi(ctx, "https://uselessfacts.jsph.pl/random.json?language=en", "🌟 Fact"), "ADVER", "Fun fact");
reg("fact", (ctx) => jokeApi(ctx, "https://uselessfacts.jsph.pl/random.json?language=en", "🧠 Fact"), "ADVER", "Fact");
reg("urban", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}urban yeet` });
  try {
    const { data } = await axiosInstance.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(ctx.text)}`);
    const d = data?.list?.[0];
    if (!d) throw new Error("No definition");
    await ctx.reply({ text: `🗣 *${d.word}*\n\n${d.definition}\n\n_${d.example}_` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "ADVER", "Urban");
reg("dog", (ctx) => apiImageJson(ctx, "https://dog.ceo/api/breeds/image/random", "message", "🐶"), "ADVER", "Dog");
reg("cat", (ctx) => apiImageJson(ctx, "https://api.thecatapi.com/v1/images/search", null, "🐱"), "ADVER", "Cat");
reg("meme", (ctx) => apiImageJson(ctx, "https://meme-api.com/gimme", "url", "🤣"), "ADVER", "Meme");
reg("trivia", (ctx) => jokeApi(ctx, "https://opentdb.com/api.php?amount=1&type=multiple", "❔ Trivia"), "ADVER", "Trivia");
reg("moviequote", (ctx) => jokeApi(ctx, "https://api.quotable.io/random?tags=famous-quotes", "🎬 Quote"), "ADVER", "Movie quote");

async function apiImageJson(ctx, url, key, emoji) {
  try {
    const { data } = await axiosInstance.get(url);
    let img;
    if (Array.isArray(data)) img = data[0]?.url;
    else if (key) img = data[key];
    else img = data.url;
    if (!img) throw new Error("Pas d'image");
    await sendImg(ctx, img, emoji);
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}

// ════════════════════════════════════════════════════════════════
//  STICKER / ANIME REACTIONS (waifu.pics)
// ════════════════════════════════════════════════════════════════
const ANIME_REACT = [
  "cry","kill","hug","happy","dance","handhold","highfive","slap","kiss",
  "blush","bite","cuddle","shinobu","bonk","pat","nom","wave","wink",
  "smile","poke","yeet","bully","glomp","smug","awoo",
];
for (const r of ANIME_REACT) {
  reg(r, async (ctx) => {
    try {
      const url = await fetchAnimeImage(r, "sfw");
      await sendImg(ctx, url, ` ${r}`);
    } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
  }, "STICKER", `Anime ${r}`);
}
reg("furbrat", async (ctx) => {
  try { const url = await fetchAnimeImage("neko", "sfw"); await sendImg(ctx, url, "🦊 furbrat"); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "STICKER", "furbrat");

// ════════════════════════════════════════════════════════════════
// ℹ️ TOOLS — petites APIs publiques
// ════════════════════════════════════════════════════════════════
reg("myip", async (ctx) => {
  try { const { data } = await axiosInstance.get("https://api.ipify.org?format=json"); await ctx.reply({ text: `🌐 IP serveur : ${data.ip}` }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "My IP");
reg("iplookup", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}iplookup 8.8.8.8` });
  try { const { data } = await axiosInstance.get(`http://ip-api.com/json/${encodeURIComponent(ctx.text)}`); await ctx.reply({ text: "🌐 " + JSON.stringify(data, null, 2) }); }
  catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "IP lookup");
reg("currency", async (ctx) => {
  const [amt, from, to] = (ctx.text || "").split(/\s+/);
  if (!amt || !from || !to) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}currency 1 USD EUR` });
  try {
    const { data } = await axiosInstance.get(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
    const r = data.rates?.[to.toUpperCase()]; if (!r) throw new Error("Devise inconnue");
    await ctx.reply({ text: `💱 ${amt} ${from.toUpperCase()} = ${(amt * r).toFixed(2)} ${to.toUpperCase()}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Currency");
reg("time", (ctx) => ctx.reply({ text: `🕒 ${new Date().toLocaleString("en-US", { timeZone: "Africa/Brazzaville" })}` }), "TOOL", "Time");
reg("weather", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}weather Paris` });
  try {
    const { data } = await axiosInstance.get(`https://wttr.in/${encodeURIComponent(ctx.text)}?format=j1`);
    const c = data.current_condition[0];
    await ctx.reply({ text: `🌤 *${ctx.text}*\n${c.weatherDesc[0].value}\n🌡 ${c.temp_C}°C  💧 ${c.humidity}%  💨 ${c.windspeedKmph} km/h` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Weather");
reg("genpass", (ctx) => {
  const n = Math.max(8, Math.min(64, parseInt(ctx.text) || 16));
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let p = ""; for (let i = 0; i < n; i++) p += c[Math.floor(Math.random() * c.length)];
  ctx.reply({ text: `🔐 ${p}` });
}, "TOOL", "Gen password");
reg("calculate", (ctx) => {
  if (!ctx.text || !/^[\d+\-*/(). %]+$/.test(ctx.text)) return ctx.reply({ text: "❌ .calculate 2+2*5" });
  try { ctx.reply({ text: `🧮 ${ctx.text} = ${Function(`"use strict"; return (${ctx.text})`)()}` }); }
  catch (e) { ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Calculate");
reg("wiki", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}wiki Napoleon` });
  try {
    const { data } = await axiosInstance.get(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(ctx.text)}`);
    await ctx.reply({ text: `📚 *${data.title}*\n\n${data.extract}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Wiki");
reg(["dictionary", "define"], async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}dictionary love` });
  try {
    const { data } = await axiosInstance.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(ctx.text)}`);
    const d = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
    await ctx.reply({ text: `📖 *${ctx.text}*\n\n${d || "No definition"}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Dictionary");
reg("horoscope", async (ctx) => {
  const sign = (ctx.text || "aries").toLowerCase();
  try {
    const { data } = await axiosInstance.get(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`);
    await ctx.reply({ text: `♈ *${sign}*\n\n${data.data?.horoscope_data || "—"}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Horoscope");
reg("mathfact", (ctx) => jokeApi(ctx, `http://numbersapi.com/${encodeURIComponent(ctx.text || "random")}/math?json`, "➗ Math fact"), "TOOL", "Math fact");
reg("sciencefact", (ctx) => jokeApi(ctx, "https://uselessfacts.jsph.pl/random.json?language=en", "🔬 Science fact"), "TOOL", "Science fact");
reg("recipe", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}recipe pasta` });
  try {
    const { data } = await axiosInstance.get(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(ctx.text)}`);
    const m = data.meals?.[0]; if (!m) throw new Error("No recipe");
    await ctx.reply({ text: `🍽 *${m.strMeal}*\n\n${m.strInstructions.slice(0, 1000)}…` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Recipe");
reg("book", async (ctx) => {
  if (!ctx.text) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}book harry potter` });
  try {
    const { data } = await axiosInstance.get(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(ctx.text)}&maxResults=1`);
    const v = data.items?.[0]?.volumeInfo; if (!v) throw new Error("No book");
    await ctx.reply({ text: `📕 *${v.title}*\n👤 ${(v.authors || []).join(", ")}\n\n${(v.description || "").slice(0, 800)}` });
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "TOOL", "Book");
reg("remind", (ctx) => {
  const [sec, ...rest] = (ctx.text || "").split(/\s+/);
  const s = parseInt(sec); if (!s || !rest.length) return ctx.reply({ text: `❌ Exemple : ${config.PREFIX}remind 60 boire de l'eau` });
  ctx.reply({ text: `⏰ Rappel dans ${s}s` });
  setTimeout(() => ctx.reply({ text: `🔔 Rappel : ${rest.join(" ")}` }), s * 1000);
}, "TOOL", "Remind");

// ════════════════════════════════════════════════════════════════
function listAll() { return Object.keys(REGISTRY).sort(); }
module.exports = { REGISTRY, CATEGORIES, listAll, fetchAnimeImage, handleYouTubeAudio };

// ════════════════════════════════════════════════════════════════
// 🔞 +18 — NSFW (waifu.pics nsfw)
// ════════════════════════════════════════════════════════════════
const NSFW = ["waifu", "neko", "trap", "blowjob"];
for (const r of NSFW) {
  reg(r, async (ctx) => {
    try {
      const url = await fetchAnimeImage(r, "nsfw");
      await sendImg(ctx, url, `🔞 ${r}`);
    } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
  }, "+18", `NSFW ${r}`);
}
reg("hentai", async (ctx) => {
  try {
    const pick = NSFW[Math.floor(Math.random() * NSFW.length)];
    const url = await fetchAnimeImage(pick, "nsfw");
    await sendImg(ctx, url, "🔞 hentai");
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "+18", "Hentai random");
reg("paptt", async (ctx) => {
  try {
    const url = await fetchAnimeImage("pat", "sfw");
    await sendImg(ctx, url, "💕 paptt");
  } catch (e) { await ctx.reply({ text: `❌ ${e.message}` }); }
}, "+18", "paptt");
