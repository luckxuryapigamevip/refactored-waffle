const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// --- CẤU HÌNH HỆ THỐNG ---
const TELEGRAM_TOKEN = '8899402629:AAEP1obdz_SdGP_4N1cG73KYBmjFvOLvlPY'; // Thay token bot của bạn vào đây
const LINK4M_API_TOKEN = '6add63fc9e27f139127d2a92'; // API Token Link4M của bạn
const PORT = process.env.PORT || 3000;
const SERVER_URL = 'https://refactored-waffle-tjw7.onrender.com'; // Link Render của bạn
const FRONTEND_URL = 'https://comforting-elf-d5535a.netlify.app/index.html'; // Link Netlify của bạn
const DATA_FILE = './keys.json';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();
app.use(express.json());

// --- QUẢN LÝ DATABASE JSON ---
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- HÀM TẠO LINK RÚT GỌN LINK4M (ĐÃ TỐI ƯU & GHI LOG) ---
async function createLink4M(longUrl) {
    try {
        const apiLink = `https://link4m.com/api?api=${LINK4M_API_TOKEN}&url=${encodeURIComponent(longUrl)}`;
        const response = await fetch(apiLink);
        const data = await response.json();
        
        // In log ra màn hình Render để dễ kiểm tra nếu có lỗi
        console.log("Phản hồi từ Link4M API:", data);

        // Hỗ trợ kiểm tra các định dạng trả về thường gặp của Link4M
        if (data.status === 'success' || data.shortenedUrl || data.url) {
            return data.shortenedUrl || data.url;
        } else {
            console.error('Link4M trả về lỗi:', data.message || data);
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

    // Kiểm tra nếu chưa có key hoặc key đã quá hạn 12h
    if (!userRecord || userRecord.expires_at < now) {
        bot.sendMessage(chatId, `⏳ Đang tạo link vượt quảng cáo mới cho bạn, vui lòng đợi một chút...`);

        // Link đích trỏ về server xác thực
        const targetUrl = `${SERVER_URL}/api/generate?userid=${userId}`;
        const shortLink = await createLink4M(targetUrl);

        if (!shortLink) {
            return bot.sendMessage(chatId, `❌ Lỗi hệ thống: Không thể tạo link rút gọn từ Link4M. Vui lòng kiểm tra lại API Token hoặc thử lại sau!`);
        }

        bot.sendMessage(chatId, 
            `❌ **Key của bạn đã hết hạn hoặc chưa có!**\n\n` +
            `👉 Bấm vào link bên dưới để vượt link lấy key mới (Thời hạn sử dụng: 12 giờ):\n${shortLink}`,
            { parse_mode: 'Markdown' }
        );
    } else {
        // Key vẫn còn hạn
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

    // Tạo key mới thời hạn chính xác 12 tiếng
    const newKey = 'KEY-' + uuidv4().toUpperCase();
    const expirationTime = now + (12 * 60 * 60 * 1000); 
    const expireString = new Date(expirationTime).toLocaleString();

    db[userId] = {
        key: newKey,
        expires_at: expirationTime,
        expires_at_string: expireString
    };

    writeData(db);

    // Chuyển hướng sang trang Netlify kèm theo key mới và userid
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

// Khởi chạy server
app.listen(PORT, () => {
    console.log(`🚀 Hệ thống Server đang chạy tại cổng ${PORT}`);
});
