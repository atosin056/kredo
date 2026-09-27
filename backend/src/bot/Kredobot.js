import fs from "node:fs/promises";
import { Bot, InputFile } from "grammy";
import sharp from "sharp";
import "dotenv/config";
import db from "../db/db.js";
import extractIntent from "../services/intentService.js";

// Hard cap on how many transfers from a single multi-transfer message we'll
// queue up. Protects against a mis-parsed message inflating the "transfers"
// array to something absurd.
const MAX_TRANSFER_BATCH_SIZE = 5;

// The bot class is the Telegram orchestration layer.
// It should coordinate user flow, command handling, and session management,
// while business/data logic is kept in dedicated service files.
class Kredobot {
  constructor() {
    // Create the actual Telegram bot instance with the token from .env.
    this.bot = new Bot(process.env.BOT_TOKEN);
    this.bot.catch((err) => {
      console.error("GRAMMY ERROR:", err);
    });

    console.log("BOT CREATED");
    // Local in-memory storage for users created during signup flow.
    // This is temporary and should later be replaced with a real database layer.
    this.accounts = [];

    // Map of userId -> signup session state.
    // Example: { telegramId, step: "name|phone|pin", ... }
    this.sessions = new Map();

    // Register all command and message listeners when the class is instantiated.
    this.registerHandlers();

    this.userAccounts_bot = [
      { account_no: null, bank_name: null, account_name: null },
    ];

    this.userAccounts_db = [];

    this.add_acct_stage = 0;

    console.log("HANDLERS REGISTERED");
  }

  // Start the bot polling loop.
  start() {
    this.bot.start();
  }

  // Shared helper to show Telegram typing status for user feedback.
  async typing(ctx) {
    await ctx.replyWithChatAction("typing");
  }

  getMissingTransferFields(draft = {}) {
    const requiredFields = [
      "amount",
      "sender_bank",
      "recipient_bank",
      "recipient_account_number",
    ];

    return requiredFields.filter((field) => {
      const value = draft[field];
      return value === null || value === undefined || value === "";
    });
  }

  getTransferPrompt(field) {
    const prompts = {
      amount: "How much do you want to send?",
      sender_bank: "Which bank or wallet are you sending from?",
      recipient_bank: "Which bank is the recipient receiving the money?",
      recipient_account_number: "What is the recipient's account number?",
      pin: "Enter PIN to confirm this transfer.",
    };

    return prompts[field] || "Please provide the missing transfer detail.";
  }

  getTransferPinPrompt({ amount, recipientName, recipientBank, senderBank }) {
    const formattedAmount = Number(amount || 0).toLocaleString("en-NG");
    const namePart = recipientName ? ` to ${recipientName}` : "";
    const bankPart = recipientBank ? ` at ${recipientBank}` : "";
    const sourcePart = senderBank ? ` from your ${senderBank} account` : "";

    return `Enter PIN to transfer ₦${formattedAmount}${namePart}${bankPart}${sourcePart}.`;
  }
  async ensureTransferFollowUp(ctx, userId, intent) {
    const entities = intent?.entities || {};
    const existingSession = this.sessions.get(userId) || {};

    const draft = {
      amount: null,
      sender_bank: null,
      recipient_bank: null,
      recipient_account_number: null,
      ...(existingSession.draft || {}),
    };

    for (const [key, value] of Object.entries(entities)) {
      if (value !== null && value !== undefined && value !== "") {
        draft[key] = value;
      }
    }

    const missingFields = this.getMissingTransferFields(draft);

    if (!missingFields.length) {
      let recipientAccount = null;

      // If recipient name is missing, use the account number
      // to look up the recipient's real account name.
      if (!draft.recipient_name && draft.recipient_account_number) {
        recipientAccount = await this.findRecipientAccountByName(
          null,
          draft.recipient_bank,
          draft.recipient_account_number,
          userId,
        );

        if (recipientAccount) {
          draft.recipient_name = recipientAccount.account_name;
        }
      }

      const amount = Number(draft.amount);

      const recipientName =
        draft.recipient_name || draft.recipient_account_number || "recipient";

      const senderBank = draft.sender_bank || "your account";
      const recipientBank = draft.recipient_bank || "recipient bank";

      const pinPrompt = this.getTransferPinPrompt({
        amount,
        recipientName,
        recipientBank,
        senderBank,
      });

      this.sessions.set(userId, {
        ...existingSession,
        flow: "transfer",
        pendingField: "pin",
        pendingQuestion: pinPrompt,
        draft,
      });

      await ctx.reply(pinPrompt);
      return true;
    }

    const pendingField = missingFields[0];

    this.sessions.set(userId, {
      ...existingSession,
      flow: "transfer",
      pendingField,
      pendingQuestion: this.getTransferPrompt(pendingField),
      draft,
    });

    await ctx.reply(this.getTransferPrompt(pendingField));
    return true;
  }

  /**
   * Pops the next transfer draft off a queued batch (from a message that
   * requested several transfers at once) and kicks off its follow-up flow
   * (missing-field prompts, beneficiary confirmation, PIN — same as any
   * single transfer). Re-attaches the remaining queue (and batch tracking
   * info) to the session afterwards, since ensureTransferFollowUp
   * overwrites the session entry.
   *
   * When the queue is empty and this was part of a batch (batchTotal set),
   * sends the end-of-batch summary instead of just going quiet.
   * @param {import("grammy").Context} ctx
   * @param {number} userId
   * @param {Array<object>} queue - remaining transfer entity objects
   * @param {Array<object>} [batchResults] - results recorded so far for this batch
   * @param {number|null} [batchTotal] - total transfers in this batch, or null if not a batch
   * @returns {Promise<boolean>} true if a queued transfer was started
   */
  async continueTransferQueue(
    ctx,
    userId,
    queue = [],
    batchResults = [],
    batchTotal = null,
  ) {
    if (!Array.isArray(queue) || !queue.length) {
      if (batchTotal) {
        await this.sendBatchSummary(ctx, batchResults, batchTotal);
      }
      return false;
    }

    const [nextTransfer, ...remaining] = queue;

    await ctx.reply(
      `➡️ Next transfer from your message (${remaining.length + 1} left):`,
    );
    await this.ensureTransferFollowUp(ctx, userId, { entities: nextTransfer });

    const updatedSession = this.sessions.get(userId) || {};
    this.sessions.set(userId, {
      ...updatedSession,
      queue: remaining,
      batchResults,
      batchTotal,
    });

    return true;
  }

  /**
   * Builds a short human-readable label for a transfer draft, used in
   * batch summaries and cancellation messages, e.g. "₦2,000 to Joshua".
   * @param {object} draft
   * @returns {string}
   */
  describeTransferDraft(draft = {}) {
    const amount = draft.amount
      ? `₦${Number(draft.amount).toLocaleString("en-NG")}`
      : "an unspecified amount";
    const recipient =
      draft.recipient_name ||
      draft.recipient_bank ||
      draft.recipient_account_number ||
      "a recipient";

    return `${amount} to ${recipient}`;
  }

