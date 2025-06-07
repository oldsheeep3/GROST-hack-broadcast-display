// 音声再生中のdB値を取得し、window.dispatchEventで通知

(function() {
    const audio = document.getElementById('main-audio');
    if (!audio) return;

    let ctx, src, analyser, dataArray, rafId;

    function startAnalyser() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (!src){
            src = ctx.createMediaElementSource(audio);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            src.connect(analyser);
            analyser.connect(ctx.destination);
        }

        function analyse() {
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                let v = (dataArray[i] - 128) / 128;
                sum += v * v;
            }
            let rms = Math.sqrt(sum / dataArray.length);
            let db = 20 * Math.log10(rms + 1e-8); // dB値
            // dB値をイベントで通知
            window.dispatchEvent(new CustomEvent('voice-db', { detail: { db, rms } }));
            rafId = requestAnimationFrame(analyse);
        }
        analyse();
    }

    audio.addEventListener('play', startAnalyser);
    audio.addEventListener('pause', stopAnalyser);
    audio.addEventListener('ended', stopAnalyser);

    function stopAnalyser() {
        if (rafId) cancelAnimationFrame(rafId);
        // if (ctx) ctx.close();
        // ctx = null;
        rafId = null;
    }
})();