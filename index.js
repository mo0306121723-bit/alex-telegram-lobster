const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai").default;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== Memory =====
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

function clearMemory(chatId) {
  memoryStore.set(chatId, []);
}

// ===== Prompts =====
const BASE_SYSTEM_PROMPT = `
你是 Alex 的貼身 AI 助理（Chief of Staff），同時也是他的技術合夥人、產品經理與資深工程師。

你的核心角色：
1. 商業策略助理
2. 系統設計師
3. 軟體工程師
4. 專案推進助理

你的風格：
- 直接、精準、不講廢話
- 優先給結論
- 要給判斷，不只是整理資訊
- 優先解決問題，不要只講概念
- 當使用者問技術問題時，要像真的工程師一樣思考
- 當使用者問商業問題時，要像真的創業顧問一樣思考

關於 Alex：
- 創業者
- 多專案並行
- 重效率與結果
- 不喜歡空話與模糊建議
- 希望 AI 不只是聊天，而是真的能幫忙完成事情

通用回覆原則：
- 先結論
- 再理由
- 最後給下一步
- 遇到需求不清楚時，只問最關鍵的 1 到 3 個問題
- 若需求已足夠，直接產出可執行內容
`;

const ALEX_CONTEXT_PROMPT =
  "Alex 出生於 1989/10/11 上午10:56 台北，目前正在發展多個創業與投資項目。回答問題前，請優先根據對話記憶推論，不要忽略已知資訊。";

function getModeInstruction(mode) {
  switch (mode) {
    case "task":
      return `
你現在處於 Task Agent 模式。
你的任務是把模糊想法拆成可執行待辦。

回答格式固定如下：
1. 目標
2. 關鍵假設
3. 主要風險
4. 下一步待辦（3到7項）
5. 本週最值得先做的 1 件事

請務必具體，不要空泛。
`;

    case "spec":
      return `
你現在處於 Product Spec Agent 模式。
你的任務是把需求整理成清楚的產品規格文件。

回答格式固定如下：
1. 產品目標
2. 目標使用者
3. 核心問題
4. 核心功能
5. 使用流程
6. MVP 範圍
7. 不做什麼
8. 風險與待確認事項

請用產品經理口吻，清楚、結構化、可交付給工程師。
`;

    case "code":
      return `
你現在處於 Engineer Agent 模式。
你的任務不是解釋，而是把東西做出來。

工程師模式原則：
- 需求清楚 → 直接給可執行方案
- 需求不清楚 → 先列出最關鍵的 1 到 3 個缺口
- 程式碼要「可跑」，不是片段
- 優先使用簡單、主流、穩定技術
- 如果是在做 MVP，優先追求簡單可跑
- 預設要有基本錯誤處理與可維護性

回答格式固定如下：
1. 結論
2. 技術選擇
3. 專案結構
4. 完整程式碼
5. 如何啟動 / 測試
6. 下一步擴充

除非使用者要求，不要只給概念，請盡量給完整可用內容。
`;

    case "github":
      return `
你現在處於 GitHub Agent 模式。
你的任務是幫 Alex 產出「可直接放進 GitHub repo」的內容。

回答格式固定如下：
1. Repo 名稱建議
2. 專案目錄結構
3. README.md（完整內容）
4. 開發待辦清單
5. 建議建立的檔案
6. Commit plan（第一批 commit 建議）

如果適合，請直接給 markdown 格式內容。
`;

    default:
      return `
你現在處於 General Chief of Staff 模式。
請根據記憶與上下文，直接回答，給結論、理由與下一步。
`;
  }
}

function parseMode(text) {
  if (text.startsWith("/task")) return "task";
  if (text.startsWith("/spec")) return "spec";
  if (text.startsWith("/code")) return "code";
  if (text.startsWith("/github")) return "github";
  return "general";
}

function stripCommand(text, mode) {
  if (mode === "general") return text.trim();
  const firstSpace = text.indexOf(" ");
  if (firstSpace === -1) return "";
  return text.slice(firstSpace + 1).trim();
}

function helpText() {
  return `可用指令：

/task <你的想法>
把想法拆成可執行待辦

/spec <你的需求>
整理成產品規格

/code <你的需求>
用工程師模式產出 MVP / 程式碼

/github <你的需求>
產出 repo 結構、README、開發計畫

/memory
查看目前短期記憶

/forget
清空短期記憶

/help
查看指令說明`;
}

// ===== Bot =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log("📩 incoming message:", { chatId, text });

  if (!text) {
    await bot.sendMessage(chatId, "目前只支援文字訊息");
    return;
  }

  if (text === "/start") {
    await bot.sendMessage(
      chatId,
      `TOMAbot 已上線。

我現在可以幫你做幾件事：
- 用 /task 拆待辦
- 用 /spec 做規格
- 用 /code 寫程式
- 用 /github 整理 repo 結構
- 用 /memory 看短期記憶
- 用 /forget 清空記憶

輸入 /help 可查看完整說明。`
    );
    return;
  }

  if (text === "/help") {
    await bot.sendMessage(chatId, helpText());
    return;
  }

  if (text === "/memory") {
    const memory = getMemory(chatId);
    console.log("🧠 memory requested:", memory);

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

  if (text === "/forget") {
    clearMemory(chatId);
    console.log("🗑️ memory cleared:", chatId);
    await bot.sendMessage(chatId, "記憶已清空");
    return;
  }

  try {
    const mode = parseMode(text);
    const userInput = stripCommand(text, mode);
    const memory = getMemory(chatId);

    if (mode !== "general" && !userInput) {
      await bot.sendMessage(chatId, `你少了內容喔。\n\n${helpText()}`);
      return;
    }

    console.log("🧠 current memory:", memory);
    console.log("🧭 mode:", mode);

    const finalUserText =
      mode === "general"
        ? text
        : `請用 ${mode.toUpperCase()} 模式處理以下內容：\n\n${userInput}`;

    console.log("🔥 hitting OpenAI API...");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: BASE_SYSTEM_PROMPT,
        },
        {
          role: "system",
          content: ALEX_CONTEXT_PROMPT,
        },
        {
          role: "system",
          content: getModeInstruction(mode),
        },
        ...memory,
        {
          role: "user",
          content: finalUserText,
        },
      ],
    });

    const reply =
      completion?.choices?.[0]?.message?.content || "我剛剛沒有成功整理出答案。";

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

console.log("🤖 Agent Ready v1");
