// intentService.js
// Extracts structured intent (JSON) from Pidgin text input using Gemini.
// Currently console.logs the result only — routing/response handled elsewhere.
import "dotenv/config";

console.log("CURRENT DIR:", process.cwd());
console.log("BOT TOKEN EXISTS:", Boolean(process.env.BOT_TOKEN));
console.log("GEMINI KEY EXISTS:", Boolean(process.env.GEMINI_API_KEY));

import { GoogleGenAI } from "@google/genai";

console.log(Boolean(process.env.GEMINI_API_KEY));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // picks up GEMINI_API_KEY from env automatically

const MODEL = "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `
You are an intent extraction engine for a Nigerian Pidgin fintech Telegram bot.
Users send messages (text, OCR'd images, or transcribed voice notes) about money transfers,
balance checks, or account detail sharing — written in Nigerian Pidgin or Pidgin/English mix.

Extract the user's intent and any relevant entities. Always respond with valid JSON matching
the provided schema. If a field is not mentioned, omit it or use null. Do not guess amounts,
account numbers, or bank names that are not explicitly present in the input.

Note: the user may have multiple accounts (e.g. PalmPay, GTBank, Opay) and can choose which one
to send from. "sender_bank" is the bank/wallet the user wants to send FROM. "recipient_bank" is
the bank the money is going TO, tied to "recipient_account_number". The recipient_name can also be mentioned it is the name of the recipient account.

Supported intent types:
- "transfer_request": user wants to send money
- "balance_check": user wants to check balance
  If the user asks for a date range, capture it in from_date and to_date. If they just say "history" or "recent transactions", default to recent transactions with no date filter.
  Examples: "show my history", "recent transactions", "history", "last month", "from yesterday till today".
- "share_account_details": user is sharing their own account number/bank for someone to pay them
- "confirm_transaction": user is confirming a pending action (e.g. "yes", "abeg go ahead")
- "cancel_transaction": user wants to cancel/stop an action
- "unclear": intent cannot be confidently determined
`.trim();

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "transfer_request",
        "balance_check",
        "share_account_details",
        "confirm_transaction",
        "cancel_transaction",
        "unclear",
      ],
    },
    entities: {
      type: "object",
      properties: {
        amount: { type: ["number", "null"] },
        recipient_account_number: { type: ["string", "null"] },
        recipient_bank: { type: ["string", "null"] },
        recipient_name: { type: ["string", "null"] },
        sender_bank: { type: ["string", "null"] },
        from_date: { type: ["string", "null"] },
        to_date: { type: ["string", "null"] },
      },
    },
    confidence: { type: "number" },
    raw_input: { type: "string" },
  },
  required: ["intent", "entities", "confidence", "raw_input"],
};

// /**
//  * Extracts structured intent from raw Pidgin text input.
//  * @param {string} inputText - Raw text (from Telegram message, OCR, or ASR transcript)
//  * @returns {Promise<object>} parsed intent JSON
//  */
async function extractIntent({
  text,
  imageBase64,
  imageMimeType = "image/jpeg",
  audioBase64,
  audioMimeType = "audio/ogg",
} = {}) {
  if (!text?.trim() && !imageBase64 && !audioBase64) {
    throw new Error(
      "extractIntent: need at least one of text, imageBase64, audioBase64",
    );
  }

  const input = [];
  if (text?.trim()) input.push({ type: "text", text });
  if (imageBase64)
    input.push({ type: "image", data: imageBase64, mime_type: imageMimeType });
  if (audioBase64)
    input.push({ type: "audio", data: audioBase64, mime_type: audioMimeType });

  const interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: SYSTEM_PROMPT,
    input,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: INTENT_SCHEMA,
    },
  });

  const rawText = interaction.output_text;
  let parsedIntent;
  try {
    parsedIntent = JSON.parse(rawText);
  } catch (err) {
    throw new Error(
      `extractIntent: failed to parse Gemini response as JSON: ${rawText}`,
    );
  }

  console.log("Extracted intent:", JSON.stringify(parsedIntent, null, 2));
  return parsedIntent;
}
export default extractIntent;

// Quick manual test — run `node intentService.js` directly to try it
const sample = "cheif check wetin dey my opay aza";
extractIntent({ text: sample }).catch((err) => console.error(err));

console.log("GEMINI KEY EXISTS:", Boolean(process.env.GEMINI_API_KEY));
