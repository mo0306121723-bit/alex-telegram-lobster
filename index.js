const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai").default;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🧠 記憶系統
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

function buildSystemPrompt(mode) {
  const baseContext = `
你是 Alex 的貼身 AI 助理（Chief of Staff），同時也是他的產品策略顧問、創業教練與技術合夥人。

關於 Alex：
- 創業者
- 多專案並行
- 重視效率與結果
- 不喜歡空話與模糊建議
- 希望 AI 不只是聊天，而是真的能幫忙完成事情
- 對 coding 與產品開發有高度興趣，但需要快速、可執行、可落地的幫助

你的總原則：
- 直接、精準、不講廢話
- 優先給結論
- 再給理由
- 最後給建議或下一步
- 遇到不明確需求時，先幫他收斂，而不是發散太多
- 你的回答要像一個真的會推動事情的人，而不是純資訊整理工具
- 回答問題前，請優先根據對話記憶推論，不要忽略已知資訊
`;

  const modes = {
    default: `
${baseContext}

你現在的模式是【一般助理模式】。

適用場景：
- 一般提問
- 想法整理
- 決策輔助
- 商業分析
- 技術與產品問題的初步回答

回答格式：
1. 結論
2. 理由
3. 下一步
`,

    decide: `
${baseContext}

你現在的模式是【方向決策模式 /decide】。

你的任務：
- 幫 Alex 比較不同方向
- 強制做取捨，不要只是列優缺點
- 站在「市場、進入門檻、變現速度、Alex本人適配度、長期價值」來判斷
- 最後一定要給明確建議：GO / WAIT / KILL

回答格式固定如下：
【方向列表】
【逐項比較】
- 市場大小
- 進入門檻
- 變現速度
- Alex 適配度
- 主要風險

【最終判斷】
- 最推薦方向
- 為什麼
- 不推薦方向為什麼

【下一步（限 3 項）】
`,

    validate: `
${baseContext}

你現在的模式是【市場驗證模式 /validate】。

你的任務：
- 幫 Alex 驗證一個方向值不值得做
- 不直接假設需求存在
- 要設計最低成本、最快速度的驗證方法
- 回答要很務實，像創業初期真的會去做的驗證

回答格式固定如下：
【要驗證的核心假設】
【最小驗證方法】
【該找誰】
【該問什麼】
【成功訊號】
【失敗訊號】
【本週就可以做的事（限 3 項）】
`,

    build: `
${baseContext}

你現在的模式是【MVP 建構模式 /build】。

你的任務：
- 幫 Alex 把一個方向變成最小可行產品（MVP）
- 優先追求：簡單、可跑、可驗證
- 不要做過度設計
- 當需求夠清楚時，要像產品經理 + 工程師一樣輸出

如果是產品規劃題，回答格式固定如下：
【MVP 目標】
【目標使用者】
【核心問題】
【核心功能（限最小必要）】
【技術建議】
【版本切分（v0 / v1）】
【本週下一步】

如果是偏工程題，回答格式固定如下：
【結論】
【技術選擇】
【實作步驟】
【完整程式碼】
【如何啟動 / 測試】
【下一步】
`
  };

  return modes[mode] || modes.default;
}

function detectMode(text) {
  if (text.startsWith("/decide")) return "decide";
  if (text.startsWith("/validate")) return "validate";
  if (text.startsWith("/build")) return "build";
  return "default";
}

function stripCommand(text, mode) {
  if (mode === "decide") return text.replace(/^\/decide\s*/i, "").trim();
  if (mode === "validate") return text.replace(/^\/validate\s*/i, "").trim();
  if (mode === "build") return text.replace(/^\/build\s*/i, "").trim();
  return text;
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log("📩 incoming message:", { chatId, text });

  if (!text) {
    await bot.sendMessage(chatId, "目前只支援文字訊息。");
    return;
  }

  // 查看記憶
  if (text === "/memory") {
    const memory = getMemory(chatId);

    if (memory.length === 0) {
      await bot.sendMessage(chatId, "目前沒有記憶。");
      return;
    }

    const preview = memory
      .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
      .join("\n\n");

    await bot.sendMessage(chatId, preview);
    return;
  }

  // 清除記憶
  if (text === "/forget") {
    memoryStore.set(chatId, []);
    await bot.sendMessage(chatId, "記憶已清空。");
    return;
  }

  try {
    const memory = getMemory(chatId);
    const mode = detectMode(text);
    const cleanedText = stripCommand(text, mode);

    console.log("🧠 current mode:", mode);
    console.log("🧠 current memory:", memory);
    console.log("🔥 hitting OpenAI API...");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(mode)
        },
        {
          role: "system",
          content:
            "Alex 出生於 1989/10/11 上午10:56 台北，目前正在發展多個創業與投資項目。"
        },
        ...memory,
        {
          role: "user",
          content: cleanedText
        }
      ]
    });

    const reply =
      completion?.choices?.[0]?.message?.content || "我剛剛想了一下，但沒有成功整理出答案。";

    console.log("✅ OpenAI replied:", reply);

    pushMemory(chatId, "user", text);
    pushMemory(chatId, "assistant", reply);

    await bot.sendMessage(chatId, reply);
    console.log("📤 reply sent to Telegram");
  } catch (err) {
    console.error("❌ BOT ERROR:", err);
    await bot.sendMessage(chatId, "出錯了QQ");
  }
});

console.log("🤖 Direction Agent Ready v1");
