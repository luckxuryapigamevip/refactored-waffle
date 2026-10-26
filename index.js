const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const TELEGRAM_TOKEN = '8899402629:AAFnNM6lxJPc1aQg6kXbG_f79PEvdoTb6sk'; // Token của @buykeyvipweb_bot
const LINK4M_API_TOKEN = '6add63fc9e27f139127d2a92';
const PORT = 3000;
const SERVER_URL = 'https://domain-cua-ban.com'; 
const FRONTEND_URL = 'https://comforting-elf-d5535a.netlify.app/index.html'; 
const DATA_FILE = './keys.json';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();
app.use(express.json());

function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function createLink4M(longUrl) {
    try {
        const apiLink = `https://link4m.com/api?api=${LINK4M_API_TOKEN}&url=${encodeURIComponent(longUrl)}`;
        const response = await fetch(apiLink);
        const data = await response.json();
        if (data.status === 'success' || data.shortenedUrl) return data.shortenedUrl;
        return null;
    } catch (error) {
        return null;
    }
}

// 1. Luồng khi người dùng nhắn /getkey
bot.onText(/\/getkey/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    let db = readData();
    const now = Date.now();
    let userRecord = db[userId];

    // Nếu chưa có key hoặc key đã hết hạn
    if (!userRecord || userRecord.expires_at < now) {
        bot.sendMessage(chatId, `⏳ Đang tạo link vượt quảng cáo mới cho bạn, vui lòng đợi...`);

        const targetUrl = `${SERVER_URL}/api/generate?userid=${userId}`;
        const shortLink = await createLink4M(targetUrl);

        if (!shortLink) {
            return bot.sendMessage(chatId, `❌ Lỗi: Không thể tạo link rút gọn từ Link4M. Vui lòng thử lại!`);
        }

        bot.sendMessage(chatId, 
            `❌ **Key của bạn đã hết hạn hoặc chưa có!**\n\n` +
            `👉 Bấm vào link dưới đây để vượt link lấy key mới (Hiệu lực 12h):\n${shortLink}`,
            { parse_mode: 'Markdown' }
        );
    } else {
        const remainingMinutes = Math.ceil((userRecord.expires_at - now) / (1000 * 60));
        bot.sendMessage(chatId, 
            `✅ **Key hiện tại của bạn vẫn còn hạn:**\n` +
            `🔑 Key: \`${userRecord.key}\`\n` +
            `⏳ Thời gian còn lại: khoảng ${remainingMinutes} phút`,
            { parse_mode: 'Markdown' }
        );
    }
});

// 2. API sinh key mới hoàn toàn khi vượt link thành công
app.get('/api/generate', (req, res) => {
    const userId = req.query.userid;
    if (!userId) return res.status(400).send('Thiếu thông tin.');

    let db = readData();
    const now = Date.now();

    // Tạo key mới hoàn toàn
    const newKey = 'KEY-' + uuidv4().toUpperCase();
    const expirationTime = now + (12 * 60 * 60 * 1000); 
    const expireString = new Date(expirationTime).toLocaleString();

    // Lưu đè key mới vào database
    db[userId] = {
        key: newKey,
        expires_at: expirationTime,
        expires_at_string: expireString
    };
    writeData(db);

    // Chuyển hướng sang trang Netlify kèm theo key mới
    res.redirect(`${FRONTEND_URL}?key=${newKey}&userid=${userId}&status=active`);
});

// 3. API ngầm để gửi key mới về Telegram
app.get('/api/send-key-telegram', async (req, res) => {
    const userId = req.query.userid;
    const key = req.query.key;

    if (!userId || !key) return res.status(400).json({ error: 'Thiếu thông tin' });

    try {
        await bot.sendMessage(userId, 
            `🎉 **Vượt link thành công!**\n` +
            `🔑 Key mới của bạn (Hạn 12 giờ):\n\`${key}\`\n\n` +
            `Hãy copy key và sử dụng nhé!`,
            { parse_mode: 'Markdown' }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Không gửi được tin nhắn' });
    }
});

app.listen(PORT, () => {
    console.log(`Server chạy trên cổng ${PORT}`);
});