  /**
   * Sends the end-of-batch summary once every transfer in a multi-transfer
   * message has been attempted (successfully, unsuccessfully, or cancelled).
   * No-ops if this wasn't part of a batch (batchTotal falsy).
   * @param {import("grammy").Context} ctx
   * @param {Array<object>} batchResults
   * @param {number|null} batchTotal
   */
  async sendBatchSummary(ctx, batchResults = [], batchTotal = null) {
    if (!batchTotal) return;

    const successCount = batchResults.filter(
      (result) => result.status === "success",
    ).length;
    const failedCount = batchResults.filter(
      (result) => result.status === "failed",
    ).length;
    const cancelledCount = batchResults.filter(
      (result) => result.status === "cancelled",
    ).length;

    const lines = batchResults.map((result) => {
      const icon =
        result.status === "success"
          ? "✅"
          : result.status === "cancelled"
            ? "🚫"
            : "❌";
      const reasonSuffix = result.reason ? ` — ${result.reason}` : "";
      return `${icon} ${result.label}${reasonSuffix}`;
    });

    const headline =
      successCount === batchTotal
        ? `✅ All ${batchTotal} transfers from your message completed successfully!`
        : `📋 Batch complete: ${successCount}/${batchTotal} succeeded` +
          (failedCount ? `, ${failedCount} failed` : "") +
          (cancelledCount ? `, ${cancelledCount} cancelled` : "") +
          ".";

    await ctx.reply(`${headline}\n\n${lines.join("\n")}`);
  }

  async findByTelegramId(telegramId) {
    const [rows] = await db.execute(
      "SELECT * FROM users WHERE telegramId = ?",
      [telegramId],
    );

    return rows[0] || null;
  }

  async findBeneficiaryByName(userId, recipientName, recipientBank = null) {
    if (!recipientName) return null;

    const normalizedName = `%${String(recipientName).trim().toLowerCase()}%`;
    let sql = `SELECT * FROM beneficiaries WHERE telegram_id = ?`;
    const params = [userId];

    if (recipientBank) {
      sql += ` AND LOWER(TRIM(bank_name)) = ?`;
      params.push(String(recipientBank).trim().toLowerCase());
    }

    sql += ` AND LOWER(TRIM(nickname)) LIKE ? ORDER BY id DESC LIMIT 1`;
    params.push(normalizedName);

    const [rows] = await db.execute(sql, params);
    return rows[0] || null;
  }

  async findBankAccountByNumber(bankName, accountNo) {
    if (!bankName || !accountNo) return null;

    const [rows] = await db.execute(
      `SELECT * FROM bank_accounts WHERE bank_name = ? AND account_no = ? LIMIT 1`,
      [String(bankName).trim(), String(accountNo).trim()],
    );

    return rows[0] || null;
  }

  async findRecipientAccountByName(
    recipientName,
    recipientBank = null,
    recipientAccountNumber = null,
    userId = null,
  ) {
    if (userId && recipientName) {
      const beneficiary = await this.findBeneficiaryByName(
        userId,
        recipientName,
        recipientBank,
      );

      if (beneficiary) {
        const linkedAccount = await this.findBankAccountByNumber(
          beneficiary.bank_name,
          beneficiary.account_no,
        );

        return {
          ...beneficiary,
          account_name:
            linkedAccount?.account_name ||
            beneficiary.nickname ||
            recipientName,
          bank_name: beneficiary.bank_name || recipientBank,
          account_no: beneficiary.account_no || recipientAccountNumber,
          telegram_id: linkedAccount?.telegram_id || beneficiary.telegram_id,
        };
      }
    }

    if (!recipientName && !recipientBank && !recipientAccountNumber)
      return null;

    const bankFilter = recipientBank ? String(recipientBank).trim() : null;
    const accountFilter = recipientAccountNumber
      ? String(recipientAccountNumber).trim()
      : null;

    const looksLikeAccountNo = /^\d{10}$/.test(
      String(recipientName || "").trim(),
    );

    // Only fuzzy-match on name when we have a real name and no exact account number
    const normalizedName =
      recipientName &&
      recipientName !== recipientBank &&
      !looksLikeAccountNo &&
      !accountFilter
        ? `%${String(recipientName).trim().toLowerCase()}%`
        : null;

    let sql = `SELECT * FROM bank_accounts WHERE 1 = 1`;
    const params = [];

    if (bankFilter) {
      sql += ` AND LOWER(TRIM(bank_name)) = ?`;
      params.push(bankFilter.toLowerCase());
    }

    if (accountFilter) {
      sql += ` AND account_no = ?`;
      params.push(accountFilter);
    }

    if (normalizedName) {
      sql += ` AND LOWER(TRIM(account_name)) LIKE ?`;
      params.push(normalizedName);
    }

    sql += ` LIMIT 1`;

    console.log("[findRecipientAccountByName] input:", {
      recipientName,
      recipientBank,
      recipientAccountNumber,
      userId,
    });
    console.log("[findRecipientAccountByName] sql:", sql, params);

    const [rows] = await db.execute(sql, params);
    console.log("[findRecipientAccountByName] rows:", rows);
    return rows[0] || null;
  }

  async getBalanceByTelegramId(telegramId) {
    const [rows] = await db.execute(
      "SELECT balance FROM users WHERE telegramId = ?",
      [telegramId],
    );

    return rows[0]?.balance ?? 0;
  }

  async updateBalanceByTelegramId(
    telegramId,
    newBalance,
    bankName = null,
    accountNo = null,
  ) {
    if (!bankName) {
      throw new Error(
        "Missing bank_name in bank balance update. Sender bank is required.",
      );
    }

    let sql =
      "UPDATE bank_accounts SET balance = ? WHERE telegram_id = ? AND bank_name = ?";
    const params = [newBalance, telegramId, String(bankName).trim()];

    if (accountNo) {
      sql += " AND account_no = ?";
      params.push(String(accountNo).trim());
    }

    await db.execute(sql, params);
  }

