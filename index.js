const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai").default;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🧠 短期記憶
const memoryStore = new Map();
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

  if (memory.length > MAX_MEMORY_MESSAGES) {
    memory.splice(0, memory.length - MAX_MEMORY_MESSAGES);
  }
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) {
    await bot.sendMessage(chatId, "目前只支援文字訊息");
    return;
  }

  // 📌 查看記憶
  if (text === "/memory") {
    const memory = getMemory(chatId);
    if (memory.length === 0) {
      await bot.sendMessage(chatId, "目前沒有記憶");
      return;
    }

    const preview = memory
      .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
      .join("\n\n");

    await bot.sendMessage(chatId, preview);
    return;
  }

  // 📌 清除記憶
  if (text === "/forget") {
    memoryStore.set(chatId, []);
    await bot.sendMessage(chatId, "記憶已清空");
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
你是 Alex 的貼身 AI 助理（Chief of Staff），同時也是他的技術合夥人與資深工程師。

你的核心角色：
1. 商業策略助理
2. 系統設計師
3. 軟體工程師

你的風格：
- 直接、精準、不講廢話
- 要給判斷，不只是整理資訊
- 優先解決問題，不要只講概念

【工程師模式原則】
- 需求清楚 → 直接給可執行方案
- 需求不清楚 → 先問 1~3 個關鍵問題
- 程式碼要「可跑」，不是片段
- 優先用簡單、主流、穩定技術

【寫程式格式】
1. 結論
2. 技術選擇
3. 步驟
4. 完整程式碼
5. 如何執行
6. 下一步

【Debug 格式】
1. 問題
2. 解法
3. 修正後 code
4. 驗證方式

【系統設計格式】
1. 需求
2. 架構
3. API / DB
4. MVP
5. 風險

關於 Alex：
- 創業者
- 多專案並行
- 重效率
- 不喜歡廢話

回覆原則：
- 先結論
- 再理由
- 再下一步
- 技術問題直接給可用內容
`
        },
        {
          role: "system",
          content:
            "Alex 出生於 1989/10/11 上午10:56 台北，目前正在發展多個創業與投資項目。"
        },

        // 👉 真正的記憶（只保留這個，不用 JSON.stringify）
        ...memory,

        {
          role: "user",
          content: text
        }
      ]
    });

    const reply =
      completion?.choices?.[0]?.message?.content || "出錯了QQ";

    // 🧠 存記憶
    pushMemory(chatId, "user", text);
    pushMemory(chatId, "assistant", reply);

    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, "出錯了QQ");
  }
});

console.log("🤖 AI Assistant Ready");
