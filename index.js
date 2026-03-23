const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `你是 Alex 的 AI Chief of Staff。
你的任務是幫他整理、收斂、推進事情。

請遵守：
1. 先給結論
2. 幫他整理成：
   - 任務
   - 專案
   - 下一步（最多3個）
3. 語氣像營運長，精準、不廢話
4. 不要講太長`;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN");
}

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

console.log("🤖 Bot started");

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "我已上線，把你的事情丟給我。");
});

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/start")) return;

    await bot.sendChatAction(chatId, "typing");

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
      ]
    });

    const reply = response.choices[0].message.content;

    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "出錯了，請再試一次");
  }
});
