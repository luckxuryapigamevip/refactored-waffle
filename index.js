const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// --- CẤU HÌNH HỆ THỐNG ---
const TELEGRAM_TOKEN = '8899402629:AAEP1obdz_SdGP_4N1cG73KYBmjFvOLvlPY'; // Thay token bot của bạn vào đây
const LINK4M_API_TOKEN = '6add63fc9e27f139127d2a92'; // API Token Link4M của bạn
const PORT = process.env.PORT || 3000;
const SERVER_URL = 'https://refactored-waffle-tjw7.onrender.com';
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

// --- HÀM TẠO LINK RÚT GỌN LINK4M (ĐÃ SỬA ĐÚNG ENDPOINT V2) ---
async function createLink4M(longUrl) {
    try {
        // Cập nhật đúng URL endpoint từ tài liệu Link4M của bạn
        const apiLink = `https://link4m.co/api-shorten/v2?api=${LINK4M_API_TOKEN}&url=${encodeURIComponent(longUrl)}`;
        const response = await fetch(apiLink);
        const data = await response.json();
        
        console.log("Phản hồi từ Link4M API:", data);

        // Theo tài liệu Link4M trả về: {"status":"success","shortenedUrl":"https://..."}
        if (data.status === 'success' && data.shortenedUrl) {
            return data.shortenedUrl;
        } else {
            console.error('Link4M trả về lỗi:', data);
            return null;
        }
    } catch (error) {
        console.error('Lỗi kết nối đến Link4M:', error);
        return null;
    }
}

// --- LUỒNG BOT TELEGRAM (/getkey) ---
bot.onText(/\/getkey/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    let db = readData();
    const now = Date.now();
    let userRecord = db[userId];

    if (!userRecord || userRecord.expires_at < now) {
        bot.sendMessage(chatId, `⏳ Đang tạo link vượt quảng cáo mới cho bạn, vui lòng đợi một chút...`);

        const targetUrl = `${SERVER_URL}/api/generate?userid=${userId}`;
        const shortLink = await createLink4M(targetUrl);

        if (!shortLink) {
            return bot.sendMessage(chatId, `❌ Lỗi hệ thống: Không thể tạo link rút gọn từ Link4M. Vui lòng thử lại sau!`);
        }

        bot.sendMessage(chatId, 
            `❌ **Key của bạn đã hết hạn hoặc chưa có!**\n\n` +
            `👉 Bấm vào link bên dưới để vượt link lấy key mới (Thời hạn sử dụng: 12 giờ):\n${shortLink}`,
            { parse_mode: 'Markdown' }
        );
    } else {
        const remainingMinutes = Math.ceil((userRecord.expires_at - now) / (1000 * 60));
        bot.sendMessage(chatId, 
            `✅ **Key hiện tại của bạn vẫn còn hạn:**\n` +
            `🔑 Key: \`${userRecord.key}\`\n` +
            `⏳ Thời gian còn lại: khoảng ${remainingMinutes} phút\n` +
            `⏰ Hết hạn lúc: ${userRecord.expires_at_string}`,
            { parse_mode: 'Markdown' }
        );
    }
});

// --- API XỬ LÝ SAU KHI VƯỢT LINK THÀNH CÔNG ---
app.get('/api/generate', (req, res) => {
    const userId = req.query.userid;

    if (!userId) {
        return res.status(400).send('Thiếu thông tin người dùng.');
    }

    let db = readData();
    const now = Date.now();

    const newKey = 'KEY-' + uuidv4().toUpperCase();
    const expirationTime = now + (12 * 60 * 60 * 1000); 
    const expireString = new Date(expirationTime).toLocaleString();

    db[userId] = {
        key: newKey,
        expires_at: expirationTime,
        expires_at_string: expireString
    };

    writeData(db);

    res.redirect(`${FRONTEND_URL}?key=${newKey}&userid=${userId}`);
});

// --- API NGẦM ĐỂ TRANG NETLIFY GỌI VÀ GỬI KEY VỀ TELEGRAM ---
app.get('/api/send-key-telegram', async (req, res) => {
    const userId = req.query.userid;
    const key = req.query.key;

    if (!userId || !key) {
        return res.status(400).json({ error: 'Thiếu thông tin' });
    }

    try {
        await bot.sendMessage(userId, 
            `🎉 **Xác thực và vượt link thành công!**\n` +
            `🔑 Key mới của bạn (Hiệu lực 12 giờ):\n\`${key}\`\n\n` +
            `Hãy copy key và tận hưởng dịch vụ nhé!`,
            { parse_mode: 'Markdown' }
        );

        res.json({ success: true, message: 'Đã gửi key qua Telegram thành công!' });
    } catch (error) {
        console.error('Không thể gửi tin nhắn Telegram:', error);
        res.status(500).json({ error: 'Không thể gửi tin nhắn.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Hệ thống Server đang chạy tại cổng ${PORT}`);
});
