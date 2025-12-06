const wsUrlInput = 'ws://100.74.118.30:9000/vc';
let statusMsg = '';
const logContainer = [];

// WebSocket接続
let ws = null;
let connected = false;
let myClientId = null;

// イベントリスナーを設定
window.addEventListener('DOMContentLoaded', () => {
    connect();
})

// 初期ログメッセージ
addLog('info', 'wsサーバーへ接続');

// 接続関数
function connect() {
    if (ws) {
        ws.close();
    }

    try {
        const wsUrl = wsUrlInput;
        updateStatus('connecting', '接続中...');
        addLog('info', `WebSocketサーバーに接続中: ${wsUrl}`);

        ws = new WebSocket(wsUrl);

        ws.onopen = function (e) {
            connected = true;
            updateStatus('connected', '接続済み');
            addLog('success', `WebSocketサーバーに接続しました: ${wsUrl}`);

        };

        ws.onmessage = function (event) {
            addLog('debug', `ws.onmessage受信: ${event.data instanceof Blob ? '[Blob]' : event.data}`);

            if (event.data instanceof Blob) {
                // バイナリデータ（音声データ）を受信
                handleAudioData(event.data);
            } else {
                // テキストデータ（JSONメッセージ）を受信
                try {
                    const data = JSON.parse(event.data);
                    handleJsonMessage(data);
                } catch (error) {
                    addLog('warning', `不明なメッセージを受信: ${event.data}`);
                }
            }
        };

        ws.onclose = function (event) {
            connected = false;
            myClientId = null;
            updateStatus('disconnected', '切断済み');
            addLog('warning', 'WebSocket接続が閉じられました');
        };

        ws.onerror = function (error) {
            connected = false;
            myClientId = null;
            updateStatus('disconnected', 'エラー');
            addLog('error', `WebSocketエラー: ${error.message || 'Unknown error'}`);
        };

    } catch (error) {
        updateStatus('disconnected', 'エラー');
        addLog('error', `接続エラー: ${error.message}`);
    }
}

// 切断関数
function disconnect() {
    if (ws) {
        ws.close();
    }
}

// JSONメッセージハンドラ
function handleJsonMessage(data) {
    switch (data.type) {
        case 'welcome':
            myClientId = data.client_id;
            addLog('success', `${data.message} (ID: ${myClientId})`);
            break;

        case 'client_connected':
            if (data.client_id !== myClientId) {
                addLog('info', `新しいクライアントが接続しました: ${data.client_id}`);
            }
            break;

        case 'client_disconnected':
            addLog('info', `クライアントが切断しました: ${data.client_id}`);
            break;

        case 'audio_request':
            const isMyRequest = data.requester === myClientId;
            const requesterText = isMyRequest ? '(あなた)' : '';
            addLog('request',
                `音声生成リクエスト: "${data.text}" (感情: ${data.emotion}) by ${data.requester} ${requesterText}`
            );
            if (!isMyRequest) {
                updateStatus('generating', '他のクライアントが音声生成中...');
            }
            break;

        case 'audio_error':
            const isMyError = data.requester === myClientId;
            const errorText = isMyError ? '(あなたのリクエスト)' : '';
            addLog('error', `音声生成エラー: ${data.error} by ${data.requester} ${errorText}`);
            updateStatus('connected', '接続済み');
            break;

        default:
            if (data.error) {
                addLog('error', `サーバーエラー: ${data.error}`);
                updateStatus('connected', '接続済み（エラー発生）');
            } else {
                addLog('info', `未知のメッセージタイプ: ${data.type || 'unknown'}`);
            }
            break;
    }
}


// 音声データを処理する関数
function handleAudioData(blob) {
    updateStatus('connected', '接続済み');
    addLog('broadcast', `音声データを受信しました (サイズ: ${blob.size} bytes, type: ${blob.type})`);

    const audio = document.getElementById('main-audio');
    if (!audio) {
        addLog('error', 'audio要素が見つかりません');
        return;
    }

    // 連続再生時のリセット
    audio.pause();
    audio.currentTime = 0;

    // 以前のURLを解放
    if (audio.src) {
        URL.revokeObjectURL(audio.src);
    }

    // BlobからURLを作成してsrcにセット
    const audioUrl = URL.createObjectURL(blob);
    audio.src = audioUrl;
    audio.autoplay = true;
    audio.muted = false; // 念のため

    // 再生
    audio.play().then(() => {
        addLog('info', '音声再生開始');
    }).catch((e) => {
        addLog('error', '自動再生に失敗しました: ' + e.message);
    });

    // 再生終了時にURLを解放
    audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
    };
    audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
    };
}

// Audio再生のアンロック用
let audioUnlocked = false;

function unlockAudio() {
    if (audioUnlocked) return;
    // 無音のAudioを再生してアンロック
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioUnlocked = true;
    ctx.close();
    console.log('Audio context unlocked');
    addLog('info', 'Audio context unlocked');
    updateStatus('connected', '接続済み（オーディオアンロック済み）');
}

// 最初のユーザー操作でアンロック
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('touchstart', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// ステータス更新関数
function updateStatus(type, message) {
    statusMsg = message;
}

// ログ追加関数
function addLog(type, message) {
    console.log(`[${type}] ${message}`);
    // const logEntry = document.createElement('div');
    // logEntry.className = `log-entry log-${type}`;

    // const timestamp = document.createElement('span');
    // timestamp.className = 'timestamp';
    // timestamp.textContent = new Date().toLocaleTimeString();

    // const messageDiv = document.createElement('div');
    // messageDiv.textContent = message;
    // messageDiv.appendChild(timestamp);

    // logEntry.appendChild(messageDiv);
    // logContainer.appendChild(logEntry);
}

// ログクリア関数
function clearLog() {
    logContainer = [];
    addLog('info', 'ログをクリアしました');
}