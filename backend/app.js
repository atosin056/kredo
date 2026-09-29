import express from "express";
import "dotenv/config";
import { webhookCallback } from "grammy";
import Kredobot from "./src/bot/Kredobot.js";

const { PORT = 3000, PUBLIC_URL, WEBHOOK_SECRET } = process.env;

if (!PUBLIC_URL || !WEBHOOK_SECRET) {
  console.error("PUBLIC_URL and WEBHOOK_SECRET must be set");
  process.exit(1);
}

const app = express();
app.use(express.json());

const kredo = new Kredobot();
const bot = kredo.bot;

app.get("/", (req, res) => res.send("Kredo is running"));

app.post(
  "/webhook",
  webhookCallback(bot, "express", {
    secretToken: WEBHOOK_SECRET,
    onTimeout: "return",
  }),
);

await bot.init(); // before we accept any traffic

app.listen(PORT, async () => {
  console.log(`server active on port ${PORT}`);
  try {
    await bot.api.setWebhook(`${PUBLIC_URL}/webhook`, {
      secret_token: WEBHOOK_SECRET,
    });
    console.log("webhook set:", `${PUBLIC_URL}/webhook`);
  } catch (err) {
    console.error("Failed to set webhook:", err);
  }
});
