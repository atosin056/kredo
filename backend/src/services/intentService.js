// intentService.js
// Extracts structured intent (JSON) from Pidgin text input using Gemini.
// Currently console.logs the result only — routing/response handled elsewhere.
import "dotenv/config";

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash";

const OUTPUT_SCHEMA_INSTRUCTIONS = `
CRITICAL OUTPUT CONTRACT:
- Return ONLY a single JSON object.
- Do NOT return a bare array, a list, or an object with only transfers.
- The top-level result MUST look exactly like this shape:
{
  "intent": "transfer_request | balance_check | transaction_history | share_account_details | list_beneficiaries | confirm_transaction | cancel_transaction | unclear",
  "entities": {
    "amount": 0 or null,
    "recipient_account_number": "string or null",
    "recipient_bank": "string or null",
    "recipient_name": "string or null",
    "sender_bank": "string or null",
    "from_date": "string or null",
    "to_date": "string or null"
  },
  "transfers": [
    {
      "amount": 0 or null,
      "recipient_account_number": "string or null",
      "recipient_bank": "string or null",
      "recipient_name": "string or null",
      "sender_bank": "string or null"
    }
  ],
  "confidence": 0.0,
  "raw_input": "the original user message"
}
- Every key above must exist in the JSON object.
- If a field is not mentioned, use null.
- If intent is not transfer_request, then transfers must be an empty array [].
- If the message contains multiple transfers, keep the top-level intent as transfer_request and put each transfer in the transfers array in order.
- Never output just the transfers array by itself.
`;

const TEXT_SYSTEM_PROMPT = `
You are a fintech intent extractor for Nigerian Pidgin, English, Yoruba, or mixed chat.
Return ONLY valid JSON matching the schema below.

${OUTPUT_SCHEMA_INSTRUCTIONS}

Intent labels:
- transfer_request: send money / start a transfer.
- balance_check: asks for the current balance of an account.
- transaction_history: asks for past transfers or statements/history.
- share_account_details: user is sharing their own account details.
- list_beneficiaries: asks to list saved beneficiaries.
- confirm_transaction: confirms a pending action.
- cancel_transaction: cancels or stops a pending action. Examples: "nor do am again", "no do am again", "cancel am", "stop", "forget it".
- unclear: not enough signal; greetings, chit-chat, short bank-only messages, or vague follow-ups.

Strict rules:
- Every entity field must be present in the JSON response. Missing values must be null.
- Never guess account numbers, bank names, amounts, or names that are not explicitly stated.
- sender_bank = the bank/wallet sending FROM.
- recipient_bank = the bank receiving TO.
- recipient_account_number belongs to recipient_bank.
- If a single message contains multiple transfers, set intent to transfer_request and populate transfers[] in order.
- If intent is not transfer_request, transfers must be []
- If the user only mentions a bank name with no action such as "Palmpay", "Opay", "GTBank", classify as unclear.
- Greetings and casual chat such as "hi", "hello", "good morning", "how far", "wetin dey" are unclear unless the user clearly asks to check balance, send money, view history, or list beneficiaries.
- If the user is clearly asking for a balance, even in Pidgin, classify as balance_check.
- If the message includes date words like yesterday/today/last week/month, that's usually transaction_history, not balance_check.

Follow-up memory rule:
- If a message is a short follow-up like "what of Palmpay" after a balance check, it can still be treated as a balance_check for the named bank when the previous context is clearly the same topic.
- But do not invent a bank that was never mentioned.
`.trim();

const IMAGE_SYSTEM_PROMPT = `
You are an Intent Extractor for a fintech application. Read the image and user's text together.

${OUTPUT_SCHEMA_INSTRUCTIONS}

The image may contain the recipient's account number and bank.
When the text refers to "that aza", "that account", "that number",
or similar, use the matching account details from the image.

Copy account numbers EXACTLY as visible. Never invent or change digits.

For each transfer, extract:
amount, recipient_account_number, recipient_bank,
recipient_name, sender_bank.

Combine information from the image and text.
Preserve multiple transfers in order.
Missing values = null.

Return only JSON matching the schema and ensure the top-level result is an object, not an array.
`.trim();

const AUDIO_SYSTEM_PROMPT = `
Extract fintech intent from the user's voice input.

Understand Nigerian Pidgin, English, Yoruba, or mixed speech.

${OUTPUT_SCHEMA_INSTRUCTIONS}

Extract only information actually spoken. Never guess.

For transfers:
- sender_bank = sending FROM
- recipient_bank = receiving
- recipient_account_number belongs to recipient_bank
- Put each distinct transfer in transfers, in order.
- Missing values = null.

Intents:
transfer_request, balance_check, transaction_history,
share_account_details, list_beneficiaries, confirm_transaction,
cancel_transaction, unclear.

Dates mentioned for transaction_history go in from_date/to_date.

Return a top-level object, never a bare array.
`.trim();

const ENTITY_KEYS = [
  "amount",
  "recipient_account_number",
  "recipient_bank",
  "recipient_name",
  "sender_bank",
  "from_date",
  "to_date",
];

