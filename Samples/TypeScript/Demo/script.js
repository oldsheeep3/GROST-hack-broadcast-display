// Socket.IOがグローバルに存在するかチェックし、なければエラーを出さずに終了
function setupLiveChat() {
    // Socket.IOクライアントがグローバルに存在するか確認
    if (typeof io !== "function") {
        console.warn("[warn] Socket.IOクライアントが読み込まれていません。チャット機能は無効です。");
        return;
    }

    const socket = io("http://minicpc:3031");

    console.log("[info] Trying to connect to live chat server...");
    socket.on("connect", () => {
        console.log("[info] Connected to live chat server");
    });

    const comment = document.getElementById("comment-inner");
    if (!comment) {
        console.warn("[warn] #comment-inner が見つかりません。チャット表示をスキップします。");
        return;
    }

    // スクロールアニメーション関数
    function animateScrollToBottom(element, duration = 300) {
        const start = element.scrollTop;
        const end = element.scrollHeight - element.clientHeight;
        const startTime = performance.now();

        function animate(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-in-out
            const ease = 0.5 - 0.5 * Math.cos(Math.PI * progress);
            element.scrollTop = start + (end - start) * ease;
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }
        requestAnimationFrame(animate);
    }

    const addComment = (user, msg) => {
        const commentMsg = document.createElement("div");
        const newName = document.createElement("div");
        const newMsg = document.createElement("div");
        newName.className = "name";
        newMsg.className = "msg";
        newName.appendChild(document.createElement("p"));
        newName.firstChild.textContent = user;
        newMsg.innerHTML = msg; // msgはHTML（エスケープ済み前提）
        commentMsg.appendChild(newName);
        commentMsg.appendChild(newMsg);
        comment.appendChild(commentMsg);

        // 0.3秒かけて一番下までスクロール
        animateScrollToBottom(comment, 300);
    };

    socket.on("chat", (msg) => {
        const now = Date.now();
        const showAt = Date.parse(msg.timestamp); // サーバーから送られたUNIXミリ秒
        const delay = Math.max(showAt - now + 4000, 0);
        console.log(showAt, now, delay);
        setTimeout(() => {
            addComment(msg.user, msg.message);
        }, delay);
    });

    socket.on("connect_error", (err) => {
        console.error("[error] Live chat serverへの接続に失敗:", err.message);
    });
}

// DOMContentLoadedで安全に実行
window.addEventListener("DOMContentLoaded", setupLiveChat);
