const { Telegraf, Markup } = require("telegraf");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");

const BOT_TOKEN = "8335889026:AAFa-CHOPPmIqIeOT33qvp6gHh2NAbKK1Gw";
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN missing");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// =====================
// WhatsApp Socket
// =====================
let sock;
let authState;

async function initWA() {
  authState = await useMultiFileAuthState("./session");

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: authState.state,
    browser: ["Krypton-V1", "Chrome", "120"]
  });

  sock.ev.on("creds.update", authState.saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ WhatsApp connected");
    }
    if (connection === "close") {
      const reason =
        lastDisconnect?.error?.output?.statusCode;

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔁 Reconnecting WhatsApp…");
        initWA();
      } else {
        console.log("❌ Logged out from WhatsApp");
      }
    }
  });
}

initWA();

// =====================
// Inline Menu
// =====================
const menuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("📲 Request Pair", "REQ_PAIR")],
  [Markup.button.callback("🗑 Delete Session", "DEL_PAIR")],
  [Markup.button.callback("ℹ️ Help", "HELP")]
]);

// =====================
// Commands
// =====================
bot.start((ctx) => {
  ctx.reply(
    "👋 Welcome to *Krypton Pairing Bot*\n\nChoose an option:",
    {
      parse_mode: "Markdown",
      ...menuKeyboard
    }
  );
});

bot.command("menu", (ctx) => {
  console.log("📥 /menu from", ctx.from.id);
  ctx.reply("📂 *Main Menu*", {
    parse_mode: "Markdown",
    ...menuKeyboard
  });
});

// =====================
// Inline Actions
// =====================
bot.action("REQ_PAIR", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    "📥 Send command:\n\n`/reqpair 234XXXXXXXXXX`",
    { parse_mode: "Markdown" }
  );
});

bot.action("DEL_PAIR", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("⚠️ Send `/delpair` to delete WhatsApp session", {
    parse_mode: "Markdown"
  });
});

bot.action("HELP", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    "ℹ️ *Help*\n\n" +
      "• `/menu` – Show menu\n" +
      "• `/reqpair number` – Get pairing code\n" +
      "• `/delpair` – Delete session",
    { parse_mode: "Markdown" }
  );
});

// =====================
// Pairing Command
// =====================
bot.command("reqpair", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const number = args[1];

  console.log("📥 /reqpair:", number);

  if (!number || !/^\d+$/.test(number)) {
    return ctx.reply("❌ Usage: `/reqpair 234XXXXXXXXXX`", {
      parse_mode: "Markdown"
    });
  }

  try {
    if (!sock?.authState?.creds?.registered) {
      const code = await sock.requestPairingCode(number);
      ctx.reply(`✅ *Pairing Code:*\n\n\`${code}\``, {
        parse_mode: "Markdown"
      });
    } else {
      ctx.reply("⚠️ Already paired.");
    }
  } catch (err) {
    console.error("❌ Pairing failed:", err.message);
    ctx.reply("❌ Pairing failed. Try again later.");
  }
});

// =====================
// Delete Session
// =====================
bot.command("delpair", async (ctx) => {
  const fs = require("fs");

  try {
    fs.rmSync("./session", { recursive: true, force: true });
    ctx.reply("🗑 WhatsApp session deleted.\nRestart bot.");
    process.exit(0);
  } catch (e) {
    ctx.reply("❌ No session found.");
  }
});

// =====================
// Launch Bot
// =====================
bot.launch()
  .then(() => console.log("🤖 Telegram bot started"))
  .catch((err) => console.error("❌ Launch failed:", err));

process.on("SIGINT", () => bot.stop("SIGINT"));
process.on("SIGTERM", () => bot.stop("SIGTERM"));
