import { Telegraf, Markup } from "telegraf";
import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";

/* ========= CONFIG ========= */
const BOT_TOKEN = "8335889026:AAFa-CHOPPmIqIeOT33qvp6gHh2NAbKK1Gw";
const ADMIN_ID = 8251180804;
const SESSION_DIR = "./session";

/* ========= LOGGER ========= */
const logger = pino({ level: "silent" });

/* ========= BOT ========= */
const bot = new Telegraf(BOT_TOKEN);

/* ========= HELPERS ========= */
const isAdmin = (ctx) => ctx.from?.id === ADMIN_ID;
const normalize = (n) => n.replace(/\D/g, "").replace(/^0/, "234");

/* ========= WHATSAPP PAIR ========= */
async function pairNumber(number) {
  const dir = `./session/${number}`;
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Krypton-V1", "Chrome", "120"],
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  return new Promise((resolve, reject) => {
    sock.ev.on("connection.update", async (u) => {
      if (u.connection === "open" && !state.creds.registered) {
        try {
          await new Promise(r => setTimeout(r, 3000)); // REQUIRED
          const code = await sock.requestPairingCode(number);
          resolve(code);
        } catch (e) {
          reject(e);
        }
      }

      if (u.connection === "close") {
        reject(new Error("Connection closed"));
      }
    });
  });
}
/* ========= MENU ========= */
bot.command("menu", async (ctx) => {
  if (!isAdmin(ctx)) return;

  await ctx.reply(
    "👑 *Krypton-V1 Panel*",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📲 Request Pair", "REQ")],
        [Markup.button.callback("🗑 Delete Pair", "DEL")]
      ])
    }
  );
});

/* ========= CALLBACKS ========= */
bot.action("REQ", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Send:\n`/reqpair 234XXXXXXXXX`", { parse_mode: "Markdown" });
});

bot.action("DEL", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Send:\n`/delpair 234XXXXXXXXX`", { parse_mode: "Markdown" });
});

/* ========= COMMANDS ========= */
bot.command("reqpair", async (ctx) => {
  if (!isAdmin(ctx)) return;

  const num = ctx.message.text.split(" ")[1];
  if (!num) return ctx.reply("Usage: /reqpair 234XXXXXXXXX");

  const number = normalize(num);

  try {
    const code = await pairNumber(number);
    ctx.reply(`✅ *Pairing Code*\n\`${code}\``, { parse_mode: "Markdown" });
  } catch {
    ctx.reply("❌ Pairing failed");
  }
});

bot.command("delpair", (ctx) => {
  if (!isAdmin(ctx)) return;

  const num = ctx.message.text.split(" ")[1];
  if (!num) return ctx.reply("Usage: /delpair 234XXXXXXXXX");

  const dir = path.join(SESSION_DIR, normalize(num));
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    ctx.reply("✅ Session deleted");
  } else {
    ctx.reply("⚠️ No session found");
  }
});

/* ========= START ========= */
bot.launch()
  .then(() => console.log("🚀 Krypton-V1 running"))
  .catch(console.error);
