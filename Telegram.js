const TelegramApi = require("node-telegram-bot-api");

const Telegram = new TelegramApi(process.env.TELEGRAM_TOKEN, { polling: true });


module.exports = Telegram;