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
  "lang": "english | pidgin | yoruba",
  "intent": "transfer_request | balance_check | transaction_history | share_account_details | list_beneficiaries | confirm_transaction | cancel_transaction | unclear",
  "entities": {
    "amount": 0 or null,
    "recipient_account_number": "string or null",
    "recipient_bank": "string or null",
    "recipient_name": "string or null",
    "sender_bank": "string or null",
    "from_date": "string or null",
    "to_date": "string or null",
    "recipient_is_self": true | false | null
  },
  "transfers": [
    {
      "amount": 0 or null,
      "recipient_account_number": "string or null",
      "recipient_bank": "string or null",
      "recipient_name": "string or null",
      "sender_bank": "string or null",
      "recipient_is_self": true | false
    }
  ],
  "confidence": 0.0,
  "raw_input": "the original user message, or a verbatim transcript when the input is audio"
}
- Every key above must exist in the JSON object.
- Detect the user's dominant language and set lang to exactly "english", "pidgin", or "yoruba". Default to "english" when uncertain.
- If a field is not mentioned, use null (except recipient_is_self on a transfer, see below).
- If intent is not transfer_request, then transfers must be an empty array [].
- If the message contains multiple transfers, keep the top-level intent as transfer_request and put each transfer in the transfers array in order.
- Amounts are financially sensitive: preserve the amount exactly as stated. A bare "500" means 500, never 5,000. Multiply by 1,000 only when the user explicitly says "k" or "thousand" (for example, "5k" = 5000). Do not infer, round, or add zeros.
- For audio, carefully distinguish spoken "five hundred" (500) from "five thousand" (5000). If the amount is unclear, return null rather than guessing. Set raw_input to a verbatim transcript, preserving the spoken amount accurately.
- Never output just the transfers array by itself.
- recipient_is_self = true when the money goes to the user's OWN account
  ("to my opay", "my other account", "myself", "to my GTB").
  If the recipient is someone else, use false.
  For a transfer, never return null for recipient_is_self: use true or false.
Examples:
- "send 2k from my palmpay to my opay" -> sender_bank "Palmpay", recipient_bank "Opay",
  recipient_is_self true, recipient_account_number null, recipient_name null
- "send 5k to 7031272572 on opay" -> recipient_is_self false
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
- Detect the user's dominant language and set lang to exactly "english", "pidgin", or "yoruba". Default to "english" when uncertain.
- Every entity field must be present in the JSON response. Missing values must be null.
- Never guess account numbers, bank names, amounts, or names that are not explicitly stated.
- Preserve numeric transfer amounts literally: "500" is 500, not 5000. Apply a thousand multiplier only for an explicit "k" or "thousand" suffix/word. If unsure, set amount to null.
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
recipient_name, sender_bank, recipient_is_self.

Combine information from the image and text.
Preserve multiple transfers in order.
Missing values = null.
Detect the language in the user's text or caption and include lang as exactly "english", "pidgin", or "yoruba". Default to "english" when uncertain.

Return only JSON matching the schema and ensure the top-level result is an object, not an array.
`.trim();

const AUDIO_SYSTEM_PROMPT = `
You are a fintech intent extractor for spoken Nigerian English, Nigerian
Pidgin, Yoruba, or mixed speech. Listen to the audio and extract the user's
intent directly; do not require a separate transcription step.

${OUTPUT_SCHEMA_INSTRUCTIONS}

Apply the same intent rules as typed messages:
- transfer_request: the user asks to send, pay, or move money.
- balance_check: the user asks for an account balance.
- transaction_history: the user asks about past transfers, statements, or history.
- share_account_details: the user shares their own account details.
- list_beneficiaries: the user asks to list saved beneficiaries.
- confirm_transaction: the user confirms a pending action.
- cancel_transaction: the user cancels or stops a pending action.
- unclear: greetings, casual chat, bank-only mentions, or insufficient signal.

First transcribe every audible spoken word into raw_input, then classify that
transcript. Do not leave raw_input empty when any speech is audible. If a short
span cannot be understood, write [unintelligible] for that span and still
transcribe the rest. Never mark the entire clip unintelligible unless it is
silent or contains no discernible speech.

Extract only information actually spoken. Never guess names, bank names,
account digits, or amounts. Pay special attention to Nigerian bank and wallet
names, code-switching, and number words. Preserve amounts exactly: "five
hundred" is 500, not 5000; "five thousand" is 5000. If an amount or account
digit is unclear, use null rather than guessing.

For transfers, identify the sending bank separately from the receiving bank.
Put each distinct transfer in transfers[] in spoken order. Populate date
entities for history requests. Set raw_input to the closest verbatim transcript
you can infer, preserving the original language and spoken amount.

