import { LiveChat } from "youtube-chat";
import express from "express";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

console.log("Starting live chat server...");

// __dirname workaround for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const liveChat = new LiveChat({ channelId: "UCuep1JCrMvSxOGgGhBfJuYw" });

const PORT = 3031;
const INDEX = "/index.html";

// HTTPサーバーとExpress
const app = express();
app.use(cors({ origin: "*" })); // ここを追加
const httpServer = http.createServer(app);

app.use(express.static(__dirname)); // 静的ファイル配信
app.get("/", (req, res) => res.sendFile(INDEX, { root: __dirname }));

httpServer.listen(PORT, () => {
    console.log(`Live chat server listening on port ${PORT}`);
});

// Socket.IOサーバー
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

io.on('connection', (socket) => {
    console.log('Client connected');
    socket.on('disconnect', () => console.log('Client disconnected'));
});

// メッセージHTML生成
const commentElement = (msgs) => {
    let retData = "<p>";
    msgs.forEach((msg) => {
        if ("text" in msg && msg.text) {
            retData += msg.text;
        } else if ("emojiText" in msg && msg.emojiText) {
            retData += `<img src="${msg.url}" alt="${msg.alt}">`;
        }
    });
    retData += "</p>";
    return retData;
};

// LiveChatイベント
liveChat.on("start", (liveId) => {
    console.log("Live chat started for liveId:", liveId);
});

liveChat.on("end", (reason) => {
    console.log("Live chat ended", reason || "No reason provided");
});

liveChat.on("chat", (chatItem) => {
    const msg = {
        message: commentElement(chatItem.message),
        user: chatItem.author.name,
        timestamp: chatItem.timestamp
    };
    io.emit("chat", msg); // クライアントに送信
});

liveChat.on("error", (err) => {
    console.error("An error occurred:", err);
});

const ok = await liveChat.start();
if (!ok) {
    console.log("Failed to start, check emitted error");
}