/*
┏━━━━━━━━━━━━━━━┓
┃  𝐍𝐀𝐓𝐒𝐔'𝐒 𝐏𝐑𝐎𝐉𝐄𝐂𝐓
┃ Shared mutable state — toggles per group
┗━━━━━━━━━━━━━━━┛
*/

// Each Map: groupJid -> mode/value
// ANTILINK modes: "off" | "delete" | "kick"
const ANTILINK = new Map();
const WELCOME = new Map();   // jid -> true/false
const GOODBYE = new Map();   // jid -> true/false
const ANTISPAM = new Map();  // jid -> true/false

// Track last messages per user per group for antispam: jid -> Map<userJid, ts[]>
const SPAM_TRACK = new Map();

function setAntilink(jid, mode) { ANTILINK.set(jid, mode); }
function getAntilink(jid) { return ANTILINK.get(jid) || "off"; }

function setWelcome(jid, on) { WELCOME.set(jid, !!on); }
function isWelcomeOn(jid) { return WELCOME.get(jid) !== false; }

function setGoodbye(jid, on) { GOODBYE.set(jid, !!on); }
function isGoodbyeOn(jid) { return GOODBYE.get(jid) !== false; }

function setAntispam(jid, on) { ANTISPAM.set(jid, !!on); }
function isAntispamOn(jid) { return !!ANTISPAM.get(jid); }

// Returns true if user is flooding (5 msgs in 7 seconds)
function trackAndCheckFlood(jid, userJid) {
  if (!SPAM_TRACK.has(jid)) SPAM_TRACK.set(jid, new Map());
  const userMap = SPAM_TRACK.get(jid);
  const now = Date.now();
  const arr = (userMap.get(userJid) || []).filter((t) => now - t < 7000);
  arr.push(now);
  userMap.set(userJid, arr);
  return arr.length >= 5;
}

module.exports = {
  setAntilink, getAntilink,
  setWelcome, isWelcomeOn,
  setGoodbye, isGoodbyeOn,
  setAntispam, isAntispamOn,
  trackAndCheckFlood,
};
