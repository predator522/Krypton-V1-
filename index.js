import { Telegraf, Markup } from "telegraf";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";

// ================== CONFIG ==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const SESSION_DIR = "./session";

// ================== SAFETY CHECK ==================
if (!BOT_TOKEN || !ADMIN_ID) {
  console.error("❌ Missing BOT_TOKEN or ADMIN_ID");
  process.exit(1);
}

// ================== LOGGER ==================
const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

// ================== TELEGRAM BOT ==================
const bot = new Telegraf(BOT_TOKEN);

// ================== HELPERS ==================
const isAdmin = (ctx) => ctx.from?.id === ADMIN_ID;

const normalizeNumber = (num) =>
  num.replace(/\D/g, "").replace(/^0/, "234");

// ================== WHATSAPP PAIRING ==================
async function requestPair(number) {
  const sessionPath = path.join(SESSION_DIR, number);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Krypton-V1", "Chrome", "120"]
  });

  sock.ev.on("creds.update", saveCreds);

  return new Promise(async (resolve, reject) => {
    try {
      await new Promise(r => setTimeout(r, 2500));
      const code = await sock.requestPairingCode(number);
      resolve(code);
    } catch (e) {
      reject(e);
    }
  });
}

// ================== MENU ==================
bot.command("menu", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ Unauthorized");

  await ctx.reply(
    "👑 *Krypton-V1 Control Panel*",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📲 Request Pair", "REQPAIR")],
        [Markup.button.callback("🗑 Delete Pair", "DELPAIR")]
      ])
    }
  );
});

// ================== INLINE CALLBACKS ==================
bot.action("REQPAIR", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("📲 Send:\n`/reqpair 234XXXXXXXXX`", { parse_mode: "Markdown" });
});

bot.action("DELPAIR", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🗑 Send:\n`/delpair 234XXXXXXXXX`", { parse_mode: "Markdown" });
});

// ================== COMMANDS ==================
bot.command("reqpair", async (ctx) => {
  if (!isAdmin(ctx)) return;

  const num = ctx.message.text.split(" ")[1];
  if (!num) return ctx.reply("❌ Usage: /reqpair 234XXXXXXXXX");

  const number = normalizeNumber(num);
  logger.info(`📲 Pair requested: ${number}`);

  try {
    const code = await requestPair(number);
    ctx.reply(`✅ *Pairing Code*\n\`${code}\``, { parse_mode: "Markdown" });
  } catch (e) {
    logger.error(e, "❌ Pairing failed");
    ctx.reply("❌ Failed to get pairing code");
  }
});

bot.command("delpair", (ctx) => {
  if (!isAdmin(ctx)) return;

  const num = ctx.message.text.split(" ")[1];
  if (!num) return ctx.reply("❌ Usage: /delpair 234XXXXXXXXX");

  const number = normalizeNumber(num);
  const dir = path.join(SESSION_DIR, number);

  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    ctx.reply(`✅ Session deleted for ${number}`);
  } else {
    ctx.reply("⚠️ No session found");
  }
});

// ================== GLOBAL ERROR HANDLER ==================
bot.catch((err) => {
  logger.error(err, "🔥 Telegram Error");
});

// ================== START ==================
bot.launch()
  .then(() => logger.info("🚀 Krypton-V1 LIVE (Render)"))
  .catch(err => {
    logger.error(err, "❌ Launch failed");
    process.exit(1);
  });

// ================== GRACEFUL SHUTDOWN ==================
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
