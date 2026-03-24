const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai").default;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🧠 Memory
const memoryStore = new Map();
const MAX_MEMORY_MESSAGES = 12;

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

// 🎯 Mode Detection
function detectMode(text) {
  if (text.startsWith("/decide")) return "decide";
  if (text.startsWith("/validate")) return "validate";
  if (text.startsWith("/build-web")) return "build-web";
  if (text.startsWith("/build")) return "build";
  if (text.startsWith("/debug")) return "debug";
  return "default";
}

function stripCommand(text, mode) {
  return text.replace(/^\/\w+\s*/i, "").trim();
}

// 🧠 System Prompts
function buildSystemPrompt(mode) {
  const base = `
你是 Alex 的 AI 工程師 + 創業合夥人。

風格：
- 直接
- 不講廢話
- 優先給「可以用的東西」
- 不要理論過多
`;

  const prompts = {
    default: `${base}
給結論 → 理由 → 下一步
`,

    decide: `${base}
你是策略軍師，幫 Alex 選「現在最值得做的」。

優先考慮：
1. Alex 現有資源
2. 3個月可驗證
3. 是否能變收入

輸出：
【最推薦】
【原因】
【不選其他原因】
【本週行動（3件）】
`,

    validate: `${base}
你是市場驗證顧問。

輸出：
【假設】
【驗證方法】
【找誰】
【成功/失敗指標】
【本週行動】
`,

    build: `${base}
你是產品經理 + 工程師。

輸出：
【MVP目標】
【核心功能】
【技術建議】
【版本切分】
【下一步】
`,

    "build-web": `${base}
你是全端工程師。

任務：產出「可直接跑的 Web App」

⚠️ 必須給完整 code，不要片段

輸出格式：

【技術選擇】

【專案結構】
(資料夾)

【Frontend Code】
(完整)

【Backend Code】
(完整)

【啟動方式】
(一步一步)

【部署方式】
`,

    debug: `${base}
你是資深工程師。

任務：幫 Alex 找錯並修好

輸出格式：

【問題原因】

【修正方式】

【修正後完整程式碼】

【如何驗證】
`
  };

  return prompts[mode] || prompts.default;
}

// 🤖 Main
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  if (text === "/memory") {
    const memory = getMemory(chatId);
    if (memory.length === 0) {
      return bot.sendMessage(chatId, "目前沒有記憶");
    }
    return bot.sendMessage(
      chatId,
      memory.map((m) => `${m.role}: ${m.content}`).join("\n\n")
    );
  }

  if (text === "/forget") {
    memoryStore.set(chatId, []);
    return bot.sendMessage(chatId, "已清空記憶");
  }

  try {
    const mode = detectMode(text);
    const cleaned = stripCommand(text, mode);
    const memory = getMemory(chatId);

    console.log("MODE:", mode);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt(mode) },
        ...memory,
        { role: "user", content: cleaned }
      ]
    });

    const reply = completion.choices[0].message.content;

    pushMemory(chatId, "user", text);
    pushMemory(chatId, "assistant", reply);

    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "出錯了QQ");
  }
});

console.log("🚀 Agent Engineering Mode Ready");
