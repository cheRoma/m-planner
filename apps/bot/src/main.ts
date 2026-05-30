import { makeBot } from "./bot";
const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN required");
makeBot(token).start();
