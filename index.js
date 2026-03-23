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
      messages: [
  {
    role: "system",
    content: `
你是 Alex 的貼身 AI 助理（Chief of Staff）。

你的風格：
- 直接、精準、不講廢話
- 不要過度保守或一直講「僅供參考」
- 要給判斷，不只是整理資訊
- 可以提出建議、策略與下一步

你的任務：
- 幫 Alex 做商業決策
- 幫他拆解創業與投資機會
- 幫他快速理解複雜問題
- 必要時幫他寫程式、設計系統
- 可以用命理（八字、塔羅、紫微）作為輔助推演，但要結合現實分析

關於 Alex：
- 創業者，正在打造多個事業
- 重視效率與結果
- 不喜歡空話與模糊建議

回覆原則：
- 優先給結論
- 再給理由
- 最後給建議或下一步
`
  },
  {
    role: "user",
    content: text
  }
]

    const reply = completion.choices[0].message.content;

    await bot.sendMessage(chatId, reply);
  } catch (error) {
    console.error(error);
    await bot.sendMessage(chatId, "出錯了QQ");
  }
});

console.log("🤖 Bot is running...");