const TRANSFER_ENTITY_KEYS = [
  "amount",
  "recipient_account_number",
  "recipient_bank",
  "recipient_name",
  "sender_bank",
];

const TRANSFER_ENTITY_SCHEMA = {
  type: "object",
  properties: {
    amount: { type: ["number", "null"] },
    recipient_account_number: { type: ["string", "null"] },
    recipient_bank: { type: ["string", "null"] },
    recipient_name: { type: ["string", "null"] },
    sender_bank: { type: ["string", "null"] },
  },
  required: TRANSFER_ENTITY_KEYS,
};

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "transfer_request",
        "balance_check",
        "transaction_history",
        "share_account_details",
        "list_beneficiaries",
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
      required: ENTITY_KEYS, // forces every entity key to be present, value can still be null
    },
    transfers: {
      type: "array",
      items: TRANSFER_ENTITY_SCHEMA,
      description:
        "One object per distinct transfer detected in the message. Populated only when intent is transfer_request; empty array otherwise.",
    },
    confidence: { type: "number" },
    raw_input: { type: "string" },
  },
  required: ["intent", "entities", "transfers", "confidence", "raw_input"],
};

/**
 * Ensures every expected entity key is present on the object, defaulting
 * missing ones to null. Belt-and-suspenders in case the model still drops
 * a key despite the schema's `required` list.
 * @param {object} entities
 * @returns {object} normalized entities with all ENTITY_KEYS present
 */
function normalizeEntities(entities = {}) {
  const normalized = {};
  for (const key of ENTITY_KEYS) {
    normalized[key] = entities[key] ?? null;
  }
  return normalized;
}

/**
 * Same idea as normalizeEntities but for a single item inside the
 * "transfers" array (no from_date/to_date — those don't apply to transfers).
 * @param {object} entity
 * @returns {object} normalized transfer entity with all TRANSFER_ENTITY_KEYS present
 */
function normalizeTransferEntity(entity = {}) {
  const normalized = {};
  for (const key of TRANSFER_ENTITY_KEYS) {
    normalized[key] = entity[key] ?? null;
  }
  return normalized;
}

/**
 * Normalizes Gemini's raw response into the schema the bot expects.
 * Some responses come back as a bare array of transfer objects instead of an
 * object containing intent/entities/transfers, so we coerce those into a valid
 * transfer_request payload before downstream code touches them.
 * @param {any} parsedIntent
 * @param {string} [fallbackRawInput=""]
 * @returns {object}
 */
export function normalizeParsedIntent(
  parsedIntent = {},
  fallbackRawInput = "",
) {
  const rawObject =
    parsedIntent &&
    typeof parsedIntent === "object" &&
    !Array.isArray(parsedIntent)
      ? parsedIntent
      : {};

  const transferList = Array.isArray(parsedIntent)
    ? parsedIntent
    : Array.isArray(rawObject.transfers)
      ? rawObject.transfers
      : [];

  const intent =
    rawObject.intent || (transferList.length ? "transfer_request" : "unclear");

  const entities = normalizeEntities(rawObject.entities || {});

  let transfers = [];
  if (Array.isArray(transferList) && transferList.length) {
    transfers = transferList.map(normalizeTransferEntity);
  } else if (intent === "transfer_request") {
    transfers = [normalizeTransferEntity(entities)];
  }

  return {
    intent,
    entities,
    transfers,
    confidence:
      typeof rawObject.confidence === "number" ? rawObject.confidence : 0.5,
    raw_input: String(rawObject.raw_input ?? fallbackRawInput ?? ""),
  };
}

/**
 * Extracts structured intent from raw Pidgin text input.
 * @param {object} params
 * @param {string} [params.text] - Raw text (from Telegram message, OCR, or ASR transcript)
 * @param {string} [params.imageBase64]
 * @param {string} [params.imageMimeType]
 * @param {string} [params.audioBase64]
 * @param {string} [params.audioMimeType]
 * @returns {Promise<object>} parsed intent JSON, with `entities` guaranteed to
 *   contain every key in ENTITY_KEYS (null for anything not mentioned), and
 *   `transfers` guaranteed to be an array (possibly empty, possibly containing
 *   one entry per distinct transfer detected in the message).
 */
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

  const SYSTEM_PROMPT = imageBase64
    ? IMAGE_SYSTEM_PROMPT
    : audioBase64
      ? AUDIO_SYSTEM_PROMPT
      : TEXT_SYSTEM_PROMPT;

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
    generation_config: {
      max_output_tokens: 1024,
      temperature: 0,
    },
  });

  const rawText = interaction.output_text || "";
  const normalizedText = String(rawText).trim();
  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fencedMatch ? fencedMatch[1].trim() : normalizedText;

  let parsedIntent;
  try {
    parsedIntent = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `extractIntent: failed to parse Gemini response as JSON: ${rawText}`,
    );
  }

  parsedIntent = normalizeParsedIntent(parsedIntent, text || "");

  console.log("Extracted intent:", JSON.stringify(parsedIntent, null, 2));
  return parsedIntent;
}
export default extractIntent;
