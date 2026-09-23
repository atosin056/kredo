import express from "express";
import "dotenv/config";
import Kredobot from "./src/bot/Kredobot.js";

// Initialize Express
const app = express();

app.use(express.json());

app.listen(3000, () => {
  console.log("server active on port 3000");
});

const bot = new Kredobot();
bot.start();
