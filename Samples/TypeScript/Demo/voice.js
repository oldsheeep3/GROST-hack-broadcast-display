const wsUrlInput = 'ws://100.79.67.103:8002/ws/tts';
let statusMsg = '';
const logContainer = [];

// WebSocket接続
let ws = null;
let connected = false;
let myClientId = null;

// Audio関連
let audioContext = null;
let audioQueue = [];
let isPlaying = false;
let currentSource = null;
let totalAudioTime = 0;
let gainNode = null;
let audioVolume = 1.0; // デフォルト音量 0.0～1.0
let analyser = null;
let dataArray = null;

// テキスト入力・コメント生成用
let commentGenerationAbortController = null;
let pendingTexts = [];

// イベントリスナーを設定
window.addEventListener('DOMContentLoaded', () => {
    connect();
    setupCommentInput();
    setAudioVolume(0.3);
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

    // PCMバイナリデータとして処理
    blob.arrayBuffer().then(arrayBuffer => {
        playAudioBuffer(arrayBuffer);
    }).catch(error => {
        addLog('error', `音声データ処理エラー: ${error.message}`);
    });
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

// ==========================================
// Audio Context 初期化
// ==========================================
async function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100
        });
        // GainNodeを作成（音量制御用）
        gainNode = audioContext.createGain();
        gainNode.gain.value = audioVolume;
        gainNode.connect(audioContext.destination);
        
        // Analyserノードを作成（リップシンク用周波数分析）
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        gainNode.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        // リップシンク分析開始
        startLipSyncAnalysis();
        
        addLog('info', 'AudioContext initialized @ 44.1kHz');
    }
}

// ==========================================
// 音声バッファ再生
// ==========================================
async function playAudioBuffer(pcmData) {
    if (!audioContext) await initAudio();

    // PCM int16 バイナリを Float32 に変換
    const int16Array = new Int16Array(pcmData);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = audioContext.createBuffer(1, float32Array.length, 44100);
    audioBuffer.getChannelData(0).set(float32Array);

    audioQueue.push(audioBuffer);
    if (!isPlaying) {
        playNextInQueue();
    }
}

// ==========================================
// キューの次の音声を再生
// ==========================================
function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        updateStatus('connected', '接続済み（待機）');
        return;
    }

    isPlaying = true;
    const buffer = audioQueue.shift();
    
    currentSource = audioContext.createBufferSource();
    currentSource.buffer = buffer;
    currentSource.connect(gainNode);
    
    currentSource.onended = () => {
        playNextInQueue();
    };

    const duration = buffer.duration;
    totalAudioTime += duration;

    currentSource.start();
    updateStatus('speaking', '再生中');
}

// ==========================================
// 音声停止
// ==========================================
function stopAudio() {
    if (currentSource) {
        currentSource.stop();
        currentSource = null;
    }
    audioQueue = [];
    isPlaying = false;
}

// ==========================================
// テキスト入力UI のセットアップ
// ==========================================
function setupCommentInput() {
    // UI なし - コメント生成のみ実装
}

// ==========================================
// 非同期コメント生成
// ==========================================
async function generateCommentAsync(text) {
    commentGenerationAbortController = new AbortController();

    try {
        // サーバーにテキストを送信（WebSocketを使用）
        if (!ws) {
            addLog('error', 'WebSocketが接続されていません');
            return;
        }

        // 音声生成リクエストを送信
        ws.send(JSON.stringify({
            type: 'audio_request',
            text: text,
            emotion: 'neutral'
        }));

        addLog('info', `非同期生成開始: "${text}"`);
        updateStatus('processing', 'コメント生成中...');

        // キャンセル検出用のPromiseを作成
        const cancelPromise = new Promise((_, reject) => {
            commentGenerationAbortController.signal.addEventListener('abort', () => {
                reject(new DOMException('キャンセルされました', 'AbortError'));
            });
        });

        // タイムアウト設定（30秒）
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('生成タイムアウト')), 30000)
        );

        // いずれか先に完了したもので処理
        await Promise.race([
            new Promise(resolve => setTimeout(resolve, 2000)), // ダミー待機
            cancelPromise,
            timeoutPromise
        ]);

    } catch (error) {
        if (error.name === 'AbortError') {
            addLog('warning', 'コメント生成がキャンセルされました');
        } else {
            addLog('error', `コメント生成エラー: ${error.message}`);
        }
    } finally {
        // キューから削除
        const index = pendingTexts.indexOf(text);
        if (index > -1) {
            pendingTexts.splice(index, 1);
        }
        updateCommentQueueDisplay();

        commentGenerationAbortController = null;

        // キューが全て処理されたか確認
        if (pendingTexts.length === 0) {
            updateStatus('connected', '接続済み');
            const sendCommentBtn = document.getElementById('sendCommentBtn');
            const cancelCommentBtn = document.getElementById('cancelCommentBtn');
            if (sendCommentBtn) {
                sendCommentBtn.disabled = false;
                cancelCommentBtn.style.display = 'none';
            }
        }
    }
}

// ==========================================
// コメントキュー表示更新
// ==========================================
function updateCommentQueueDisplay() {
    const queueDiv = document.getElementById('commentQueue');
    if (queueDiv) {
        if (pendingTexts.length === 0) {
            queueDiv.textContent = '';
        } else {
            queueDiv.textContent = `⏳ キュー: ${pendingTexts.length}件`;
        }
    }
}

// ==========================================
// 音量設定
// ==========================================
function setAudioVolume(volume) {
    // 0.0～1.0の範囲に制限
    audioVolume = Math.max(0.0, Math.min(1.0, volume));
    
    if (gainNode) {
        gainNode.gain.value = audioVolume;
    }
    
    addLog('info', `音量設定: ${(audioVolume * 100).toFixed(0)}%`);
}

// 現在の音量を取得
function getAudioVolume() {
    return audioVolume;
}

// ==========================================
// リップシンク周波数分析（Cubism SDK用）
// ==========================================
function startLipSyncAnalysis() {
    if (!analyser || !dataArray) return;
    
    const analyzeLipSync = () => {
        if (!isPlaying) {
            updateLipSyncValue(0);
            requestAnimationFrame(analyzeLipSync);
            return;
        }
        
        analyser.getByteFrequencyData(dataArray);
        
        // 低周波数領域のエネルギーから口の開き具合を計算
        let lowFreqEnergy = 0;
        const lowFreqBins = Math.floor(analyser.frequencyBinCount * 0.3);
        
        for (let i = 0; i < lowFreqBins; i++) {
            lowFreqEnergy += dataArray[i];
        }
        
        // 正規化（0-1）
        const lipSyncValue = Math.min(1.0, lowFreqEnergy / lowFreqBins / 255);
        
        // Cubism SDK のリップシンク値を更新
        updateLipSyncValue(lipSyncValue);
        
        requestAnimationFrame(analyzeLipSync);
    };
    
    analyzeLipSync();
}