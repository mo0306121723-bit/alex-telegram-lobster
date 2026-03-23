const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai").default;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: text }],
    });

    const reply = completion.choices[0].message.content;

    await bot.sendMessage(chatId, reply);
  } catch (error) {
    console.error(error);
    await bot.sendMessage(chatId, "出錯了QQ");
  }
});

console.log("🤖 Bot is running...");