  async generateTransferReceiptImage(transferData) {
    const logoBuffer = await fs.readFile(
      new URL("../../assets/logo.png", import.meta.url),
    );
    const logoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    const safe = {
      senderName: this.escapeXml(transferData.senderName || "You"),
      recipientName: this.escapeXml(transferData.recipientName || "Recipient"),
      senderBank: this.escapeXml(transferData.senderBank || "Kredo"),
      recipientBank: this.escapeXml(
        transferData.recipientBank || "Recipient Bank",
      ),
      amount: this.escapeXml(String(transferData.amount || 0)),
      reference: this.escapeXml(
        transferData.reference || `KREDO-${Date.now()}`,
      ),
      date: this.escapeXml(
        transferData.date || new Date().toLocaleString("en-NG"),
      ),
    };

    const svg = `
      <svg width="900" height="1200" viewBox="0 0 900 1200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" x2="1">
            <stop offset="0%" stop-color="#0b4ecb"/>
            <stop offset="100%" stop-color="#0d5ed7"/>
          </linearGradient>
        </defs>
        <rect width="900" height="1200" fill="#f3f4f6"/>
        <rect x="0" y="0" width="900" height="1180" fill="url(#bg)"/>
        <path d="M0 1140 C130 1060, 220 1050, 350 1103 C470 1150, 620 1155, 900 1065 L900 1200 L0 1200 Z" fill="#f7c948"/>
        <path d="M0 1030 C130 960, 220 955, 360 1045 C490 1123, 630 1120, 900 980 L900 1200 L0 1200 Z" fill="#f7c948" opacity="0.9"/>
        <rect x="70" y="120" width="760" height="950" rx="26" fill="#f2f7f8"/>
        <image href="${logoDataUri}" x="120" y="40" width="220" height="120" preserveAspectRatio="xMidYMid meet"/>
        <text x="662" y="112" font-size="30" fill="#0d7b5d" font-weight="700" font-family="Arial, sans-serif">kredo.</text>
        <text x="120" y="235" font-size="24" fill="#0f172a" font-weight="700" font-family="Arial, sans-serif">DEBIT</text>
        <text x="120" y="330" font-size="64" fill="#111827" font-weight="700" font-family="Arial, sans-serif">₦${safe.amount}</text>
        <rect x="650" y="255" width="120" height="70" rx="14" fill="#0e7f65"/>
        <text x="710" y="300" text-anchor="middle" font-size="42" fill="#ffffff" font-weight="700" font-family="Arial, sans-serif">K</text>

        <rect x="95" y="370" width="710" height="560" rx="22" fill="#ffffff" opacity="0.92"/>
        <text x="130" y="430" font-size="22" fill="#475569" font-family="Arial, sans-serif">Transaction Type</text>
        <text x="690" y="430" text-anchor="end" font-size="22" fill="#0f172a" font-weight="600" font-family="Arial, sans-serif">Transfer</text>

        <text x="130" y="500" font-size="22" fill="#475569" font-family="Arial, sans-serif">Sender Name</text>
        <text x="690" y="500" text-anchor="end" font-size="22" fill="#0f172a" font-weight="600" font-family="Arial, sans-serif">${safe.senderName}</text>

        <text x="130" y="570" font-size="22" fill="#475569" font-family="Arial, sans-serif">Source Institution</text>
        <text x="690" y="570" text-anchor="end" font-size="22" fill="#0f172a" font-weight="600" font-family="Arial, sans-serif">${safe.senderBank}</text>

        <text x="130" y="640" font-size="22" fill="#475569" font-family="Arial, sans-serif">Beneficiary</text>
        <text x="690" y="640" text-anchor="end" font-size="22" fill="#0f172a" font-weight="600" font-family="Arial, sans-serif">${safe.recipientName}</text>

        <text x="130" y="710" font-size="22" fill="#475569" font-family="Arial, sans-serif">Beneficiary Institution</text>
        <text x="690" y="710" text-anchor="end" font-size="22" fill="#0f172a" font-weight="600" font-family="Arial, sans-serif">${safe.recipientBank}</text>

        <text x="130" y="780" font-size="22" fill="#475569" font-family="Arial, sans-serif">Transaction Date</text>
        <text x="690" y="780" text-anchor="end" font-size="20" fill="#0f172a" font-weight="600" font-family="Arial, sans-serif">${safe.date}</text>

        <text x="130" y="850" font-size="22" fill="#475569" font-family="Arial, sans-serif">Transaction Reference</text>
        <text x="690" y="850" text-anchor="end" font-size="18" fill="#0f172a" font-weight="600" font-family="Arial, sans-serif">${safe.reference}</text>
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  async completeTransferWithPin(userId, ctx, session) {
    // Captured up front — every early-return branch below needs to know
    // whether there are more transfers queued from a multi-transfer
    // message, so the batch keeps moving even if this particular transfer
    // fails or succeeds.
    const queue = session.queue || [];
    const batchResults = session.batchResults || [];
    const batchTotal = session.batchTotal || null;

    const user = await this.findByTelegramId(userId);
    if (!user) {
      this.sessions.delete(userId);
      return ctx.reply("Your account could not be found.");
    }

    console.log("DRAFT:", session.draft);

    const recipientName =
      session.draft.recipient_name ||
      session.draft.recipient_account_number ||
      "recipient";

    const recipientAccount = await this.findRecipientAccountByName(
      recipientName,
      session.draft.recipient_bank,
      session.draft.recipient_account_number,
      userId,
    );
    if (!recipientAccount) {
      this.sessions.delete(userId);
      await ctx.reply(
        `I couldn't find a matching recipient account for ${recipientName}. Please confirm the recipient first.`,
      );
      if (batchTotal) {
        batchResults.push({
          label: this.describeTransferDraft(session.draft),
          status: "failed",
          reason: "recipient not found",
        });
      }
      await this.continueTransferQueue(
        ctx,
        userId,
        queue,
        batchResults,
        batchTotal,
      );
      return;
    }

    const senderBank = session.draft.sender_bank || "Kredo";
    const senderBalance = await this.getSenderAccountBalance(
      userId,
      senderBank,
    );
    const amount = Number(session.draft.amount);

    if (Number.isNaN(amount) || amount <= 0) {
      this.sessions.delete(userId);
      await ctx.reply("Transfer amount is invalid.");
      if (batchTotal) {
        batchResults.push({
          label: this.describeTransferDraft(session.draft),
          status: "failed",
          reason: "invalid amount",
        });
      }
      await this.continueTransferQueue(
        ctx,
        userId,
        queue,
        batchResults,
        batchTotal,
      );
      return;
    }

    if (senderBalance < amount) {
      this.sessions.delete(userId);
      await ctx.reply(
        `Insufficient balance for this transfer from ${senderBank}. Current balance: ₦${senderBalance.toLocaleString("en-NG")}.`,
      );
      if (batchTotal) {
        batchResults.push({
          label: this.describeTransferDraft(session.draft),
          status: "failed",
          reason: "insufficient balance",
        });
      }
      await this.continueTransferQueue(
        ctx,
        userId,
        queue,
        batchResults,
        batchTotal,
      );
      return;
    }

    const recipientDisplayName =
      recipientAccount.account_name || recipientName || "recipient";

    const enteredPin = String(session.pendingPinValue || "");
    if (String(user.pin) !== enteredPin) {
      // Wrong PIN — stay on the SAME transfer (don't touch the queue),
      // just ask again.
      session.pendingPinValue = null;
      session.pendingField = "pin";
      session.pendingQuestion = this.getTransferPinPrompt({
        amount,
        recipientName: recipientDisplayName,
        recipientBank: session.draft.recipient_bank || "recipient bank",
        senderBank: session.draft.sender_bank || "your account",
      });
      await ctx.reply("Incorrect PIN. Please try again.");
      await ctx.reply(session.pendingQuestion);
      return;
    }

    // Generate the reference ONCE so the receipt, DB row and messages all match.
    const reference = `KREDO-${Date.now()}`;

    const recipientBankName =
      recipientAccount.bank_name || session.draft.recipient_bank || "Kredo";
    const recipientAccountNo =
      recipientAccount.account_no || session.draft.recipient_account_number;

    // -----------------------------------------------------------------
    // Everything below must succeed or fail together, and the debit must
    // not race with another transfer from the same account. A plain
    // "read balance, then write balance - amount" (the old approach) lets
    // two concurrent transfers both read the same starting balance and
    // both pass the balance check before either write lands — a
    // double-spend. Using a single connection + transaction, with the
    // debit written as a conditional UPDATE (`balance >= amount` in the
    // WHERE clause) rather than a separate read-then-write, closes that
    // gap: the debit either atomically succeeds or affects zero rows.
    // -----------------------------------------------------------------
    let senderAccount = null;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [senderRows] = await conn.execute(
        `SELECT account_name, bank_name, account_no
         FROM bank_accounts
         WHERE telegram_id = ? AND bank_name = ?
         LIMIT 1
         FOR UPDATE`,
        [userId, senderBank],
      );
      senderAccount = senderRows[0] || null;

      if (!senderAccount) {
        await conn.rollback();
        this.sessions.delete(userId);
        await ctx.reply(`I couldn't find your ${senderBank} account.`);
        if (batchTotal) {
          batchResults.push({
            label: this.describeTransferDraft(session.draft),
            status: "failed",
            reason: "sender account not found",
          });
        }
        await this.continueTransferQueue(
          ctx,
          userId,
          queue,
          batchResults,
          batchTotal,
        );
        return;
      }

      const [debitResult] = await conn.execute(
        `UPDATE bank_accounts
         SET balance = balance - ?
         WHERE telegram_id = ? AND bank_name = ? AND account_no = ? AND balance >= ?`,
        [amount, userId, senderBank, senderAccount.account_no, amount],
      );

      if (debitResult.affectedRows === 0) {
        // Someone else spent the balance between our earlier check and now.
        await conn.rollback();
        this.sessions.delete(userId);
        await ctx.reply(
          `Insufficient balance for this transfer from ${senderBank}.`,
        );
        if (batchTotal) {
          batchResults.push({
            label: this.describeTransferDraft(session.draft),
            status: "failed",
            reason: "insufficient balance",
          });
        }
        await this.continueTransferQueue(
          ctx,
          userId,
          queue,
          batchResults,
          batchTotal,
        );
        return;
      }

      await conn.execute(
        `UPDATE bank_accounts
         SET balance = balance + ?
         WHERE telegram_id = ? AND bank_name = ? AND account_no = ?`,
        [
          amount,
          recipientAccount.telegram_id,
          recipientBankName,
          recipientAccountNo,
        ],
      );

      await conn.execute(
        `INSERT INTO transaction_history
         (telegram_id, sender_name, sender_bank, recipient_name, recipient_bank, amount, reference)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          senderAccount.account_name || user.name || "You",
          senderBank,
          recipientDisplayName,
          recipientBankName,
          amount,
          reference,
        ],
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error("Transfer transaction failed:", err);
      this.sessions.delete(userId);
      await ctx.reply(
        "Something went wrong while processing your transfer. Please try again.",
      );
      if (batchTotal) {
        batchResults.push({
          label: this.describeTransferDraft(session.draft),
          status: "failed",
          reason: "internal error",
        });
      }
      await this.continueTransferQueue(
        ctx,
        userId,
        queue,
        batchResults,
        batchTotal,
      );
      return;
    } finally {
      conn.release();
    }

    const receipt = await this.generateTransferReceiptImage({
      amount,
      senderName: senderAccount?.account_name || user.name || "You",
      senderBank,
      recipientName: recipientDisplayName,
      recipientBank: recipientBankName,
      reference,
      date: new Date().toLocaleString("en-NG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });

    this.sessions.delete(userId);

    await ctx.reply(
      `✅ TRANSACTION SUCCESSFUL

You sent ₦${amount.toLocaleString("en-NG")} to ${recipientDisplayName}.
Reference: ${reference}

Your receipt is below.`,
    );

    try {
      await ctx.replyWithPhoto(new InputFile(receipt, "kredo-receipt.png"));
    } catch (photoErr) {
      console.error("Receipt photo failed to send:", photoErr);
      await ctx.reply(
        `Transfer complete. Reference: ${reference}\nAmount: ₦${amount.toLocaleString("en-NG")}`,
      );
    }

    if (batchTotal) {
      batchResults.push({
        label: `₦${amount.toLocaleString("en-NG")} to ${recipientDisplayName}`,
        status: "success",
      });
    }

    // If this transfer came from a multi-transfer message, move on to the
    // next one in the batch (or send the batch summary if this was the last one).
    await this.continueTransferQueue(
      ctx,
      userId,
      queue,
      batchResults,
      batchTotal,
    );
  }

  /**
   * Downloads a Telegram file (photo, voice note, etc.) by its file_id
   * and returns it as a base64 string ready for the Gemini API.
   */
  async fileToBase64(fileId) {
    const file = await this.bot.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  }

  // Register all bot commands and message listeners.
  registerHandlers() {
    // /start is the entry point for returning users.
    this.bot.command("start", async (ctx) => {
      const name = ctx.from.first_name || "there";
      await this.typing(ctx);

      const existingUser = await this.findByTelegramId(ctx.from.id);

      if (!existingUser) {
        await ctx.reply("Please create an account first. Use /signup.");
        return;
      }

      await ctx.reply(
        `👋🏾 Hello ${name}! I'm Kredo 🤖🇳🇬

Your account is already set up, so you can continue the conversation normally.`,
      );
    });
    this.bot.command("signup", async (ctx) => {
      console.log("SIGNUP HIT", ctx.from.id);
      await this.handleSignup(ctx);
    });
    this.bot.command("add_account", async (ctx) => {
      await this.typing(ctx);

      const userId = ctx.from.id;

      const existingUser = await this.findByTelegramId(userId);

      if (!existingUser) {
        await ctx.reply("Please create an account first. Use /signup.");
        return;
      }

      this.sessions.set(userId, {
        flow: "add_account",
        step: 1,
        bank_name: null,
        account_no: null,
        account_name: null,
      });

      await ctx.reply(
        `🏦 Let's add a bank account!

I'll need a few details from you.

What's the name of your bank?`,
      );
    });

    this.bot.command("beneficiary", async (ctx) => {
      await this.typing(ctx);

      const userId = ctx.from.id;
      const existingUser = await this.findByTelegramId(userId);

      if (!existingUser) {
        await ctx.reply("Please create an account first. Use /signup.");
        return;
      }

      this.sessions.set(userId, {
        flow: "add_beneficiary",
        step: 1,
        nickname: null,
        bank_name: null,
        account_no: null,
        account_name: null,
      });

      await ctx.reply(
        `👤 Let's add a beneficiary.

What nickname would you like to save this beneficiary as?`,
      );
    });

    this.bot.command("add_beneficiary", async (ctx) => {
      await this.typing(ctx);

      const userId = ctx.from.id;
      const existingUser = await this.findByTelegramId(userId);

      if (!existingUser) {
        await ctx.reply("Please create an account first. Use /signup.");
        return;
      }

      this.sessions.set(userId, {
        flow: "add_beneficiary",
        step: 1,
        nickname: null,
        bank_name: null,
        account_no: null,
        account_name: null,
      });

      await ctx.reply(
        `👤 Let's add a beneficiary.

What nickname would you like to save this beneficiary as?`,
      );
    });

    this.bot.command("transaction_history", async (ctx) => {
      await this.typing(ctx);
      await this.handleTransactionHistory(ctx, ctx.from.id);
    });

    // Catch any normal message that is not a command: text, photo (with optional
    // caption) or voice note. Signup flow, transfer follow-ups and intent
    // extraction all run through here.
    this.bot.on(
      ["message:text", "message:photo", "message:voice"],
      async (ctx) => {
        // Text messages use .text, photos use .caption, voice notes have neither.
        const text = (ctx.message.text ?? ctx.message.caption ?? "").trim();
        const userId = ctx.from.id;

        // Ignore slash commands.
        // They are handled by bot.command().
        if (text.startsWith("/")) return;

        // Allow users to type "signup" without the slash.
        if (text.toLowerCase() === "signup") {
          await this.handleSignup(ctx);
          return;
        }

        await this.typing(ctx);

        // Get the user's current session.
        const session = this.sessions.get(userId);

        // Media can't answer a step-by-step flow (PIN, account number, etc.).
        // Without this guard an empty string would be saved as the answer.
        if (session && !ctx.message.text) {
          return ctx.reply("Please reply with text to continue.");
        }

        // =========================
        // BALANCE CHECK FLOW
        // =========================
        if (session?.flow === "balance_check") {
          const accounts = Array.isArray(session.accounts)
            ? session.accounts
            : [];

          if (!accounts.length) {
            this.sessions.delete(userId);
            return ctx.reply(
              "I couldn't find any linked accounts for you. Please add one with /add_account.",
            );
          }

          const answer = String(text).trim();
          const normalized = answer.toLowerCase();

          const matchingAccount =
            accounts.find(
              (account) =>
                String(account.bank_name || "")
                  .trim()
                  .toLowerCase() === normalized,
            ) ||
            accounts.find(
              (account, index) =>
                String(index + 1) === answer ||
                `${index + 1}. ${String(account.bank_name || "").trim()}`.toLowerCase() ===
                  normalized,
            );

          if (!matchingAccount) {
            const previousBank = String(session.lastBalanceBank || "").trim();
            const followUpBank =
              previousBank &&
              ["what of", "what about", "and", "then", "next"].some((phrase) =>
                normalized.includes(phrase),
              )
                ? previousBank
                : null;

            const resolvedFromPrevious = followUpBank
              ? accounts.find(
                  (account) =>
                    String(account.bank_name || "")
                      .trim()
                      .toLowerCase() === followUpBank.toLowerCase(),
                )
              : null;

            if (resolvedFromPrevious) {
              const balance = Number(resolvedFromPrevious.balance ?? 0);
              this.sessions.delete(userId);
              await ctx.reply(
                `💰 Your ${resolvedFromPrevious.bank_name} balance is ₦${balance.toLocaleString("en-NG")}.`,
              );
              return;
            }

            const options = accounts
              .map(
                (account, index) =>
                  `${index + 1}. ${account.bank_name}${account.account_no ? ` •••••${String(account.account_no).slice(-4)}` : ""}`,
              )
              .join("\n");

            await ctx.reply(
              `I couldn't match that. Please choose one of these accounts:\n\n${options}`,
            );
            return;
          }

          const balance = Number(matchingAccount.balance ?? 0);
          this.sessions.delete(userId);
          await ctx.reply(
            `💰 Your ${matchingAccount.bank_name} balance is ₦${balance.toLocaleString("en-NG")}.`,
          );
          return;
        }

        // =========================
        // TRANSFER FOLLOW-UP FLOW
        // =========================
        if (session?.flow === "transfer") {
          // Captured up front so the batch (if any) can keep moving even
          // if this transfer fails before reaching the PIN step.
          const queue = session.queue || [];
          const batchResults = session.batchResults || [];
          const batchTotal = session.batchTotal || null;

          const field = session.pendingField;
          if (!field) {
            this.sessions.delete(userId);
            return ctx.reply(
              "Transfer session expired. Please send your request again.",
            );
          }

          if (field === "confirm_beneficiary") {
            const answer = String(text).trim().toLowerCase();
            const beneficiary = session.pendingBeneficiary;

            if (answer === "yes" || answer === "y" || answer === "confirm") {
              session.pendingField = "pin";
              session.draft.recipient_name = beneficiary.nickname;
              session.draft.recipient_bank = beneficiary.bank_name;
              session.draft.recipient_account_number = beneficiary.account_no;
              session.pendingQuestion = this.getTransferPinPrompt({
                amount: Number(session.draft.amount),
                recipientName: beneficiary.nickname,
                recipientBank: beneficiary.bank_name || "recipient bank",
                senderBank: session.draft.sender_bank || "your account",
              });
              await ctx.reply(session.pendingQuestion);
              return;
            }

            if (answer === "no" || answer === "n") {
              this.sessions.delete(userId);
              await ctx.reply(
                "Okay. Please send the recipient name again or choose the correct beneficiary.",
              );
              if (batchTotal) {
                batchResults.push({
                  label: this.describeTransferDraft(session.draft),
                  status: "failed",
                  reason: "beneficiary not confirmed",
                });
              }
              await this.continueTransferQueue(
                ctx,
                userId,
                queue,
                batchResults,
                batchTotal,
              );
              return;
            }

            await ctx.reply('Please reply with "yes" or "no".');
            return;
          }

          if (field === "pin") {
            session.pendingPinValue = text;
            await this.completeTransferWithPin(userId, ctx, session);
            return;
          }

          let value = text;
          if (field === "amount") {
            value = Number(value);
            if (!Number.isFinite(value)) {
              return ctx.reply("Please send a valid amount, for example: 5000");
            }
          }

          session.draft[field] = value;

          const recipientNameInput =
            session.draft.recipient_name ||
            session.draft.recipient_bank ||
            session.draft.recipient_account_number;

          if (userId && recipientNameInput) {
            const beneficiaryMatch = await this.findBeneficiaryByName(
              userId,
              recipientNameInput,
              session.draft.recipient_bank,
            );

            if (beneficiaryMatch) {
              session.draft.recipient_name = beneficiaryMatch.nickname;
              session.draft.recipient_bank = beneficiaryMatch.bank_name;
              session.draft.recipient_account_number =
                beneficiaryMatch.account_no;
            }
          }

          const remainingFields = this.getMissingTransferFields(session.draft);
          if (remainingFields.length > 0) {
            session.pendingField = remainingFields[0];
            session.pendingQuestion = this.getTransferPrompt(
              session.pendingField,
            );
            await ctx.reply(session.pendingQuestion);
            return;
          }

          const recipientName =
            session.draft.recipient_name ||
            session.draft.recipient_bank ||
            session.draft.recipient_account_number ||
            "recipient";

          const recipientAccount = await this.findRecipientAccountByName(
            recipientName,
            session.draft.recipient_bank,
            session.draft.recipient_account_number,
            userId,
          );

          if (!recipientAccount) {
            this.sessions.delete(userId);
            await ctx.reply(
              `I couldn't find a recipient account for ${recipientName}. Please add the recipient first or send the correct account details.`,
            );
            if (batchTotal) {
              batchResults.push({
                label: this.describeTransferDraft(session.draft),
                status: "failed",
                reason: "recipient not found",
              });
            }
            await this.continueTransferQueue(
              ctx,
              userId,
              queue,
              batchResults,
              batchTotal,
            );
            return;
          }

          const senderBank = session.draft.sender_bank || "Kredo";
          const senderBalance = await this.getSenderAccountBalance(
            userId,
            senderBank,
          );
          const amount = Number(session.draft.amount);

          if (senderBalance < amount) {
            this.sessions.delete(userId);
            await ctx.reply(
              `Insufficient balance for this transfer from ${senderBank}. Current balance: ₦${senderBalance.toLocaleString("en-NG")}.`,
            );
            if (batchTotal) {
              batchResults.push({
                label: this.describeTransferDraft(session.draft),
                status: "failed",
                reason: "insufficient balance",
              });
            }
            await this.continueTransferQueue(
              ctx,
              userId,
              queue,
              batchResults,
              batchTotal,
            );
            return;
          }

          const recipientDisplayName =
            recipientAccount.account_name || recipientName || "recipient";

          const beneficiaryMatch = userId
            ? await this.findBeneficiaryByName(
                userId,
                recipientName,
                session.draft.recipient_bank,
              )
            : null;

          if (beneficiaryMatch) {
            const isExactCaseMatch =
              String(beneficiaryMatch.nickname).trim() ===
              String(recipientName).trim();

            if (!isExactCaseMatch) {
              session.pendingField = "confirm_beneficiary";
              session.pendingQuestion = `Did you mean ${beneficiaryMatch.nickname}?`;
              session.pendingBeneficiary = beneficiaryMatch;
              await ctx.reply(
                `I found a saved beneficiary named "${beneficiaryMatch.nickname}". Did you mean that? Reply yes or no.`,
              );
              return;
            }
          }

          session.pendingField = "pin";
          session.pendingQuestion = this.getTransferPinPrompt({
            amount,
            recipientName: recipientDisplayName,
            recipientBank: session.draft.recipient_bank || "recipient bank",
            senderBank: session.draft.sender_bank || "your account",
          });
          session.draft.recipient_name = recipientDisplayName;
          await ctx.reply(session.pendingQuestion);
          return;
        }

        // =========================
        // ADD BENEFICIARY FLOW
        // =========================
        if (session?.flow === "add_beneficiary") {
          if (session.step === 1) {
            session.nickname = text;
            session.step = 2;
            await ctx.reply(
              `✅ Beneficiary nickname saved: ${text}

Which bank is this beneficiary using?`,
            );
            return;
          }

          if (session.step === 2) {
            session.bank_name = text;
            session.step = 3;
            await ctx.reply(
              `🏦 Bank: ${session.bank_name}

What is the beneficiary's account number?`,
            );
            return;
          }

          if (session.step === 3) {
            session.account_no = text;

            const linkedAccount = await this.findBankAccountByNumber(
              session.bank_name,
              session.account_no,
            );

            if (!linkedAccount) {
              await ctx.reply(
                `I couldn't find any account for ${session.bank_name} with account number ${session.account_no}. Please check the number and try again.`,
              );
              return;
            }

            // Don't save yet — show the real account name from the DB and
            // make the user explicitly confirm before we write anything.
            session.account_name = linkedAccount.account_name;
            session.step = 4;

            await ctx.reply(
              `Are you sure you want to add ${String(
                session.account_name,
              ).toUpperCase()} as a beneficiary?\n\nReply yes or no.`,
            );
            return;
          }

          if (session.step === 4) {
            const answer = String(text).trim().toLowerCase();

            if (answer === "yes" || answer === "y" || answer === "confirm") {
              await db.execute(
                `INSERT INTO beneficiaries
              (telegram_id, nickname, account_no, bank_name)
              VALUES (?, ?, ?, ?)`,
                [
                  userId,
                  session.nickname,
                  session.account_no,
                  session.bank_name,
                ],
              );

              this.sessions.delete(userId);

              await ctx.reply(
                `✅ Beneficiary saved successfully!

Nickname: ${session.nickname}
Bank: ${session.bank_name}
Account: ${session.account_no}
Account holder: ${session.account_name}`,
              );
              return;
            }

            if (answer === "no" || answer === "n") {
              this.sessions.delete(userId);
              await ctx.reply("Okay, I no go save that beneficiary.");
              return;
            }

            await ctx.reply('Please reply with "yes" or "no".');
            return;
          }
        }

        // =========================
        // SIGNUP FLOW
        // =========================
        if (session?.flow === "signup") {
          await this.typing(ctx);
          if (session.step === "name") {
            session.name = text;
            session.step = "phone";

            await ctx.reply(
              `Nice to meet you, ${text}! 👋🏾

📱 What's your phone number?`,
            );

            return;
          }

          if (session.step === "phone") {
            await this.typing(ctx);
            session.phone = text;
            session.step = "pin";

            await ctx.reply(
              `Got it. 📱

🔐 Now create a 4-digit PIN for your Kredo account.`,
            );

            return;
          }

          if (session.step === "pin") {
            await this.typing(ctx);
            session.pin = text;

            const savedUser = await this.createUser({
              telegramId: userId,
              name: session.name,
              phone: session.phone,
              pin: session.pin,
            });

            this.accounts.push(savedUser);

            // Signup is complete.
            this.sessions.delete(userId);

            await ctx.reply(
              `🎉 Account setup complete!

👤 Name: ${savedUser.name}
📱 Phone: ${savedUser.phone}

Welcome to Kredo, ${savedUser.name}! 🇳🇬🚀

Use /add_account to link your bank accounts to Kredo.`,
            );

            console.log(this.accounts);

            return;
          }
        }

        // =========================
        // ADD ACCOUNT FLOW
        // =========================

        if (session?.flow === "add_account") {
          if (session.step === 1) {
            await this.typing(ctx);
            session.bank_name = text;
            session.step = 2;

            await ctx.reply(
              `🏦 Bank: ${session.bank_name}

💳 What's your 10-digit account number?`,
            );

            return;
          }

          if (session.step === 2) {
            await this.typing(ctx);
            session.account_no = text;
            session.step = 3;

            await ctx.reply(
              `💳 Account number received.

👤 What's the account holder's name?`,
            );

            return;
          }

          if (session.step === 3) {
            await this.typing(ctx);
            session.account_name = text;

            const accountName = `${text}`;

            await this.addAccount(
              {
                telegram_id: userId,
                account_name: accountName,
                account_no: session.account_no,
                bank_name: session.bank_name,
              },
              ctx,
            );

            await ctx.reply(
              `✅ Bank account added successfully!

🏦 Bank: ${session.bank_name}
💳 Account: ••••••${session.account_no.slice(-4)}
👤 Name: ${session.account_name}

You can now use "${accountName}" when referring to this account. 🇳🇬`,
            );

            // Add account flow is complete.
            this.sessions.delete(userId);

            return;
          }
        }

        // =========================
        // FREE-FORM MESSAGE -> INTENT
        // =========================
        const existingUser = await this.findByTelegramId(userId);
        if (!existingUser) {
          await ctx.reply("Please create an account first. Use /signup.");
          return;
        }

        try {
          const payload = {};
          if (text) {
            payload.text = text;
          }
          if (ctx.message.photo) {
            const largest = ctx.message.photo.at(-1);
            payload.imageBase64 = await this.fileToBase64(largest.file_id);
            payload.imageMimeType = "image/jpeg";
          }
          if (ctx.message.voice) {
            payload.audioBase64 = await this.fileToBase64(
              ctx.message.voice.file_id,
            );
            payload.audioMimeType = "audio/ogg";
          }
          if (!payload.text && !payload.imageBase64 && !payload.audioBase64) {
            return ctx.reply("Abeg send text, picture, or voice note.");
          }

          const intent = await extractIntent(payload);
          console.log("Intent for", ctx.chat.id, ":", intent);

          if (intent.intent === "cancel_transaction") {
            await this.handleCancelTransaction(ctx, userId);
            return;
          }

          if (intent.intent === "list_beneficiaries") {
            await this.handleListBeneficiaries(ctx, userId);
            return;
          }

          if (intent.intent === "balance_check") {
            await this.handleBalanceCheck(ctx, userId, intent);
            return;
          }

          if (intent.intent === "transaction_history") {
            const range = this.resolveHistoryRange(text, intent.entities);
            await this.handleTransactionHistory(ctx, userId, range);
            return;
          }

          if (intent.intent === "transfer_request") {
            // A single message can request several distinct transfers
            // (e.g. "send 1k to Nifemi then send 2k to Joshua"). Each one
            // still needs its own missing-field prompts, beneficiary
            // confirmation and PIN, so they're processed one at a time via
            // a queue rather than all at once.
            const transfers =
              Array.isArray(intent.transfers) && intent.transfers.length
                ? intent.transfers
                : [intent.entities];

            if (transfers.length > 1) {
              const wasTruncated = transfers.length > MAX_TRANSFER_BATCH_SIZE;
              const cappedTransfers = transfers.slice(
                0,
                MAX_TRANSFER_BATCH_SIZE,
              );
              const [first, ...rest] = cappedTransfers;

              await ctx.reply(
                `I found ${cappedTransfers.length} transfers in that message` +
                  (wasTruncated
                    ? ` (only processing the first ${MAX_TRANSFER_BATCH_SIZE} — that's the limit per message)`
                    : "") +
                  `. Let's confirm them one at a time — starting with the first.`,
              );
              await this.ensureTransferFollowUp(ctx, userId, {
                entities: first,
              });

              const updatedSession = this.sessions.get(userId) || {};
              this.sessions.set(userId, {
                ...updatedSession,
                queue: rest,
                batchTotal: cappedTransfers.length,
                batchResults: [],
              });
              return;
            }

            const askedFollowUp = await this.ensureTransferFollowUp(
              ctx,
              userId,
              intent,
            );

            if (askedFollowUp) {
              return;
            }
          }

          // Fallback so the bot never goes silent on an unknown intent.
          await ctx.reply(
            'I didn\'t quite get that. You can ask for your balance or tell me to send money, e.g. "send 5000 to 7031272572 on Opay".',
          );
        } catch (err) {
          console.error("Intent extraction failed:", err);
          await ctx.reply(
            "I couldn't understand that message properly. Please try again.",
          );
        }

        console.log(`User ${userId} sent: ${text || "[media]"}`);
        return;
      },
    );
  }

  async addAccount(account, ctx) {
    await this.typing(ctx);
    const [result] = await db.execute(
      `INSERT INTO bank_accounts
      (telegram_id, account_name, account_no, bank_name)
     VALUES (?, ?, ?, ?)`,
      [
        account.telegram_id,
        account.account_name,
        account.account_no,
        account.bank_name,
      ],
    );

    return result;
  }

  async insertTransactionHistory({
    telegram_id,
    sender_name,
    sender_bank,
    recipient_name,
    recipient_bank,
    amount,
    reference,
  }) {
    await db.execute(
      `INSERT INTO transaction_history
      (telegram_id, sender_name, sender_bank, recipient_name, recipient_bank, amount, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        telegram_id,
        sender_name,
        sender_bank,
        recipient_name,
        recipient_bank,
        Number(amount),
        reference,
      ],
    );
  }

  normalizeHistoryDateValue(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    const raw = String(value).trim().toLowerCase();
    if (!raw) {
      return null;
    }

    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    const yesterday = new Date(todayStart);
    yesterday.setDate(todayStart.getDate() - 1);

    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);

    const lastMonthStart = new Date(todayStart);
    lastMonthStart.setMonth(todayStart.getMonth() - 1);

    const thisMonthStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      1,
    );

    const dateMatch = new Date(raw);
    if (!Number.isNaN(dateMatch.getTime())) {
      return dateMatch;
    }

    if (raw.includes("yesterday") && raw.includes("today")) {
      return yesterday;
    }
    if (raw.includes("today")) return todayStart;
    if (raw.includes("yesterday") || raw.includes("yday")) return yesterday;
    if (
      raw.includes("this week") ||
      raw.includes("last 7 days") ||
      raw.includes("last week") ||
      raw.includes("7 days")
    ) {
      return weekStart;
    }
    if (raw.includes("this month") || raw.includes("this month"))
      return thisMonthStart;
    if (raw.includes("last month") || raw.includes("last 30 days"))
      return lastMonthStart;

    return null;
  }

  resolveHistoryRange(text = "", entityRange = {}) {
    const rawText = String(text || "").trim();
    const lowerText = rawText.toLowerCase();
    const explicitTextRange = this.parseHistoryDateRange(rawText);

    if (
      explicitTextRange &&
      (explicitTextRange.fromDate !== undefined ||
        explicitTextRange.toDate !== undefined)
    ) {
      return explicitTextRange;
    }

    const hasYesterdayTodayCombo =
      lowerText.includes("yesterday") && lowerText.includes("today");
    if (hasYesterdayTodayCombo) {
      const today = new Date();
      const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const yesterday = new Date(todayStart);
      yesterday.setDate(todayStart.getDate() - 1);

      return {
        fromDate: yesterday,
        toDate: today,
      };
    }

    const combinedValues = [
      entityRange.from_date,
      entityRange.to_date,
      entityRange.fromDate,
      entityRange.toDate,
    ].filter((value) => value !== null && value !== undefined && value !== "");

    if (combinedValues.length > 0) {
      const joinedValue = combinedValues.join(" ");
      const combinedRange = this.parseHistoryDateRange(joinedValue);
      if (
        combinedRange &&
        (combinedRange.fromDate !== undefined ||
          combinedRange.toDate !== undefined)
      ) {
        return combinedRange;
      }
    }

    const fromValue = entityRange.from_date ?? entityRange.fromDate ?? null;
    const toValue = entityRange.to_date ?? entityRange.toDate ?? null;

    const normalizedRange = {
      fromDate: this.normalizeHistoryDateValue(fromValue),
      toDate: this.normalizeHistoryDateValue(toValue),
    };

    if (normalizedRange.fromDate || normalizedRange.toDate) {
      return normalizedRange;
    }

    return explicitTextRange || {};
  }

  parseHistoryDateRange(text = "") {
    const lower = String(text).toLowerCase();
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    const yesterday = new Date(todayStart);
    yesterday.setDate(todayStart.getDate() - 1);

    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);

    const monthStart = new Date(todayStart);
    monthStart.setMonth(todayStart.getMonth() - 1);

    const allTime =
      lower.includes("all time") ||
      lower.includes("alltime") ||
      lower.includes("everything");
    const hasYest =
      lower.includes("yesterday") ||
      lower.includes("yday") ||
      lower.includes("last day");
    const hasToday =
      lower.includes("today") ||
      lower.includes("todays") ||
      lower.includes("today's");
    const hasWeek =
      lower.includes("this week") ||
      lower.includes("week") ||
      lower.includes("7 days") ||
      lower.includes("seven days") ||
      lower.includes("last week");
    const hasMonth =
      lower.includes("this month") ||
      lower.includes("month") ||
      lower.includes("30 days") ||
      lower.includes("thirty days") ||
      lower.includes("last month");
    const hasFromTill =
      lower.includes("from") &&
      (lower.includes("till") ||
        lower.includes("to") ||
        lower.includes("until") ||
        lower.includes("up to"));

    if (allTime) {
      return {
        fromDate: null,
        toDate: null,
      };
    }

    if (hasFromTill && hasYest && hasToday) {
      return {
        fromDate: yesterday,
        toDate: today,
      };
    }

    if (lower.includes("yesterday") && lower.includes("today")) {
      return {
        fromDate: yesterday,
        toDate: today,
      };
    }

    if (hasWeek) {
      return {
        fromDate: weekStart,
        toDate: today,
      };
    }

    if (hasMonth) {
      return {
        fromDate: monthStart,
        toDate: today,
      };
    }

    if (hasYest && hasToday) {
      return {
        fromDate: yesterday,
        toDate: today,
      };
    }

    if (hasYest) {
      return {
        fromDate: yesterday,
        toDate: yesterday,
      };
    }

    if (hasToday) {
      return {
        fromDate: todayStart,
        toDate: today,
      };
    }

    if (lower.includes("last week") || lower.includes("last 7 days")) {
      return {
        fromDate: weekStart,
        toDate: today,
      };
    }

    if (lower.includes("last month") || lower.includes("last 30 days")) {
      return {
        fromDate: monthStart,
        toDate: today,
      };
    }

    return {};
  }

  async getTransactionHistory(telegramId, fromDate = null, toDate = null) {
    let sql = `SELECT sender_name, sender_bank, recipient_name, recipient_bank, amount, reference, created_at
       FROM transaction_history
       WHERE telegram_id = ?`;
    const params = [telegramId];

    if (fromDate) {
      sql += ` AND created_at >= ?`;
      params.push(new Date(fromDate));
    }

    if (toDate) {
      sql += ` AND created_at <= ?`;
      const upperBound = new Date(toDate);
      upperBound.setHours(23, 59, 59, 999);
      params.push(upperBound);
    }

    sql += ` ORDER BY created_at DESC LIMIT 10`;

    const [rows] = await db.execute(sql, params);
    return rows;
  }

  async handleTransactionHistory(ctx, userId, range = {}) {
    const user = await this.findByTelegramId(userId);
    if (!user) {
      await ctx.reply("Please create an account first. Use /signup.");
      return;
    }

    const fromDate = range.fromDate || null;
    const toDate = range.toDate || null;
    const rows = await this.getTransactionHistory(userId, fromDate, toDate);

    if (!rows.length) {
      const rangeLabel =
        fromDate || toDate
          ? ` from ${new Date(fromDate || toDate).toLocaleDateString("en-NG")} to ${new Date(toDate || fromDate || Date.now()).toLocaleDateString("en-NG")}`
          : "";

      await ctx.reply(
        `📜 You do not have any transaction history${rangeLabel} yet.`,
      );
      return;
    }

    const historyText = rows
      .map((row, index) => {
        const from = `${row.sender_name || "You"} (${row.sender_bank || "Kredo"})`;
        const to = `${row.recipient_name || "Recipient"} (${row.recipient_bank || "Bank"})`;
        const amount = Number(row.amount || 0).toLocaleString("en-NG");
        return `${index + 1}. From: ${from}\n   To: ${to}\n   Amount: ₦${amount}\n   Ref: ${row.reference || "N/A"}\n   Date: ${new Date(row.created_at).toLocaleString("en-NG")}`;
      })
      .join("\n\n");

    const label =
      fromDate || toDate
        ? `📜 Transaction History (${new Date(fromDate || toDate).toLocaleDateString("en-NG")} - ${new Date(toDate || fromDate || Date.now()).toLocaleDateString("en-NG")})`
        : "📜 Transaction History";

    await ctx.reply(`${label}\n\n${historyText}`);
  }

  /**
   * Handles the "list_beneficiaries" intent — replies with the user's
   * saved beneficiaries (nickname, bank, masked account number).
   */
  async handleListBeneficiaries(ctx, userId) {
    const user = await this.findByTelegramId(userId);
    if (!user) {
      await ctx.reply("Please create an account first. Use /signup.");
      return;
    }

    const [rows] = await db.execute(
      `SELECT nickname, bank_name, account_no
       FROM beneficiaries
       WHERE telegram_id = ?
       ORDER BY id DESC`,
      [userId],
    );

    if (!rows.length) {
      await ctx.reply(
        "You do not have any beneficiary saved yet. Use /add_beneficiary to add one.",
      );
      return;
    }

    const list = rows
      .map((row, index) => {
        const maskedAccount = row.account_no
          ? `••••${String(row.account_no).slice(-4)}`
          : "N/A";
        return `${index + 1}. ${row.nickname} — ${row.bank_name} (${maskedAccount})`;
      })
      .join("\n");

    await ctx.reply(`👥 Your Beneficiaries:\n\n${list}`);
  }

  // Centralized signup logic so both /signup and plain-text "signup" trigger the
  // same flow without duplication.
  async handleSignup(ctx) {
    await this.typing(ctx);
    const userId = ctx.from.id;

    const existingUser = await this.findByTelegramId(userId);

    if (existingUser) {
      await ctx.reply(
        `You already have an account, ${existingUser.name || "friend"}. You can continue chatting normally.`,
      );
      return;
    }

    // Create a temporary session for the registration process.
    this.sessions.set(userId, {
      flow: "signup",
      step: "name",
      name: null,
      phone: null,
      pin: null,
    });

    await ctx.reply(
      `🏦 Let's create your Kredo account!

👤 What's your full name?`,
    );
  }

  async getUserBankAccounts(userId) {
    const [rows] = await db.execute(
      `SELECT bank_name, account_no, account_name, balance
       FROM bank_accounts
       WHERE telegram_id = ?
       ORDER BY bank_name, account_no`,
      [userId],
    );

    return rows || [];
  }

  async getSenderAccountBalance(userId, senderBank) {
    const normalized = String(senderBank || "").trim();

    if (!normalized) {
      const user = await this.findByTelegramId(userId);
      return Number(user?.balance ?? 0);
    }

    const [rows] = await db.execute(
      `SELECT balance, bank_name, account_no, account_name
       FROM bank_accounts
       WHERE telegram_id = ?
         AND bank_name = ?
       ORDER BY account_no
       LIMIT 1`,
      [userId, normalized],
    );

    if (!rows[0]) {
      const user = await this.findByTelegramId(userId);
      return Number(user?.balance ?? 0);
    }

    return Number(rows[0].balance ?? 0);
  }

  async handleCancelTransaction(ctx, userId) {
    const existingSession = this.sessions.get(userId);

    if (existingSession) {
      const queue = existingSession.queue || [];
      const batchResults = existingSession.batchResults || [];
      const batchTotal = existingSession.batchTotal || null;
      const isBatch = Boolean(batchTotal);

      if (isBatch) {
        batchResults.push({
          label: this.describeTransferDraft(existingSession.draft),
          status: "cancelled",
        });
      }

      this.sessions.delete(userId);
      await ctx.reply("Transaction cancelled. No money was sent.");

      // Cancelling only skips the CURRENT transfer — if this was part of a
      // multi-transfer message, the rest of the batch keeps going.
      if (isBatch) {
        await this.continueTransferQueue(
          ctx,
          userId,
          queue,
          batchResults,
          batchTotal,
        );
      }

      return true;
    }

    await ctx.reply("There is no pending transaction to cancel.");
    return false;
  }

  async handleBalanceCheck(ctx, userId, intent) {
    const user = await this.findByTelegramId(userId);

    if (!user) {
      await ctx.reply("Please create an account first. Use /signup.");
      return;
    }

    const session = this.sessions.get(userId) || {};
    const explicitBank = String(intent?.entities?.sender_bank || "").trim();
    const fallbackBank = String(session.lastBalanceBank || "").trim();
    const requestedBank = explicitBank || fallbackBank;
    const accounts = await this.getUserBankAccounts(userId);

    if (!accounts.length) {
      await ctx.reply(
        "You don't have any linked bank accounts yet. Use /add_account to add one first.",
      );
      return;
    }

    if (requestedBank) {
      const match = accounts.find(
        (account) =>
          String(account.bank_name || "")
            .trim()
            .toLowerCase() === requestedBank.toLowerCase(),
      );

      if (!match) {
        await ctx.reply(
          `I couldn't find ${requestedBank} in your linked accounts. Which account would you like to check?`,
        );
        this.sessions.set(userId, {
          ...session,
          flow: "balance_check",
          accounts,
          lastBalanceBank: fallbackBank || requestedBank,
        });
        return;
      }

      const balance = Number(match.balance ?? 0);
      this.sessions.set(userId, {
        ...session,
        flow: "balance_check",
        accounts,
        lastBalanceBank: match.bank_name,
      });

      await ctx.reply(
        `💰 Your ${match.bank_name} balance is ₦${balance.toLocaleString("en-NG")}.`,
      );
      return;
    }

    if (accounts.length === 1) {
      const [account] = accounts;
      this.sessions.set(userId, {
        ...session,
        flow: "balance_check",
        accounts,
        lastBalanceBank: account.bank_name,
      });

      const balance = Number(account.balance ?? 0);
      await ctx.reply(
        `💰 Your ${account.bank_name} balance is ₦${balance.toLocaleString("en-NG")}.`,
      );
      return;
    }

    const options = accounts
      .map(
        (account, index) =>
          `${index + 1}. ${account.bank_name}${account.account_no ? ` •••••${String(account.account_no).slice(-4)}` : ""}`,
      )
      .join("\n");

    this.sessions.set(userId, {
      ...session,
      flow: "balance_check",
      accounts,
      lastBalanceBank: fallbackBank,
    });

    await ctx.reply(
      `Which account would you like to check?\n\n${options}\n\nReply with the bank name or the number beside it.`,
    );
  }

  // This method demonstrates direct DB insertion pattern.
  // In a cleaner architecture, this should move to a service file, but this is
  // kept here temporarily for learning and experimentation.
  async createUser(user) {
    const [result] = await db.execute(
      "INSERT INTO users (telegramId, name, phone, pin) VALUES (?, ?, ?, ?)",
      [user.telegramId, user.name, user.phone, user.pin],
    );
    return user;
  }
}

export default Kredobot;