Greetings and casual chat are unclear unless the user clearly asks for a
financial action. A bank name alone is unclear. Date words such as yesterday,
today, last week, or last month indicate transaction_history.
If the audio is silent, use intent "unclear", confidence 0 and raw_input "".
If speech is audible but cannot be understood, use intent "unclear",
confidence 0 and raw_input "[unintelligible speech]".
Return only JSON matching the schema.
`.trim();

const ENTITY_KEYS = [
  "amount",
  "recipient_account_number",
  "recipient_bank",
  "recipient_name",
  "sender_bank",
  "from_date",
  "to_date",
  "recipient_is_self",
];

const TRANSFER_ENTITY_KEYS = [
  "amount",
  "recipient_account_number",
  "recipient_bank",
  "recipient_name",
  "sender_bank",
  "recipient_is_self",
];

const RECIPIENT_IS_SELF_SCHEMA = {
  type: ["boolean", "null"],
  description:
    "true if the money goes to the user's OWN account (e.g. 'to my opay', 'myself', 'my other account'). false if it goes to another person.",
};

const TRANSFER_ENTITY_SCHEMA = {
  type: "object",
  properties: {
    amount: { type: ["number", "null"] },
    recipient_account_number: { type: ["string", "null"] },
    recipient_bank: { type: ["string", "null"] },
    recipient_name: { type: ["string", "null"] },
    sender_bank: { type: ["string", "null"] },
    recipient_is_self: RECIPIENT_IS_SELF_SCHEMA,
  },
  required: TRANSFER_ENTITY_KEYS,
};

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    lang: { type: "string", enum: ["english", "pidgin", "yoruba"] },
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
        recipient_is_self: RECIPIENT_IS_SELF_SCHEMA,
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
  required: [
    "lang",
    "intent",
    "entities",
    "transfers",
    "confidence",
    "raw_input",
  ],
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
 * Corrects model-scaled numeric amounts when the user explicitly typed digits
 * immediately after a transfer verb. A multiplier is applied only when the
 * input itself explicitly includes "k" or "thousand".
 * @param {object} intent
 * @param {string} sourceText
 */
function preserveExplicitNumericAmounts(intent, sourceText = "") {
  if (intent.intent !== "transfer_request") return intent;

  // Restrict extraction to amount positions directly following transfer verbs;
  // this avoids interpreting recipient account numbers after "to" as amounts.
  const amountPattern =
    /\b(?:send|transfer|pay)\s+(?:(?:me|an amount of|the amount of)\s+)?(?:₦\s*|NGN\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?\b/gi;
  const explicitAmounts = [...String(sourceText).matchAll(amountPattern)].map(
    ([, rawAmount, unit]) => {
      const amount = Number(rawAmount.replaceAll(",", ""));
      return unit ? amount * 1000 : amount;
    },
  );

  if (!explicitAmounts.length) return intent;

  const transfers = intent.transfers || [];
  if (explicitAmounts.length === 1 && transfers.length === 1) {
    transfers[0].amount = explicitAmounts[0];
  } else if (explicitAmounts.length === transfers.length) {
    transfers.forEach((transfer, index) => {
      transfer.amount = explicitAmounts[index];
    });
  } else {
    return intent;
  }

  if (transfers.length === 1) intent.entities.amount = transfers[0].amount;
  return intent;
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
  const languageAliases = {
    en: "english",
    english: "english",
    pcm: "pidgin",
    pidgin: "pidgin",
    yo: "yoruba",
    yoruba: "yoruba",
  };
  const lang =
    languageAliases[
      String(rawObject.lang || "")
        .trim()
        .toLowerCase()
    ] || "english";

  const entities = normalizeEntities(rawObject.entities || {});

  let transfers = [];
  if (Array.isArray(transferList) && transferList.length) {
    transfers = transferList.map(normalizeTransferEntity);
  } else if (intent === "transfer_request") {
    transfers = [normalizeTransferEntity(entities)];
  }

  // Safety net: don't rely only on the LLM to flag "to my <bank>" transfers.
  // The negative lookahead avoids treating "to my brother's opay" as self.
  const SELF_RE =
    /\b(?:(?:to|into)\s+my\s+(?!(?:brother|sister|mum|mom|dad|papa|mama|friend|wife|husband|boss|oga|landlord|guy|girl)\b)|myself\b|my\s+(?:own|other)\s+account)/i;

  if (intent === "transfer_request" && SELF_RE.test(fallbackRawInput || "")) {
    for (const t of transfers) {
      if (t.recipient_is_self == null && !t.recipient_account_number) {
        t.recipient_is_self = true;
      }
    }
    if (
      entities.recipient_is_self == null &&
      !entities.recipient_account_number
    ) {
      entities.recipient_is_self = true;
    }
  }

  return {
    lang,
    intent,
    entities,
    transfers,
    confidence:
      typeof rawObject.confidence === "number" ? rawObject.confidence : 0.5,
    raw_input: String(rawObject.raw_input ?? fallbackRawInput ?? ""),
  };
}

/**
 * Extracts structured intent from text, an image, or a voice note in a
 * single multimodal Gemini call.
 * @param {object} params
 * @param {string} [params.text] - Raw text (Telegram message or caption)
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

  // One multimodal call: text, image and audio all go in together.
  const input = [];
  if (text?.trim()) input.push({ type: "text", text: text.trim() });
  if (audioBase64) {
    input.push({
      type: "text",
      text: "Transcribe the speech in the attached audio verbatim into raw_input, then extract its intent. Do not return an empty transcript if speech is audible.",
    });
  }
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
  console.log("[GEMINI RAW]", rawText);

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

  // For voice notes the transcript only exists after the call, so the
  // post-processing below falls back to the model's raw_input.
  const sourceText = text?.trim() || parsedIntent?.raw_input || "";

  parsedIntent = normalizeParsedIntent(parsedIntent, sourceText);
  parsedIntent = preserveExplicitNumericAmounts(parsedIntent, sourceText);

  if (audioBase64 && !parsedIntent.raw_input) {
    console.warn("[AUDIO] Gemini returned an empty transcript");
  }

  console.log("Extracted intent:", JSON.stringify(parsedIntent, null, 2));
  return parsedIntent;
}
export default extractIntent;
