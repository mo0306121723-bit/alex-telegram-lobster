const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai").default;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 短期記憶：依 chatId 儲存最近對話
const memoryStore = new Map();

// 每個聊天室最多保留幾輪對話
const MAX_MEMORY_MESSAGES = 10;

function getMemory(chatId) {
  if (!memoryStore.has(chatId)) {
    memoryStore.set(chatId, []);
  }
  return memoryStore.get(chatId);
}

function pushMemory(chatId, role, content) {
  const memory = getMemory(chatId);
  memory.push({ role, content });

  // 只保留最近 N 則
  if (memory.length > MAX_MEMORY_MESSAGES) {
    memory.splice(0, memory.length - MAX_MEMORY_MESSAGES);
  }
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) {
    await bot.sendMessage(chatId, "我目前只支援文字訊息。");
    return;
  }

  // 額外指令：查看記憶
  if (text === "/memory") {
    const memory = getMemory(chatId);

    if (memory.length === 0) {
      await bot.sendMessage(chatId, "我目前還沒有記住這段對話內容。");
      return;
    }

    const preview = memory
      .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
      .join("\n\n");

    await bot.sendMessage(chatId, `這是我目前保留的最近記憶：\n\n${preview}`);
    return;
  }

  // 額外指令：清空記憶
  if (text === "/forget") {
    memoryStore.set(chatId, []);
    await bot.sendMessage(chatId, "我已經清空這段對話的短期記憶。");
    return;
  }

  try {
    const memory = getMemory(chatId);

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
          role: "system",
          content: "Alex 出生於 1989/10/11 上午10:56 台北，目前正在發展多個創業與投資項目。"
        },
        ...memory,
        {
          role: "user",
          content: text
        }
      ]
    });

    const reply =
      completion?.choices?.[0]?.message?.content ||
      "我剛剛想了一下，但沒有成功整理出答案。";

    // 把這次對話存進短期記憶
    pushMemory(chatId, "user", text);
    pushMemory(chatId, "assistant", reply);

    await bot.sendMessage(chatId, reply);
  } catch (error) {
    console.error(error);
    await bot.sendMessage(chatId, "出錯了QQ");
  }
});

console.log("🤖 Bot with memory is running...");
