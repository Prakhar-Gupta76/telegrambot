const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const express = require('express');
const fs = require('fs');
const cors = require('cors')

// not for deployed one
// const dotenv = require('dotenv');
// dotenv.config();
// const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
// const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
// const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

//for deployed one
const { WEATHER_API_KEY, TELEGRAM_API_KEY, ADMIN_CHAT_ID } = require('./apis.js');

const bot = new TelegramBot(TELEGRAM_API_KEY, { polling: true });

let subscribedUsers = new Set();
let blockedUsers = new Set();

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.post('/api/update-keys', (req, res) => {
    console.log("Updating API keys...");
    console.log(req.body);

    const { WEATHER_API_KEY: newWeatherApiKey, TELEGRAM_API_KEY: newTelegramApiKey, ADMIN_CHAT_ID: newAdminChatId } = req.body;
    if (!newWeatherApiKey || !newTelegramApiKey || !newAdminChatId) {
        return res.status(400).json({ message: 'All keys are required.' });
    }
    const apisData = `
const WEATHER_API_KEY = "${newWeatherApiKey}";
const TELEGRAM_API_KEY = "${newTelegramApiKey}";
const ADMIN_CHAT_ID = "${newAdminChatId}";

module.exports = { WEATHER_API_KEY, TELEGRAM_API_KEY, ADMIN_CHAT_ID };
`;

    try {
        fs.writeFileSync('./apis.js', apisData.trim()); // Trim ensures no trailing spaces
        console.log("API keys successfully updated in apis.js.");
    } catch (error) {
        console.error("Error writing to apis.js:", error);
        return res.status(500).json({ message: 'Failed to update API keys.' });
    }

    res.json({ message: 'API keys updated successfully.' });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Welcome to the Weather Bot! Use /subscribe to get weather updates.');
});

bot.onText(/\/subscribe/, (msg) => {
    const chatId = msg.chat.id;
    if (blockedUsers.has(chatId)) {
        bot.sendMessage(chatId, 'You are blocked and cannot subscribe to updates.');
        return;
    }
    if (!subscribedUsers.has(chatId)) {
        subscribedUsers.add(chatId);
        bot.sendMessage(chatId, 'You have subscribed to weather updates!');
    } else {
        bot.sendMessage(chatId, 'You are already subscribed to weather updates.');
    }
});

bot.onText(/\/unsubscribe/, (msg) => {
    const chatId = msg.chat.id;
    if (subscribedUsers.has(chatId)) {
        subscribedUsers.delete(chatId);
        bot.sendMessage(chatId, 'You have unsubscribed from weather updates.');
    } else {
        bot.sendMessage(chatId, 'You are not subscribed to weather updates.');
    }
});

bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() === ADMIN_CHAT_ID) {
        let subscribedList = 'Subscribed Users:\n';
        if (subscribedUsers.size > 0) {
            subscribedUsers.forEach((userId) => {
                subscribedList += `- ${userId}\n`;
            });
        } else {
            subscribedList += 'No users are currently subscribed.\n';
        }

        let blockedList = 'Blocked Users:\n';
        if (blockedUsers.size > 0) {
            blockedUsers.forEach((userId) => {
                blockedList += `- ${userId}\n`;
            });
        } else {
            blockedList += 'No users are currently blocked.\n';
        }

        bot.sendMessage(chatId, `Admin Panel\n\n${subscribedList}\n${blockedList}`);
    } else {
        bot.sendMessage(chatId, 'You are not authorized to access the admin panel.');
    }
});

async function getWeather(city) {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.cod === 200) {
        return `${data.name}, ${data.sys.country}\nTemperature: ${data.main.temp}°C\nWeather: ${data.weather[0].description}`;
    } else {
        return 'City not found.';
    }
}

bot.onText(/\/sendweather (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId.toString() === ADMIN_CHAT_ID) {
        const city = match[1];
        const weatherInfo = await getWeather(city);
        subscribedUsers.forEach((userId) => {
            bot.sendMessage(userId, `Weather update for ${city}:\n${weatherInfo}`);
        });
    } else {
        bot.sendMessage(chatId, 'You are not authorized to send weather updates.');
    }
});

bot.onText(/\/block (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId.toString() === ADMIN_CHAT_ID) {
        const userIdToBlock = parseInt(match[1]);
        if (subscribedUsers.has(userIdToBlock)) {
            subscribedUsers.delete(userIdToBlock);
        }
        blockedUsers.add(userIdToBlock);
        bot.sendMessage(chatId, `User ${userIdToBlock} has been blocked.`);
    } else {
        bot.sendMessage(chatId, 'You are not authorized to block users.');
    }
});

bot.onText(/\/unblock (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId.toString() === ADMIN_CHAT_ID) {
        const userIdToUnblock = parseInt(match[1]);
        if (blockedUsers.has(userIdToUnblock)) {
            blockedUsers.delete(userIdToUnblock);
            subscribedUsers.add(userIdToUnblock);
            bot.sendMessage(chatId, `User ${userIdToUnblock} has been unblocked and added back to the subscribed list.`);
        } else {
            bot.sendMessage(chatId, `User ${userIdToUnblock} is not blocked.`);
        }
    } else {
        bot.sendMessage(chatId, 'You are not authorized to unblock users.');
    }
});

bot.onText(/\/delete (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId.toString() === ADMIN_CHAT_ID) {
        const userIdToDelete = parseInt(match[1]);
        if (blockedUsers.has(userIdToDelete)) {
            blockedUsers.delete(userIdToDelete);
            bot.sendMessage(chatId, `User ${userIdToDelete} has been deleted.`);
        }
        else if (subscribedUsers.has(userIdToDelete)) {
            bot.sendMessage(chatId, `User ${userIdToDelete} is not in the blocked list. Are you sure you want to delete this user?`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Yes', callback_data: `confirm_delete_${userIdToDelete}` },
                            { text: 'No', callback_data: 'cancel_delete' }
                        ]
                    ]
                }
            });
        }
        else {
            bot.sendMessage(chatId, `User ${userIdToDelete} is not found in the subscribed or blocked lists.`);
        }
    } else {
        bot.sendMessage(chatId, 'You are not authorized to delete users.');
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    if (data.startsWith('confirm_delete_')) {
        const userIdToDelete = parseInt(data.split('_')[2]);
        subscribedUsers.delete(userIdToDelete);
        blockedUsers.delete(userIdToDelete);
        bot.sendMessage(chatId, `User ${userIdToDelete} has been deleted from subscribed users.`);
        bot.answerCallbackQuery(query.id);
    } else if (data === 'cancel_delete') {
        bot.sendMessage(chatId, 'Delete action canceled.');
        bot.answerCallbackQuery(query.id);
    }
});